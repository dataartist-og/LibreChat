import type { VisualizationArtifactType } from '@librechat/data-schemas';

type SanitizedVisualization = {
  canonicalSourceText: string;
  canonicalSourceMimeType: string;
  compiledRenderText: string;
  compiledRenderMimeType: string;
  warnings: string[];
};

const iframePattern = /<iframe\b[\s\S]*?<\/iframe>/gi;
const basePattern = /<base\b[^>]*>/gi;
const refreshMetaPattern = /<meta\b[^>]*http-equiv=["']?refresh["']?[^>]*>/gi;
const externalScriptPattern = /<script\b[^>]*\bsrc\s*=\s*(['"])(.*?)\1[^>]*>[\s\S]*?<\/script>/gi;
const externalUrlAttributePattern =
  /\s(?:src|href|action|poster|xlink:href)\s*=\s*(["'])(https?:\/\/|\/\/)[\s\S]*?\1/gi;
const dangerousTargetPattern = /\starget\s*=\s*(["'])_(?:top|parent)\1/gi;
const svgScriptPattern = /<script\b[\s\S]*?<\/script>/gi;
const svgForeignObjectPattern = /<foreignObject\b[\s\S]*?<\/foreignObject>/gi;
const svgEventHandlerPattern = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const svgJavascriptHrefPattern =
  /\s(?:href|xlink:href)\s*=\s*(["'])(?:javascript:|https?:\/\/|\/\/)[\s\S]*?\1/gi;

function ensureHtmlDocument(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '<!DOCTYPE html><html><head></head><body></body></html>';
  }

  if (/<html[\s>]/i.test(trimmed)) {
    return trimmed;
  }

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '</head>',
    '<body>',
    trimmed,
    '</body>',
    '</html>',
  ].join('');
}

function injectHtmlMeta(html: string, csp: string): string {
  const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1" />';
  const cspTag = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;

  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${viewport}${cspTag}`);
  }

  return html.replace(
    /<html([^>]*)>/i,
    `<html$1><head>${viewport}${cspTag}</head>`,
  );
}

export function sanitizeHtmlApp(value: string): SanitizedVisualization {
  const warnings: string[] = [];
  const html = ensureHtmlDocument(value);

  const sanitized = injectHtmlMeta(
    html
      .replace(externalScriptPattern, () => {
        warnings.push('Removed external script tags from visualization.');
        return '';
      })
      .replace(iframePattern, () => {
        warnings.push('Removed nested iframes from visualization.');
        return '';
      })
      .replace(basePattern, () => {
        warnings.push('Removed base tags from visualization.');
        return '';
      })
      .replace(refreshMetaPattern, () => {
        warnings.push('Removed refresh meta tags from visualization.');
        return '';
      })
      .replace(externalUrlAttributePattern, () => {
        warnings.push('Removed remote resource URLs from visualization.');
        return '';
      })
      .replace(dangerousTargetPattern, ''),
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src data: blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self';",
  );

  return {
    canonicalSourceText: value,
    canonicalSourceMimeType: 'text/html',
    compiledRenderText: sanitized,
    compiledRenderMimeType: 'text/html',
    warnings,
  };
}

function coerceSvg(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/<svg\b[\s\S]*<\/svg>/i);
  if (match) {
    return match[0];
  }
  return trimmed;
}

export function sanitizeSvg(value: string): SanitizedVisualization {
  const warnings: string[] = [];
  const svg = coerceSvg(value)
    .replace(svgScriptPattern, () => {
      warnings.push('Removed script tags from SVG visualization.');
      return '';
    })
    .replace(svgForeignObjectPattern, () => {
      warnings.push('Removed foreignObject tags from SVG visualization.');
      return '';
    })
    .replace(svgEventHandlerPattern, () => {
      warnings.push('Removed inline event handlers from SVG visualization.');
      return '';
    })
    .replace(svgJavascriptHrefPattern, () => {
      warnings.push('Removed unsafe href attributes from SVG visualization.');
      return '';
    });

  if (!svg.trim().startsWith('<svg')) {
    throw new Error('Visualization SVG output is malformed');
  }

  return {
    canonicalSourceText: value,
    canonicalSourceMimeType: 'image/svg+xml',
    compiledRenderText: svg,
    compiledRenderMimeType: 'image/svg+xml',
    warnings,
  };
}

export function sanitizeMermaid(value: string): SanitizedVisualization {
  const content = value.trim();
  if (!content) {
    throw new Error('Visualization Mermaid output is empty');
  }

  return {
    canonicalSourceText: content,
    canonicalSourceMimeType: 'text/vnd.mermaid',
    compiledRenderText: content,
    compiledRenderMimeType: 'text/vnd.mermaid',
    warnings: [],
  };
}

export function sanitizeMarkdown(value: string): SanitizedVisualization {
  const content = value.trim();
  if (!content) {
    throw new Error('Visualization markdown output is empty');
  }

  return {
    canonicalSourceText: content,
    canonicalSourceMimeType: 'text/markdown',
    compiledRenderText: content,
    compiledRenderMimeType: 'text/markdown',
    warnings: [],
  };
}

export function sanitizeJsonSpec(value: string): SanitizedVisualization {
  const content = value.trim();
  if (!content) {
    throw new Error('Visualization JSON spec output is empty');
  }

  JSON.parse(content);

  return {
    canonicalSourceText: content,
    canonicalSourceMimeType: 'application/json',
    compiledRenderText: content,
    compiledRenderMimeType: 'application/json',
    warnings: [],
  };
}

export function sanitizeVisualizationByType(
  artifactType: VisualizationArtifactType,
  value: string,
): SanitizedVisualization {
  if (artifactType === 'html_app') {
    return sanitizeHtmlApp(value);
  }

  if (artifactType === 'svg') {
    return sanitizeSvg(value);
  }

  if (artifactType === 'mermaid') {
    return sanitizeMermaid(value);
  }

  if (artifactType === 'markdown_explainer_with_embeds') {
    return sanitizeMarkdown(value);
  }

  if (artifactType === 'json_spec') {
    return sanitizeJsonSpec(value);
  }

  throw new Error(`Artifact type "${artifactType}" requires a dedicated binary generation path.`);
}
