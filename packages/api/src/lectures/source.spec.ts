import { Readable } from 'node:stream';
import { load } from 'cheerio';
import { Response } from 'node-fetch';
import type { RequestInit } from 'node-fetch';
import * as domain from '~/auth/domain';
import {
  assertPublicSourceUrl,
  fetchPublicSource,
  findSourcePassage,
  normalizeSourceUrl,
  parseSource,
  selectQuestionPassages,
} from './source';

const source = { id: 'chess', title: 'Chess', url: 'https://arxiv.org/html/2111.09259v3' };
const fixture = `<html><head><title>Chess research</title><script>evil()</script></head><body><article>
<h1>Chess knowledge</h1><section id="S4"><h2 id="S4.h">Probing</h2>
<p id="S4.p1">A probe can recover information from activations without proving that the policy uses the concept.</p>
<p>The second paragraph should keep its own generated identifier and never shadow the parent section.</p>
<figure id="F2"><img src="figure.png" onerror="evil()" alt="Probe accuracy chart"><figcaption>Figure 2: Accuracy on held-out data is compared across depths and training times.</figcaption></figure>
<img src="http://127.0.0.1/admin"><a href="javascript:evil()">bad</a><iframe src="https://evil.test"></iframe>
</section></article></body></html>`;

describe('lecture source extraction', () => {
  it('canonicalizes arXiv PDF and abstract URLs to HTML', () => {
    expect(normalizeSourceUrl('https://arxiv.org/pdf/2111.09259v3.pdf#page=4')).toBe(source.url);
    expect(normalizeSourceUrl('https://arxiv.org/abs/2111.09259v3')).toBe(source.url);
  });
  it('preserves public figures and original anchors without active content or duplicate IDs', () => {
    const parsed = parseSource(fixture, source);
    const $ = load(parsed.html);
    expect($('img').length).toBe(1);
    expect($('img').attr('src')).toBe('https://arxiv.org/html/figure.png');
    expect($('img').attr('alt')).toBe('Probe accuracy chart');
    expect($('[id="S4"]').length).toBe(1);
    expect($('[id="F2"]').length).toBe(1);
    expect(parsed.html).not.toMatch(/onerror|javascript:|<script|<iframe/);
    const ids = $('[id]')
      .map((_, node) => $(node).attr('id'))
      .get();
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('retrieves actual paragraph, whole-section, figure, and heading context', () => {
    const parsed = parseSource(fixture, source);
    expect(findSourcePassage(parsed, 'S4.p1')?.text).toContain('without proving');
    expect(findSourcePassage(parsed, '#S4')?.text).toContain('second paragraph');
    expect(findSourcePassage(parsed, 'F2')?.text).toContain('held-out data');
    expect(findSourcePassage(parsed, 'S4.h')?.text).toContain('without proving');
    expect(findSourcePassage(parsed, 'does-not-exist')).toBeUndefined();
    expect(findSourcePassage(parsed, '%malformed')).toBeUndefined();
  });
  it('preserves static SVG figures while stripping active SVG content and external references', () => {
    const parsed = parseSource(
      fixture.replace(
        '</article>',
        '<svg viewBox="0 0 100 100"><defs><path id="curve" d="M0 0 L100 100"/></defs><use href="#curve"/><circle fill="url(https://private.example/a)" cx="50" cy="50" r="20"/><foreignObject><iframe src="http://127.0.0.1"/></foreignObject><animate attributeName="href" to="javascript:evil()"/></svg></article>',
      ),
      source,
    );
    expect(parsed.html).not.toContain('foreignObject');
    expect(parsed.html).not.toContain('<animate');
    expect(parsed.html).not.toContain('private.example');
    const embedded = parseSource(
      '<article><p>A sufficiently long introductory paragraph about this static figure.</p><svg viewBox="0 0 100 100"><path d="M0 0 L100 100"/><use href="#curve"/></svg></article>',
      source,
    );
    expect(embedded.html).toContain('viewBox="0 0 100 100"');
    expect(embedded.html).toContain('d="M0 0 L100 100"');
    expect(embedded.html).toContain('href="#curve"');
  });
  it.each([
    'http://127.0.0.1',
    'http://169.254.169.254/latest',
    'http://[::1]',
    'https://user:pass@example.com',
    'file:///etc/passwd',
    'http://localhost',
    'https://public.test:8443',
  ])('rejects unsafe public source URL %s', async (url) => {
    await expect(assertPublicSourceUrl(url)).rejects.toThrow();
  });
  it('blocks a redirect to a private host before the second request', async () => {
    jest.spyOn(domain, 'resolveHostnameSSRF').mockResolvedValue(false);
    const request = jest.fn(
      async () =>
        new Response(Readable.from(''), {
          status: 302,
          headers: { location: 'http://127.0.0.1/internal' },
        }),
    );
    await expect(
      fetchPublicSource('https://public.example/article', undefined, request),
    ).rejects.toThrow('public HTTP');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects non-HTML and oversized responses', async () => {
    jest.spyOn(domain, 'resolveHostnameSSRF').mockResolvedValue(false);
    const pdf = async () =>
      new Response(Readable.from('pdf'), { headers: { 'content-type': 'application/pdf' } });
    await expect(fetchPublicSource('https://public.example/paper', undefined, pdf)).rejects.toThrow(
      'readable HTML',
    );
    const large = async () =>
      new Response(Readable.from('html'), {
        headers: { 'content-type': 'text/html', 'content-length': '5000000' },
      });
    await expect(
      fetchPublicSource('https://public.example/paper', undefined, large),
    ).rejects.toThrow('4 MB');
  });
  it('uses the byte limit, manual redirects, cancellation, and protected connection agent', async () => {
    jest.spyOn(domain, 'resolveHostnameSSRF').mockResolvedValue(false);
    const request = jest.fn(async (_url: string, options: RequestInit) => {
      expect(options.redirect).toBe('manual');
      expect(options.size).toBe(4 * 1024 * 1024);
      expect(options.signal).toBeDefined();
      expect(options.agent).toBeDefined();
      return new Response(fixture, { headers: { 'content-type': 'text/html' } });
    });
    await expect(
      fetchPublicSource('https://public.example/paper', undefined, request),
    ).resolves.toMatchObject({ html: fixture });
  });
});

describe('question-based paper retrieval', () => {
  const paper = parseSource(
    `<article><h1>A controlled intervention study</h1>
    <h2>Introduction</h2><p id="intro">${'This introduction discusses general motivation and the intellectual history of the field. '.repeat(30)}</p>
    <h2>Datasets</h2><p id="data">Forty held-out board positions formed the test dataset; the training split contained separate positions.</p>
    <h2>Experimental procedure</h2><p id="methods">The protocol changed one internal activation and compared the response against a matched control intervention.</p>
    <h2>Findings</h2><table id="outcomes"><caption>Held-out evaluation</caption><tr><th>Intervention</th><th>Accuracy</th></tr><tr><td>Matched control baseline</td><td>52 percent</td></tr><tr><td>Targeted activation change</td><td>68 percent</td></tr></table>
    <h2>Limitations</h2><p id="limits">The experiment evaluates one model and a narrow board distribution; generalization beyond this setting was not tested.</p>
    <h2>Historical background</h2><p id="history">Astronomical observations of quasars concern distant galaxies and are unrelated to this intervention.</p>
    </article>`,
    source,
  );

  it('finds late methods, data, outcome tables, and limitations instead of filling the budget with the introduction', () => {
    const passages = selectQuestionPassages(
      paper,
      'Which dataset did they use, how was the experiment set up, and what were the outcomes?',
      [],
      1000,
    );
    const anchors = passages.map((passage) => passage.anchor);
    expect(anchors).toEqual(expect.arrayContaining(['data', 'methods', 'outcomes', 'limits']));
    expect(anchors).not.toContain('intro');
    expect(anchors).not.toContain('history');
    expect(passages.reduce((total, passage) => total + passage.text.length, 0)).toBeLessThanOrEqual(
      1000,
    );
  });

  it('preserves table labels and cell boundaries for result interpretation', () => {
    const table = paper.passages.find((passage) => passage.anchor === 'outcomes');
    expect(table?.kind).toBe('table');
    expect(table?.text).toContain('Intervention | Accuracy');
    expect(table?.text).toContain('Matched control baseline | 52 percent');
    expect(findSourcePassage(paper, 'outcomes')).toEqual(table);
  });

  it('prioritizes an explicit selection and adds question-relevant evidence outside it', () => {
    const introduction = findSourcePassage(paper, 'intro');
    expect(introduction).toBeDefined();
    const passages = selectQuestionPassages(
      paper,
      'What outcomes were measured?',
      introduction ? [introduction] : [],
    );
    expect(passages[0].anchor).toBe('intro');
    expect(passages.some((passage) => passage.anchor === 'outcomes')).toBe(true);
    expect(new Set(passages.map((passage) => passage.anchor)).size).toBe(passages.length);
  });

  it('returns no unrelated passages for an unmatched specific question', () => {
    expect(selectQuestionPassages(paper, 'Discuss zebrafish aquaculture')).toEqual([]);
  });

  it('provides an evidence overview for a broad source question', () => {
    const passages = selectQuestionPassages(paper, 'Summarize this paper');
    expect(passages.map((passage) => passage.anchor)).toEqual(
      expect.arrayContaining(['data', 'methods', 'outcomes', 'limits']),
    );
  });

  it('caps the total text even when many highly relevant passages or an oversized priority are present', () => {
    const long = parseSource(
      `<article><h2>Results</h2>${Array.from(
        { length: 12 },
        (_, index) =>
          `<p id="result-${index}">${'An intervention improved accuracy against the baseline. '.repeat(100)}</p>`,
      ).join('')}</article>`,
      source,
    );
    const selected = selectQuestionPassages(long, 'What were the results?', [], 50000);
    expect(selected.reduce((total, passage) => total + passage.text.length, 0)).toBeLessThanOrEqual(
      20000,
    );
    expect(selectQuestionPassages(long, 'Results', long.passages, 400)[0].text).toHaveLength(400);
    expect(selectQuestionPassages(long, 'Results', [], 0)).toEqual([]);
  });
});
