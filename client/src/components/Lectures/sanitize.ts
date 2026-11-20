import DOMPurify from 'dompurify';

const policy =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

const styles = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0 auto; max-width: 880px; padding: 32px 28px 160px; background: #fffdf8; color: #252825; font: 18px/1.75 Georgia, 'Times New Roman', serif; overflow-wrap: anywhere; }
  h1,h2,h3,h4,h5,h6 { font-family: system-ui,sans-serif; line-height: 1.3; margin: 1.8em 0 .7em; color: #1a3836; }
  h1 { font-size: 2em; } h2 { font-size: 1.5em; } h3 { font-size: 1.2em; }
  p { margin: 1em 0; } a { color: #176963; text-underline-offset: .15em; }
  figure { margin: 2em 0; } img,svg { max-width: 100%; height: auto; } figcaption { font-size: .88em; line-height: 1.55; }
  pre { white-space: pre-wrap; padding: 16px; background: #f0eee7; font-size: .8em; } code { font-size: .88em; }
  table { display: block; overflow: auto; max-width: 100%; border-collapse: collapse; font-size: .85em; } th,td { padding: 8px; border-bottom: 1px solid #ddd; }
  math[display='block'],.ltx_equation,.ltx_equationgroup { display: block; overflow: auto; margin: 1.5em 0; }
  .ltx_tag_equation { float: right; margin-left: 1em; } .ltx_note_content { font-size: .85em; }
  [data-lecture-focus] { outline: 3px solid #d5a33e; outline-offset: 8px; background: #fff4ce; scroll-margin-top: 32px; }
  ::selection { background: #c8e6df; }
  @media (max-width: 520px) { body { padding: 24px 18px 100px; font-size: 16px; } }
`;

function isPublicHost(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[|\]$/g, '');
  if (host.includes(':')) {
    return /^[23][a-f\d]{3}:/.test(host) && !/^(2001:(?:db8|0|10|20):|2002:)/.test(host);
  }
  if (
    !host.includes('.') ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid)$/.test(host)
  ) {
    return false;
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return true;
  }
  const [a, b, c] = host.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

/** Resolves source URLs without giving srcdoc access to application-relative routes. */
export function resolveSourceUrl(value: string, sourceUrl: string, image = false): string | null {
  if (image && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z\d+/=\s]+$/i.test(value)) {
    return value;
  }
  try {
    const source = new URL(sourceUrl);
    const resolved = new URL(value, source);
    if (
      !['https:', 'http:'].includes(resolved.protocol) ||
      resolved.username ||
      resolved.password ||
      !isPublicHost(resolved.hostname)
    ) {
      return null;
    }
    if (image) {
      return resolved.protocol === 'https:' ? resolved.href : null;
    }
    if (
      resolved.origin === source.origin &&
      resolved.pathname === source.pathname &&
      resolved.search === source.search &&
      resolved.hash
    ) {
      return resolved.hash;
    }
    return resolved.href;
  } catch {
    return null;
  }
}

export function createReaderDocument(html: string, sourceUrl: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    RETURN_TRUSTED_TYPE: false,
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    FORBID_TAGS: [
      'script',
      'style',
      'link',
      'base',
      'meta',
      'form',
      'input',
      'button',
      'select',
      'textarea',
      'iframe',
      'object',
      'embed',
      'video',
      'audio',
      'source',
      'track',
      'foreignObject',
      'animate',
      'animateMotion',
      'animateTransform',
      'set',
    ],
    FORBID_ATTR: [
      'style',
      'srcset',
      'srcdoc',
      'ping',
      'formaction',
      'action',
      'autofocus',
      'contenteditable',
      'download',
      'data-lecture-focus',
    ],
  });
  const parsed = new DOMParser().parseFromString(sanitized, 'text/html');
  parsed.querySelectorAll('nav, footer').forEach((element) => element.remove());
  const content = parsed.querySelector('main, article, [role="main"]') ?? parsed.body;
  content.querySelectorAll('*').forEach((element) => {
    element.removeAttribute('data-lecture-focus');
    for (const attribute of Array.from(element.attributes)) {
      if (
        /url\(/i.test(attribute.value) &&
        !/^url\(\s*['"]?#[\w:.-]+['"]?\s*\)$/i.test(attribute.value)
      ) {
        element.removeAttribute(attribute.name);
      }
    }
    for (const attribute of ['href', 'xlink:href', 'src', 'poster', 'background']) {
      const value = element.getAttribute(attribute);
      if (value === null) {
        continue;
      }
      const isLink = element.tagName.toLowerCase() === 'a' && attribute === 'href';
      const isLocalReference = !isLink && attribute.includes('href') && value.startsWith('#');
      const resolved = isLocalReference ? value : resolveSourceUrl(value, sourceUrl, !isLink);
      if (resolved) {
        element.setAttribute(attribute, resolved);
      } else {
        element.removeAttribute(attribute);
      }
    }
    if (element.tagName.toLowerCase() === 'a') {
      element.setAttribute('rel', 'noopener noreferrer');
      element.setAttribute(
        'target',
        element.getAttribute('href')?.startsWith('#') ? '_self' : '_blank',
      );
    }
    if (element.tagName.toLowerCase() === 'img') {
      element.setAttribute('referrerpolicy', 'no-referrer');
    }
  });
  const body = content === parsed.body ? content.innerHTML : content.outerHTML;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body>${body}</body></html>`;
}

export function sourcePassageUrl(url: string, anchor?: string): string {
  const parsed = new URL(url);
  if (anchor) {
    const fragment = anchor.replace(/^#/, '');
    parsed.hash = fragment.startsWith('study-p-') ? '' : fragment;
  } else if (parsed.hash.startsWith('#study-p-')) {
    parsed.hash = '';
  }
  return parsed.href;
}

/** Maps an actual text selection to its closest source ID, without copying source text. */
export function selectedSourceAnchor(
  document: Document,
  selection: Pick<Selection, 'anchorNode' | 'isCollapsed' | 'toString'> | null,
): string | null {
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    return null;
  }
  const node = selection.anchorNode;
  if (!node || node.ownerDocument !== document) {
    return null;
  }
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  const content = document.querySelector('main, article, [role="main"]') ?? document.body;
  if (!element || !content.contains(element)) {
    return null;
  }
  const anchored = element.closest('[id]');
  return anchored && content.contains(anchored) && anchored.id ? anchored.id : null;
}

/** Returns only an observed ID or a nearby readable block, never a guessed text match. */
export function highlightSourceAnchor(document: Document, anchor?: string): Element | null {
  document
    .querySelectorAll('[data-lecture-focus]')
    .forEach((element) => element.removeAttribute('data-lecture-focus'));
  if (!anchor) {
    return null;
  }
  let id = anchor.replace(/^#/, '');
  try {
    id = decodeURIComponent(id);
  } catch {
    return null;
  }
  const target = document.getElementById(id);
  if (!target) {
    return null;
  }
  const block =
    target.closest('figure, p, li, td, th') ??
    (target.textContent?.trim() || target.querySelector('img, math, svg')
      ? target
      : (target.nextElementSibling ?? target));
  block.setAttribute('data-lecture-focus', 'true');
  block.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  return block;
}
