import { sanitizeHtmlApp, sanitizeSvg } from './sanitize';

describe('visualization sanitization', () => {
  it('removes unsafe html constructs and injects a strict CSP', () => {
    const sanitized = sanitizeHtmlApp(`
      <html>
        <head></head>
        <body>
          <script src="https://example.com/app.js"></script>
          <iframe src="https://example.com/embed"></iframe>
          <a href="https://example.com">remote link</a>
          <div>Safe body</div>
        </body>
      </html>
    `);

    expect(sanitized.compiledRenderText).toContain('Content-Security-Policy');
    expect(sanitized.compiledRenderText).toContain('Safe body');
    expect(sanitized.compiledRenderText).not.toContain('https://example.com/app.js');
    expect(sanitized.compiledRenderText).not.toContain('<iframe');
    expect(sanitized.warnings.length).toBeGreaterThan(0);
  });

  it('removes unsafe svg constructs', () => {
    const sanitized = sanitizeSvg(`
      <svg viewBox="0 0 10 10" onclick="alert(1)">
        <script>alert(1)</script>
        <foreignObject>bad</foreignObject>
        <circle cx="5" cy="5" r="4" />
      </svg>
    `);

    expect(sanitized.compiledRenderText).toContain('<circle');
    expect(sanitized.compiledRenderText).not.toContain('<script');
    expect(sanitized.compiledRenderText).not.toContain('onclick=');
    expect(sanitized.compiledRenderText).not.toContain('<foreignObject');
  });
});
