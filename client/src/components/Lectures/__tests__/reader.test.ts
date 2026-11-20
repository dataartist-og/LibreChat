import {
  createReaderDocument,
  highlightSourceAnchor,
  resolveSourceUrl,
  selectedSourceAnchor,
  sourcePassageUrl,
} from '../sanitize';

const sourceUrl = 'https://arxiv.org/html/2602.10067v3';
const read = (html: string) =>
  new DOMParser().parseFromString(createReaderDocument(html, sourceUrl), 'text/html');

describe('source reader isolation', () => {
  it('preserves original headings, figure IDs, and MathML while stripping executable content', () => {
    const result = read(
      `<article><h2 id="S3">Original heading</h2><figure id="S3.F3"><img src="image.png" onerror="steal()"><figcaption>Original caption</figcaption></figure><math><mi>x</mi><mo>=</mo><mn>1</mn></math><script>alert(1)</script><iframe src="https://evil.test"></iframe><form action="/api"><input><button>Send</button></form><p style="background:url(https://evil.test)" onclick="steal()">Original prose</p><svg><foreignObject><div>Unsafe</div></foreignObject><animate attributeName="href" values="javascript:alert(1)" /></svg></article>`,
    );
    expect(result.getElementById('S3')?.textContent).toBe('Original heading');
    expect(result.getElementById('S3.F3')?.querySelector('figcaption')?.textContent).toBe(
      'Original caption',
    );
    expect(result.querySelector('math mi')?.textContent).toBe('x');
    expect(
      result.querySelector('script,iframe,form,input,button,foreignObject,animate'),
    ).toBeNull();
    expect(result.querySelector('[onclick],[onerror],[style]')).toBeNull();
    expect(
      result.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content'),
    ).toContain("script-src 'none'");
    expect(result.querySelectorAll('style')).toHaveLength(1);
  });

  it('ignores a hostile base URL and resolves images and references against the fetched source', () => {
    const result = read(
      '<base href="https://evil.test"><article><img src="figures/plot.svg"><a href="#S3">Internal</a><a href="/abs/2602.10067">Paper</a><a href="javascript:alert(1)">Unsafe</a></article>',
    );
    expect(result.querySelector('base')).toBeNull();
    expect(result.querySelector('img')?.getAttribute('src')).toBe(
      'https://arxiv.org/html/figures/plot.svg',
    );
    const links = result.querySelectorAll('a');
    expect(links[0].getAttribute('href')).toBe('#S3');
    expect(links[1].getAttribute('href')).toBe('https://arxiv.org/abs/2602.10067');
    expect(links[1].getAttribute('rel')).toBe('noopener noreferrer');
    expect(links[2].hasAttribute('href')).toBe(false);
  });

  it('rejects active, credentialed, and application-local URLs but retains safe raster data images', () => {
    expect(resolveSourceUrl('javascript:alert(1)', sourceUrl)).toBeNull();
    expect(resolveSourceUrl('data:text/html,attack', sourceUrl)).toBeNull();
    expect(resolveSourceUrl('https://user:secret@evil.test/', sourceUrl)).toBeNull();
    expect(resolveSourceUrl('/api/key', sourceUrl)).toBe('https://arxiv.org/api/key');
    expect(resolveSourceUrl('http://example.test/image.png', sourceUrl, true)).toBeNull();
    expect(resolveSourceUrl('data:image/png;base64,AA==', sourceUrl, true)).toBe(
      'data:image/png;base64,AA==',
    );
    expect(
      resolveSourceUrl('data:image/svg+xml,<svg onload="alert(1)"/>', sourceUrl, true),
    ).toBeNull();
  });

  it.each([
    'https://127.0.0.1/secret',
    'https://2130706433/secret',
    'https://0x7f000001/secret',
    'https://10.0.0.1/secret',
    'https://172.20.0.1/secret',
    'https://192.168.0.1/secret',
    'https://169.254.169.254/latest',
    'https://100.64.0.1/secret',
    'https://localhost./secret',
    'https://printer.local/secret',
    'https://[::1]/secret',
    'https://[::ffff:127.0.0.1]/secret',
    'https://[fc00::1]/secret',
    'https://[fe80::1]/secret',
  ])('blocks local and private image requests: %s', (url) => {
    expect(resolveSourceUrl(url, sourceUrl, true)).toBeNull();
  });

  it('retains public scholarly images while blocking external SVG paint URLs', () => {
    const result = read(
      '<article><img src="https://arxiv.org/html/2602.10067v3/intro.png"><svg><path fill="url(https://127.0.0.1/secret)"></path><path fill="url(#gradient)"></path></svg></article>',
    );
    expect(result.querySelector('img')?.getAttribute('src')).toBe(
      'https://arxiv.org/html/2602.10067v3/intro.png',
    );
    expect(result.querySelectorAll('path')[0].hasAttribute('fill')).toBe(false);
    expect(result.querySelectorAll('path')[1].getAttribute('fill')).toBe('url(#gradient)');
  });
});

describe('source passage grounding', () => {
  it('highlights actual dotted IDs without selector interpretation, and clears the previous highlight', () => {
    const result = read(
      '<article><p id="S3.SS1">First</p><figure id="S3.F4"><figcaption>Second</figcaption></figure></article>',
    );
    const first = highlightSourceAnchor(result, '#S3.SS1');
    expect(first?.textContent).toBe('First');
    const second = highlightSourceAnchor(result, 'S3.F4');
    expect(second?.tagName).toBe('FIGURE');
    expect(first?.hasAttribute('data-lecture-focus')).toBe(false);
    expect(result.querySelectorAll('[data-lecture-focus]')).toHaveLength(1);
  });

  it('uses a nearby readable block only when the requested anchor actually exists', () => {
    const result = read(
      '<article><a id="known"></a><p>Readable passage</p><h2>Missing</h2></article>',
    );
    expect(highlightSourceAnchor(result, 'known')?.textContent).toBe('Readable passage');
    expect(highlightSourceAnchor(result, 'Missing')).toBeNull();
    expect(result.querySelector('[data-lecture-focus]')).toBeNull();
    expect(highlightSourceAnchor(result, '%invalid')).toBeNull();
    expect(highlightSourceAnchor(result)).toBeNull();
  });

  it('keeps the original source URL and adds the exact evidence fragment', () => {
    expect(sourcePassageUrl(sourceUrl, 'S3.F4')).toBe(`${sourceUrl}#S3.F4`);
    expect(sourcePassageUrl(`${sourceUrl}#old`, '#S3.SS1')).toBe(`${sourceUrl}#S3.SS1`);
  });

  it('omits reader-generated passage IDs from the external original article URL', () => {
    expect(sourcePassageUrl(sourceUrl, 'study-p-12')).toBe(sourceUrl);
    expect(sourcePassageUrl(`${sourceUrl}#S3`, '#study-p-12')).toBe(sourceUrl);
    expect(sourcePassageUrl(`${sourceUrl}#study-p-12`)).toBe(sourceUrl);
  });

  it('maps selected nested text to the nearest actual source ID', () => {
    const result = read(
      '<article id="article"><section id="S3"><p id="S3.p1">A <em>selected passage</em></p><p><strong>Section passage</strong></p></section></article>',
    );
    const selection = {
      anchorNode: result.querySelector('em')!.firstChild,
      isCollapsed: false,
      toString: () => 'selected passage',
    };
    expect(selectedSourceAnchor(result, selection)).toBe('S3.p1');
    expect(
      selectedSourceAnchor(result, {
        ...selection,
        anchorNode: result.querySelector('strong')!,
      }),
    ).toBe('S3');
  });

  it('does not create focus from empty, collapsed, outside, or unanchored selections', () => {
    const result = new DOMParser().parseFromString(
      '<p id="outside">Outside</p><article><p>Unanchored</p></article>',
      'text/html',
    );
    const selection = {
      anchorNode: result.querySelector('article p')!.firstChild,
      isCollapsed: false,
      toString: () => 'Unanchored',
    };
    expect(selectedSourceAnchor(result, selection)).toBeNull();
    expect(selectedSourceAnchor(result, null)).toBeNull();
    expect(selectedSourceAnchor(result, { ...selection, isCollapsed: true })).toBeNull();
    expect(selectedSourceAnchor(result, { ...selection, toString: () => '  ' })).toBeNull();
    expect(
      selectedSourceAnchor(result, { ...selection, anchorNode: result.getElementById('outside') }),
    ).toBeNull();
    expect(selectedSourceAnchor(result, { ...selection, anchorNode: document.body })).toBeNull();
  });
});
