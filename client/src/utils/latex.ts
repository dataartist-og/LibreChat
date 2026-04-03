// Pre-compile all regular expressions for better performance
const MHCHEM_CE_REGEX = /\$\\ce\{/g;
const MHCHEM_PU_REGEX = /\$\\pu\{/g;
const MHCHEM_CE_ESCAPED_REGEX = /\$\\\\ce\{[^}]*\}\$/g;
const MHCHEM_PU_ESCAPED_REGEX = /\$\\\\pu\{[^}]*\}\$/g;
const INLINE_BRACKET_MATH_REGEX = /(?:\\\\|\\)\(([^$\n]+?)(?:\\\\|\\)\)/g;
const BLOCK_BRACKET_MATH_REGEX = /(?:\\\\|\\)\[([\s\S]+?)(?:\\\\|\\)\]/g;
const CURRENCY_REGEX =
  /(?<![\\$])\$(?!\$)(?=\d+(?:,\d{3})*(?:\.\d+)?(?:[KMBkmb])?(?:\s|$|[^a-zA-Z\d]))/g;
const MATH_TYPOGRAPHY_TRIGGER_REGEX =
  /\bZ\/[A-Za-z0-9()+\-^_]+Z\b|\bZ-modules?\b|\b(?:integers?|rationals?|reals?|complex(?: numbers?)?|natural numbers)\s+[ZQRCN]\b|\b(?:in|over|from)\s+Z\b/i;
const INTEGER_QUOTIENT_REGEX = /\bZ\/([A-Za-z0-9()+\-^_]+)Z\b/g;
const Z_MODULE_REGEX = /\bZ-(module|modules)\b/g;
const NAMED_NUMBER_SET_REGEX =
  /\b(integers?|rationals?|reals?|complex(?: numbers?)?|natural numbers)\s+([ZQRCN])\b/gi;
const Z_PREPOSITION_REGEX = /\b(in|over|from)\s+Z\b/g;
const SIMPLE_INLINE_MATH_REGEX = /\$([^$\n]+?)\$/g;
const MATHBB_MACRO_REGEX = /\\mathbb\{([ZQRCN])\}/g;

const DOUBLE_STRUCK_SYMBOLS: Record<string, string> = {
  Z: 'ℤ',
  Q: 'ℚ',
  R: 'ℝ',
  C: 'ℂ',
  N: 'ℕ',
};

/**
 * Escapes mhchem package notation in LaTeX by converting single dollar delimiters to double dollars
 * and escaping backslashes in mhchem commands.
 *
 * @param text - The input text containing potential mhchem notation
 * @returns The processed text with properly escaped mhchem notation
 */
function escapeMhchem(text: string): string {
  // First escape the backslashes in mhchem commands
  let result = text.replace(MHCHEM_CE_REGEX, '$\\\\ce{');
  result = result.replace(MHCHEM_PU_REGEX, '$\\\\pu{');

  // Then convert single dollar mhchem to double dollar
  result = result.replace(MHCHEM_CE_ESCAPED_REGEX, (match) => `$${match}$`);
  result = result.replace(MHCHEM_PU_ESCAPED_REGEX, (match) => `$${match}$`);

  return result;
}

function normalizeBracketMath(text: string): string {
  let result = text.replace(BLOCK_BRACKET_MATH_REGEX, (_match, expression: string) => {
    return `\n$$\n${expression}\n$$\n`;
  });

  result = result.replace(INLINE_BRACKET_MATH_REGEX, (_match, expression: string) => {
    return `$${expression}$`;
  });

  return result;
}

function enhanceMathTypography(text: string): string {
  if (!MATH_TYPOGRAPHY_TRIGGER_REGEX.test(text)) {
    return text;
  }

  let result = text.replace(INTEGER_QUOTIENT_REGEX, (_match, quotient: string) => {
    return `ℤ/${quotient}ℤ`;
  });

  result = result.replace(Z_MODULE_REGEX, (_match, suffix: string) => {
    return `ℤ-${suffix}`;
  });

  result = result.replace(NAMED_NUMBER_SET_REGEX, (_match, label: string, symbol: string) => {
    return `${label} ${DOUBLE_STRUCK_SYMBOLS[symbol.toUpperCase()]}`;
  });

  result = result.replace(Z_PREPOSITION_REGEX, (_match, preposition: string) => {
    return `${preposition} ℤ`;
  });

  return result;
}

function simplifyInlineMathSets(text: string): string {
  return text.replace(SIMPLE_INLINE_MATH_REGEX, (match, expression: string) => {
    if (!expression.includes('\\mathbb{')) {
      return match;
    }

    const simplified = expression.replace(MATHBB_MACRO_REGEX, (_macro, symbol: string) => {
      return DOUBLE_STRUCK_SYMBOLS[symbol] ?? symbol;
    });

    if (simplified.includes('\\')) {
      return match;
    }

    return simplified;
  });
}

/**
 * Efficiently finds all code block regions in the content
 * @param content The content to analyze
 * @returns Array of code block regions [start, end]
 */
function findCodeBlockRegions(content: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  let inlineStart = -1;
  let multilineStart = -1;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    // Check for multiline code blocks
    if (
      char === '`' &&
      i + 2 < content.length &&
      content[i + 1] === '`' &&
      content[i + 2] === '`'
    ) {
      if (multilineStart === -1) {
        multilineStart = i;
        i += 2; // Skip the next two backticks
      } else {
        regions.push([multilineStart, i + 2]);
        multilineStart = -1;
        i += 2;
      }
    }
    // Check for inline code blocks (only if not in multiline)
    else if (char === '`' && multilineStart === -1) {
      if (inlineStart === -1) {
        inlineStart = i;
      } else {
        regions.push([inlineStart, i]);
        inlineStart = -1;
      }
    }
  }

  return regions;
}

/**
 * Preprocesses LaTeX content by normalizing common TeX delimiters and escaping currency indicators.
 * Optimized for high-frequency execution.
 * @param content The input string containing LaTeX expressions.
 * @returns The processed string with escaped currency indicators and converted math delimiters.
 */
export function preprocessLaTeX(content: string): string {
  // Early return for most common case
  if (
    !content.includes('$') &&
    !content.includes('\\(') &&
    !content.includes('\\[') &&
    !MATH_TYPOGRAPHY_TRIGGER_REGEX.test(content)
  ) {
    return content;
  }

  const codeRegions = findCodeBlockRegions(content);
  if (codeRegions.length === 0) {
    let processed = normalizeBracketMath(content);
    processed = enhanceMathTypography(processed);
    processed = simplifyInlineMathSets(processed);
    if (processed.includes('\\ce{') || processed.includes('\\pu{')) {
      processed = escapeMhchem(processed);
    }
    return processed.replace(CURRENCY_REGEX, '\\$');
  }

  let cursor = 0;
  const output: string[] = [];

  for (const [start, end] of codeRegions) {
    if (cursor < start) {
      let segment = normalizeBracketMath(content.slice(cursor, start));
      segment = enhanceMathTypography(segment);
      segment = simplifyInlineMathSets(segment);
      if (segment.includes('\\ce{') || segment.includes('\\pu{')) {
        segment = escapeMhchem(segment);
      }
      output.push(segment.replace(CURRENCY_REGEX, '\\$'));
    }

    output.push(content.slice(start, end + 1));
    cursor = end + 1;
  }

  if (cursor < content.length) {
    let tail = normalizeBracketMath(content.slice(cursor));
    tail = enhanceMathTypography(tail);
    tail = simplifyInlineMathSets(tail);
    if (tail.includes('\\ce{') || tail.includes('\\pu{')) {
      tail = escapeMhchem(tail);
    }
    output.push(tail.replace(CURRENCY_REGEX, '\\$'));
  }

  return output.join('');
}
