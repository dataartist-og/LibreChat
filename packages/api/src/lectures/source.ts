import { Readable } from 'node:stream';
import { load } from 'cheerio';
import fetch from 'node-fetch';
import type { RequestInit, Response } from 'node-fetch';
import type { Agent, AgentOptions } from 'node:http';
import type { LectureSource } from 'librechat-data-provider';
import { isSSRFTarget, resolveHostnameSSRF } from '~/auth/domain';
import { createSSRFSafeAgents } from '~/auth/agent';
import { LectureError } from './schema';

export type SourcePassage = {
  anchor: string;
  section: string;
  text: string;
  originalAnchor: boolean;
  kind?: 'text' | 'table' | 'caption';
};
export type RetrievedSource = {
  id: string;
  title: string;
  url: string;
  html: string;
  passages: SourcePassage[];
};

const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const SOURCE_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 4;
type SourceRequest = (url: string, options: RequestInit) => Promise<Response>;
type LookupAgent = Agent & { options: AgentOptions };
const allowedTags = new Set([
  'article',
  'main',
  'section',
  'div',
  'span',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'a',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'sup',
  'sub',
  'br',
  'hr',
  'figure',
  'figcaption',
  'img',
  'blockquote',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'dl',
  'dt',
  'dd',
  'math',
  'mrow',
  'mi',
  'mn',
  'mo',
  'mfrac',
  'msqrt',
  'mroot',
  'msub',
  'msup',
  'msubsup',
  'munder',
  'mover',
  'munderover',
  'mtable',
  'mtr',
  'mtd',
  'mtext',
  'mspace',
  'semantics',
  'annotation',
  'svg',
  'g',
  'path',
  'text',
  'tspan',
  'line',
  'polyline',
  'polygon',
  'rect',
  'circle',
  'ellipse',
  'defs',
  'symbol',
  'use',
  'clippath',
  'mask',
  'lineargradient',
  'radialgradient',
  'stop',
  'title',
  'desc',
]);
const allowedAttributes = new Set([
  'id',
  'class',
  'title',
  'colspan',
  'rowspan',
  'display',
  'mathvariant',
  'encoding',
  'viewbox',
  'xmlns',
  'd',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'points',
  'transform',
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-opacity',
  'opacity',
  'font-size',
  'font-family',
  'text-anchor',
  'dominant-baseline',
  'clip-path',
  'offset',
  'stop-color',
  'stop-opacity',
  'preserveaspectratio',
]);
const sourceCache = new Map<string, { value: RetrievedSource; expires: number; bytes: number }>();
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
let cachedBytes = 0;

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new LectureError(422, 'Source retrieval was cancelled.');
  let onAbort = () => {};
  try {
    return await new Promise<T>((resolve, reject) => {
      onAbort = () => reject(new LectureError(422, 'Source retrieval timed out or was cancelled.'));
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(resolve, reject);
    });
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

export function normalizeSourceUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname === 'arxiv.org' || url.hostname === 'www.arxiv.org') {
    const paper = url.pathname.match(
      /^\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}(?:v\d+)?)(?:\.pdf)?\/?$/,
    );
    if (paper) {
      url.hostname = 'arxiv.org';
      url.protocol = 'https:';
      url.pathname = `/html/${paper[1]}`;
      url.search = '';
    }
  }
  url.hash = '';
  return url.href;
}

export async function assertPublicSourceUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LectureError(400, 'Source URL is invalid.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port)) ||
    isSSRFTarget(url.hostname) ||
    !url.hostname.includes('.')
  ) {
    throw new LectureError(400, 'Sources must be public HTTP(S) article URLs without credentials.');
  }
  if (await resolveHostnameSSRF(url.hostname)) {
    throw new LectureError(400, 'Source URL resolves to a private or reserved address.');
  }
  return url;
}

export async function fetchPublicSource(
  value: string,
  signal?: AbortSignal,
  request: SourceRequest = fetch,
): Promise<{ html: string; url: string }> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) {
    controller.abort();
  }
  const timer = setTimeout(abort, SOURCE_TIMEOUT_MS);
  const agents = createSSRFSafeAgents();
  (agents.httpAgent as LookupAgent).options.family = 4;
  (agents.httpsAgent as LookupAgent).options.family = 4;
  let current = normalizeSourceUrl(value);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const url = await abortable(assertPublicSourceUrl(current), controller.signal);
      const response = await request(url.href, {
        redirect: 'manual',
        signal: controller.signal,
        size: MAX_SOURCE_BYTES,
        agent: url.protocol === 'https:' ? agents.httpsAgent : agents.httpAgent,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'LibreChat-Lecture-Study/1.0',
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (response.body instanceof Readable) response.body.destroy();
        const location = response.headers.get('location');
        if (!location || hop === MAX_REDIRECTS) {
          throw new LectureError(
            422,
            'Source has too many redirects or a missing redirect target.',
          );
        }
        current = new URL(location, url).href;
        continue;
      }
      if (!response.ok) {
        if (response.body instanceof Readable) response.body.destroy();
        throw new LectureError(422, `Source retrieval failed with HTTP ${response.status}.`);
      }
      const type = response.headers.get('content-type') ?? '';
      if (!/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(type)) {
        if (response.body instanceof Readable) response.body.destroy();
        throw new LectureError(
          422,
          'This source has no readable HTML. Use the publisher or arXiv HTML article URL.',
        );
      }
      const length = Number(response.headers.get('content-length') ?? 0);
      if (length > MAX_SOURCE_BYTES) {
        if (response.body instanceof Readable) response.body.destroy();
        throw new LectureError(422, 'The source exceeds the 4 MB reading limit.');
      }
      return { html: await response.text(), url: url.href };
    }
    throw new LectureError(422, 'Source redirect could not be resolved.');
  } catch (error) {
    if (error instanceof LectureError) {
      throw error;
    }
    throw new LectureError(
      422,
      controller.signal.aborted
        ? 'Source retrieval timed out or was cancelled.'
        : 'Source could not be retrieved safely. Try its public HTML article URL.',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    agents.httpAgent.destroy();
    agents.httpsAgent.destroy();
  }
}

export function parseSource(html: string, source: LectureSource): RetrievedSource {
  const $ = load(html);
  const title = $('h1').first().text().trim() || $('title').text().trim() || source.title;
  $(
    'script,style,link,meta,base,iframe,object,embed,form,input,button,textarea,select,nav,header,footer,noscript,template,foreignObject,animate,animateMotion,animateTransform,set',
  ).remove();
  let content = $('article').first();
  if (!content.length) content = $('main').first();
  if (!content.length) content = $('body');
  content.find('*').each((_, element) => {
    if (element.type !== 'tag') {
      return;
    }
    const node = $(element);
    if (!allowedTags.has(element.tagName.toLowerCase())) {
      node.replaceWith(node.contents());
      return;
    }
    const href = element.tagName === 'a' ? node.attr('href') : undefined;
    const imageSource = element.tagName === 'img' ? node.attr('src') : undefined;
    const imageAlt = element.tagName === 'img' ? node.attr('alt') : undefined;
    const localReference =
      element.tagName === 'use' ? (node.attr('href') ?? node.attr('xlink:href')) : undefined;
    Object.keys(element.attribs).forEach((attribute) => {
      const value = element.attribs[attribute];
      if (
        !allowedAttributes.has(attribute.toLowerCase()) ||
        (/url\(/i.test(value) && !/^url\(\s*['"]?#[\w:.-]+['"]?\s*\)$/i.test(value))
      ) {
        node.removeAttr(attribute);
      }
    });
    if (localReference && /^#[\w:.-]+$/.test(localReference)) {
      node.attr('href', localReference);
    }
    if (element.tagName === 'img') {
      try {
        const image = new URL(imageSource ?? '', source.url);
        if (
          !imageSource ||
          !['http:', 'https:'].includes(image.protocol) ||
          image.username ||
          image.password ||
          isSSRFTarget(image.hostname)
        ) {
          node.remove();
          return;
        }
        node
          .attr('src', image.href)
          .attr('alt', imageAlt || 'Source figure')
          .attr('loading', 'lazy')
          .attr('referrerpolicy', 'no-referrer');
      } catch {
        node.remove();
      }
      return;
    }
    if (!href) {
      return;
    }
    try {
      const link = new URL(href, source.url);
      if (
        ['http:', 'https:'].includes(link.protocol) &&
        !link.username &&
        !link.password &&
        !isSSRFTarget(link.hostname)
      ) {
        node.attr('href', link.href).attr('target', '_blank').attr('rel', 'noopener noreferrer');
      }
    } catch {
      return;
    }
  });
  const passages: SourcePassage[] = [];
  const seen = new Set<string>();
  const existingIds = new Set(
    content
      .find('[id]')
      .map((_, element) => $(element).attr('id'))
      .get(),
  );
  let section = title.slice(0, 500);
  content.find('h1,h2,h3,h4,h5,h6,p,li,figcaption,table,pre').each((index, element) => {
    const node = $(element);
    const tableText = node.is('table')
      ? [
          node.find('caption').text(),
          ...node
            .find('tr')
            .map((_, row) =>
              $(row)
                .children('th,td')
                .map((_, cell) => $(cell).text().replace(/\s+/g, ' ').trim())
                .get()
                .join(' | '),
            )
            .get(),
        ].join('\n')
      : undefined;
    const text = (tableText ?? node.text()).replace(/\s+/g, ' ').trim();
    if (!text) {
      return;
    }
    if (/^h[1-6]$/.test(element.tagName)) {
      section = text.slice(0, 500);
      return;
    }
    const existing = node.attr('id');
    let anchor = existing && !seen.has(existing) ? existing : `study-p-${index}`;
    while (anchor !== existing && existingIds.has(anchor)) {
      anchor = `_${anchor}`;
    }
    node.attr('id', anchor);
    seen.add(anchor);
    let kind: SourcePassage['kind'] = 'text';
    if (node.is('table')) kind = 'table';
    if (node.is('figcaption')) kind = 'caption';
    if (text.length >= 45) {
      passages.push({
        anchor,
        section,
        text: text.slice(0, 5000),
        originalAnchor: anchor === existing,
        kind,
      });
    }
  });
  if (passages.length === 0) {
    throw new LectureError(
      422,
      'No article passages were found. This source may require sign-in or block automated reading.',
    );
  }
  return {
    id: source.id,
    title: title.slice(0, 400),
    url: source.url,
    html: content.html() ?? '',
    passages,
  };
}

export async function retrieveSource(
  source: LectureSource,
  signal?: AbortSignal,
): Promise<RetrievedSource> {
  const key = normalizeSourceUrl(source.url);
  const cached = sourceCache.get(key);
  if (cached && cached.expires > Date.now()) {
    sourceCache.delete(key);
    sourceCache.set(key, cached);
    return { ...cached.value, id: source.id };
  }
  if (cached) {
    cachedBytes -= cached.bytes;
    sourceCache.delete(key);
  }
  const fetched = await fetchPublicSource(source.url, signal);
  const value = parseSource(fetched.html, { ...source, url: fetched.url });
  const bytes =
    2 *
    (value.html.length + value.passages.reduce((total, passage) => total + passage.text.length, 0));
  if (bytes <= MAX_CACHE_BYTES) {
    const previous = sourceCache.get(key);
    if (previous) {
      cachedBytes -= previous.bytes;
      sourceCache.delete(key);
    }
    while (sourceCache.size >= 24 || cachedBytes + bytes > MAX_CACHE_BYTES) {
      const oldest = sourceCache.keys().next().value;
      if (!oldest) break;
      cachedBytes -= sourceCache.get(oldest)?.bytes ?? 0;
      sourceCache.delete(oldest);
    }
    sourceCache.set(key, { value, expires: Date.now() + 30 * 60 * 1000, bytes });
    cachedBytes += bytes;
  }
  return value;
}

export function findSourcePassage(
  source: RetrievedSource,
  anchor: string,
): SourcePassage | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(anchor.replace(/^#/, ''));
  } catch {
    return undefined;
  }
  const $ = load(source.html);
  const exact = source.passages.find((passage) => passage.anchor === decoded);
  if (exact) {
    return exact;
  }
  const element = $('[id]')
    .filter((_, node) => $(node).attr('id') === decoded)
    .first();
  const isHeading = element.is('h1,h2,h3,h4,h5,h6');
  const text = (
    isHeading
      ? `${element.text()} ${element.nextUntil('h1,h2,h3,h4,h5,h6').text()}`
      : element.text()
  )
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 45) {
    return undefined;
  }
  const heading = isHeading
    ? element.text().trim()
    : element.find('h1,h2,h3,h4,h5,h6').first().text().trim();
  return {
    anchor: decoded,
    section: (heading || source.title).slice(0, 500),
    text: text.slice(0, 7000),
    originalAnchor: true,
  };
}

export function selectSourcePassages(source: RetrievedSource, limit = 18000): SourcePassage[] {
  const sections = new Map<string, SourcePassage[]>();
  source.passages.forEach((passage) => {
    const group = sections.get(passage.section) ?? [];
    group.push(passage);
    sections.set(passage.section, group);
  });
  const result: SourcePassage[] = [];
  let remaining = limit;
  for (const group of sections.values()) {
    if (remaining <= 200) {
      break;
    }
    const passage = group[0];
    const text = passage.text.slice(0, Math.min(1400, remaining));
    result.push({ ...passage, text });
    remaining -= text.length;
  }
  return result;
}

const queryStopwords = new Set(
  'a an the and or but of to in on at by for from with as is are was were be been it its this that these those i me my we you your they their them can could would should do does did have has had how what which who why when where please explain tell paper article study source selected about use using'.split(
    ' ',
  ),
);
const researchIntents = [
  {
    name: 'data',
    query: /\b(data|datasets?|samples?|corpus|corpora|training set|test set|benchmark)\b/i,
    heading: /\b(data|datasets?|samples?|corpus|corpora|benchmark|materials?)\b/i,
    terms: 'data dataset sample corpus split benchmark training held-out',
  },
  {
    name: 'methods',
    query:
      /\b(methods?|experiments?|setup|protocol|procedure|measure|measurement|evaluate|evaluation|tested|testing|how.*(?:run|test|train|do))\b/i,
    heading: /\b(methods?|experiments?|setup|protocol|procedure|evaluation|implementation)\b/i,
    terms: 'method experiment setup protocol procedure measurement evaluation intervention control',
  },
  {
    name: 'results',
    query:
      /\b(results?|outcomes?|findings?|found|find|show|accuracy|performance|baseline|ablation|effect|compared|comparison)\b/i,
    heading: /\b(results?|outcomes?|findings?|evaluation|ablation|comparison|performance)\b/i,
    terms: 'result outcome finding accuracy performance baseline ablation comparison effect error',
  },
  {
    name: 'limitations',
    query: /\b(limitations?|caveats?|failure|uncertainty|generalization|weakness|validity)\b/i,
    heading: /\b(limitations?|caveats?|discussion|failure|uncertainty|future work)\b/i,
    terms: 'limitation caveat failure uncertainty generalization restriction',
  },
] as const;

function queryTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((word) => word.length > 1 && !queryStopwords.has(word))
    .map((word) => {
      if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
      if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
      return word;
    });
}

/** Rank real source passages by question terms, BM25 length normalization, and research headings. */
export function selectQuestionPassages(
  source: RetrievedSource,
  question: string,
  priority: SourcePassage[] = [],
  limit = 20000,
): SourcePassage[] {
  const requestedTerms = new Set(queryTokens(question).slice(0, 64));
  const overview =
    !requestedTerms.size ||
    /\b(summari[sz]e|overview|main (idea|finding)|explain (this |the )?(paper|study))\b/i.test(
      question,
    );
  const intents = researchIntents.filter((intent) => overview || intent.query.test(question));
  const weights = new Map([...requestedTerms].map((term) => [term, 1]));
  for (const intent of intents) {
    for (const term of queryTokens(intent.terms)) {
      if (!weights.has(term)) weights.set(term, 0.35);
    }
  }
  const documents = source.passages.map((passage, index) => {
    const tokens = queryTokens(passage.text);
    const frequencies = new Map<string, number>();
    for (const token of tokens) {
      if (weights.has(token)) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
    return {
      passage,
      index,
      frequencies,
      length: tokens.length,
      heading: new Set(queryTokens(passage.section)),
    };
  });
  const frequency = new Map<string, number>();
  let totalLength = 0;
  for (const document of documents) {
    totalLength += document.length;
    for (const term of document.frequencies.keys()) {
      frequency.set(term, (frequency.get(term) ?? 0) + 1);
    }
  }
  const averageLength = totalLength / Math.max(1, documents.length) || 1;
  const ranked = documents
    .map((document) => {
      let score = 0;
      let directMatches = 0;
      let expandedMatches = 0;
      for (const [term, weight] of weights) {
        const count = document.frequencies.get(term) ?? 0;
        if (count || document.heading.has(term)) {
          if (requestedTerms.has(term)) directMatches += 1;
          else expandedMatches += 1;
        }
        const documentFrequency = frequency.get(term) ?? 0;
        const idf = Math.log(
          1 + (documents.length - documentFrequency + 0.5) / (documentFrequency + 0.5),
        );
        const normalization = 1.2 * (0.25 + (0.75 * document.length) / averageLength);
        score += weight * idf * ((count * 2.2) / (count + normalization));
        if (document.heading.has(term)) score += 2 * weight;
      }
      const intentHeading = intents.some((intent) => intent.heading.test(document.passage.section));
      const caveatHeading =
        intents.length > 0 && researchIntents[3].heading.test(document.passage.section);
      const overviewHeading =
        overview && /\b(abstract|introduction|conclusion)\b/i.test(document.passage.section);
      if (intentHeading) score += 6;
      if (caveatHeading) score += 2;
      if (overviewHeading) score += 3;
      if (
        document.passage.kind === 'table' &&
        intents.some((intent) => intent.name === 'results')
      ) {
        score += 3;
      }
      if (
        !directMatches &&
        expandedMatches < 2 &&
        !intentHeading &&
        !caveatHeading &&
        !overviewHeading
      )
        score = 0;
      if (
        /\b(references|bibliography|acknowledg)/i.test(document.passage.section) &&
        !/\b(references|bibliography|citations|related work)\b/i.test(question)
      )
        score = 0;
      return { ...document, score };
    })
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const selected: SourcePassage[] = [];
  const anchors = new Set<string>();
  const texts = new Set<string>();
  let remaining = Math.max(0, Math.min(20000, limit));
  const add = (passage: SourcePassage) => {
    if (
      selected.length >= 16 ||
      remaining < 45 ||
      anchors.has(passage.anchor) ||
      texts.has(passage.text)
    )
      return;
    const text = passage.text.slice(0, remaining);
    selected.push({ ...passage, text });
    anchors.add(passage.anchor);
    texts.add(passage.text);
    remaining -= text.length;
  };
  priority.forEach(add);
  for (const intent of intents) {
    const match = ranked.find((document) => intent.heading.test(document.passage.section));
    if (match) add(match.passage);
  }
  if (intents.length) {
    const caveat = ranked.find((document) =>
      researchIntents[3].heading.test(document.passage.section),
    );
    if (caveat) add(caveat.passage);
  }
  for (const document of ranked) add(document.passage);
  return selected;
}
