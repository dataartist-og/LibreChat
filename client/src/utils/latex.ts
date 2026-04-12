// Pre-compile all regular expressions for better performance
const MHCHEM_CE_REGEX = /\$\\ce\{/g;
const MHCHEM_PU_REGEX = /\$\\pu\{/g;
const MHCHEM_CE_ESCAPED_REGEX = /\$\\\\ce\{[^}]*\}\$/g;
const MHCHEM_PU_ESCAPED_REGEX = /\$\\\\pu\{[^}]*\}\$/g;
const INLINE_BRACKET_MATH_REGEX = /(?:\\\\|\\)\(([^$\n]+?)(?:\\\\|\\)\)/g;
const INDENTED_BLOCK_BRACKET_MATH_REGEX =
  /(^|\n)([ \t]*)(?:\\\\|\\)\[\s*\n?([\s\S]+?)\n?[ \t]*(?:\\\\|\\)\](?=\n|$)/g;
const BLOCK_BRACKET_MATH_REGEX = /(?:\\\\|\\)\[([\s\S]+?)(?:\\\\|\\)\]/g;
const CURRENCY_AMOUNT_REGEX = /^\d+(?:,\d{3})*(?:\.\d+)?(?:[KMBkmb])?(?=\s|$|[^a-zA-Z\d])/;
const MATH_TYPOGRAPHY_TRIGGER_REGEX =
  /\bZ\/[A-Za-z0-9()+\-^_]+Z\b|\bZ-modules?\b|\b(?:integers?|rationals?|reals?|complex(?: numbers?)?|natural numbers)\s+[ZQRCN]\b|\b(?:in|over|from)\s+Z\b/i;
const INTEGER_QUOTIENT_REGEX = /\bZ\/([A-Za-z0-9()+\-^_]+)Z\b/g;
const Z_MODULE_REGEX = /\bZ-(module|modules)\b/g;
const NAMED_NUMBER_SET_REGEX =
  /\b(integers?|rationals?|reals?|complex(?: numbers?)?|natural numbers)\s+([ZQRCN])\b/gi;
const Z_PREPOSITION_REGEX = /\b(in|over|from)\s+Z\b/g;
const SIMPLE_INLINE_MATH_REGEX = /\$([^$\n]+?)\$/g;
const MATHBB_MACRO_REGEX = /\\mathbb\{([ZQRCN])\}/g;
const OCR_BIG_DELIMITER_REGEX = /\\(big|Big|bigg|Bigg)\{(\\?[()[\]{}<>|])\}/g;
const OCR_TRAILING_BREAK_REGEX = /\\\\(?=\s*(?:$|[.,;:)\]]))/g;
const OCR_ARTIFACT_TRIGGER_REGEX = /\\(?:big|Big|bigg|Bigg)\{|\\\\(?=\s*(?:$|[.,;:)\]]))/;
const INLINE_MATH_COMMAND_REGEX = /\\(?:[A-Za-z]+|[%$#&_{}])/;
const INLINE_MATH_OPERATOR_REGEX = /\d\s*(?:[+\-*/=<>])\s*(?:\d|[A-Za-z(\\])/;
const INLINE_MATH_DIGIT_VARIABLE_REGEX = /^\d+[a-z](?:\b|(?=\s*[+\-*/=<>]))/;
const INLINE_MATH_STRUCTURE_REGEX = /[_^{}]/;
const SIMPLE_INLINE_VARIABLE_REGEX = /^[A-Za-z]$/;
const INLINE_MATH_RAW_CURRENCY_REGEX = /\$\d/;
const INLINE_MATH_CLOSER_FOLLOW_CHAR_REGEX = /[\s.,;:!?)[\]}]/;

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
  let result = text.replace(
    INDENTED_BLOCK_BRACKET_MATH_REGEX,
    (_match, linePrefix: string, indent: string, expression: string) => {
      const normalizedExpression = normalizeBlockExpression(expression, indent);
      return `${linePrefix}${indent}$$\n${normalizedExpression}\n${indent}$$`;
    },
  );

  result = result.replace(BLOCK_BRACKET_MATH_REGEX, (_match, expression: string) => {
    return `\n$$\n${normalizeLooseBlockExpression(expression)}\n$$\n`;
  });

  result = result.replace(INLINE_BRACKET_MATH_REGEX, (_match, expression: string) => {
    return `$${expression}$`;
  });

  return result;
}

function normalizeLooseBlockExpression(expression: string): string {
  const lines = expression.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  return stripCommonIndent(lines).join('\n');
}

function normalizeBlockExpression(expression: string, indent: string): string {
  const lines = normalizeLooseBlockExpression(expression).split('\n');
  return lines.map((line) => `${indent}${line}`).join('\n');
}

function stripCommonIndent(lines: string[]): string[] {
  const nonEmptyLines = lines.filter((line) => line.trim() !== '');
  if (nonEmptyLines.length === 0) {
    return lines.map(() => '');
  }

  const commonIndent = nonEmptyLines.reduce((smallestIndent, line) => {
    const match = line.match(/^[ \t]*/);
    const currentIndent = match?.[0].length ?? 0;
    return Math.min(smallestIndent, currentIndent);
  }, Number.MAX_SAFE_INTEGER);

  return lines.map((line) => line.slice(Math.min(commonIndent, line.length)));
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

function normalizeOcrMathArtifacts(text: string): string {
  const normalizedDelimiters = text.replace(
    OCR_BIG_DELIMITER_REGEX,
    (_match, size: string, delimiter: string) => {
      return `\\${size}${delimiter}`;
    },
  );

  return normalizedDelimiters.replace(OCR_TRAILING_BREAK_REGEX, '');
}

function startsWithCurrencyAmount(text: string, index: number): boolean {
  return CURRENCY_AMOUNT_REGEX.test(text.slice(index));
}

function looksLikeInlineMathExpression(expression: string): boolean {
  const trimmed = expression.trim();
  if (!trimmed) {
    return false;
  }

  if (INLINE_MATH_RAW_CURRENCY_REGEX.test(trimmed) && !/[A-Za-z\\]/.test(trimmed)) {
    return false;
  }

  return (
    INLINE_MATH_COMMAND_REGEX.test(trimmed) ||
    INLINE_MATH_OPERATOR_REGEX.test(trimmed) ||
    INLINE_MATH_DIGIT_VARIABLE_REGEX.test(trimmed) ||
    INLINE_MATH_STRUCTURE_REGEX.test(trimmed) ||
    SIMPLE_INLINE_VARIABLE_REGEX.test(trimmed)
  );
}

function isLikelyInlineMathCloser(text: string, index: number): boolean {
  const next = text[index + 1] ?? '';
  return next === '' || next === '\n' || INLINE_MATH_CLOSER_FOLLOW_CHAR_REGEX.test(next);
}

function findBlockMathClosing(text: string, openingIndex: number): number {
  for (let index = openingIndex; index < text.length - 1; index += 1) {
    if (text[index] === '\\') {
      index += 1;
      continue;
    }

    if (text[index] === '$' && text[index + 1] === '$') {
      return index;
    }
  }

  return -1;
}

function findInlineMathClosing(text: string, openingIndex: number): number {
  for (let index = openingIndex + 1; index < text.length; index += 1) {
    const current = text[index];
    if (current === '\n') {
      break;
    }

    if (current === '\\') {
      index += 1;
      continue;
    }

    if (current !== '$' || text[index + 1] === '$' || !isLikelyInlineMathCloser(text, index)) {
      continue;
    }

    const expression = text.slice(openingIndex + 1, index);
    if (looksLikeInlineMathExpression(expression)) {
      return index;
    }
  }

  return -1;
}

function escapeCurrencyInsideMath(expression: string): string {
  let result = '';

  for (let index = 0; index < expression.length; index += 1) {
    const current = expression[index];
    if (current === '\\') {
      result += current;
      if (index + 1 < expression.length) {
        result += expression[index + 1];
        index += 1;
      }
      continue;
    }

    if (current === '$' && expression[index + 1] !== '$' && startsWithCurrencyAmount(expression, index + 1)) {
      result += '\\$';
      continue;
    }

    result += current;
  }

  return result;
}

function escapeCurrencyOutsideCode(text: string): string {
  let result = '';

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    if (current === '\\') {
      result += current;
      if (index + 1 < text.length) {
        result += text[index + 1];
        index += 1;
      }
      continue;
    }

    if (current !== '$') {
      result += current;
      continue;
    }

    if (text[index + 1] === '$') {
      const closingIndex = findBlockMathClosing(text, index + 2);
      if (closingIndex >= 0) {
        const expression = text.slice(index + 2, closingIndex);
        result += `$$${escapeCurrencyInsideMath(expression)}$$`;
        index = closingIndex + 1;
        continue;
      }

      result += '$$';
      index += 1;
      continue;
    }

    const closingIndex = findInlineMathClosing(text, index);
    if (closingIndex >= 0) {
      const expression = text.slice(index + 1, closingIndex);
      result += `$${escapeCurrencyInsideMath(expression)}$`;
      index = closingIndex;
      continue;
    }

    if (startsWithCurrencyAmount(text, index + 1)) {
      result += '\\$';
      continue;
    }

    result += current;
  }

  return result;
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
    !MATH_TYPOGRAPHY_TRIGGER_REGEX.test(content) &&
    !OCR_ARTIFACT_TRIGGER_REGEX.test(content)
  ) {
    return content;
  }

  const codeRegions = findCodeBlockRegions(content);
  if (codeRegions.length === 0) {
    let processed = normalizeBracketMath(content);
    processed = normalizeOcrMathArtifacts(processed);
    processed = enhanceMathTypography(processed);
    processed = simplifyInlineMathSets(processed);
    if (processed.includes('\\ce{') || processed.includes('\\pu{')) {
      processed = escapeMhchem(processed);
    }
    return escapeCurrencyOutsideCode(processed);
  }

  let cursor = 0;
  const output: string[] = [];

  for (const [start, end] of codeRegions) {
    if (cursor < start) {
      let segment = normalizeBracketMath(content.slice(cursor, start));
      segment = normalizeOcrMathArtifacts(segment);
      segment = enhanceMathTypography(segment);
      segment = simplifyInlineMathSets(segment);
      if (segment.includes('\\ce{') || segment.includes('\\pu{')) {
        segment = escapeMhchem(segment);
      }
      output.push(escapeCurrencyOutsideCode(segment));
    }

    output.push(content.slice(start, end + 1));
    cursor = end + 1;
  }

  if (cursor < content.length) {
    let tail = normalizeBracketMath(content.slice(cursor));
    tail = normalizeOcrMathArtifacts(tail);
    tail = enhanceMathTypography(tail);
    tail = simplifyInlineMathSets(tail);
    if (tail.includes('\\ce{') || tail.includes('\\pu{')) {
      tail = escapeMhchem(tail);
    }
    output.push(escapeCurrencyOutsideCode(tail));
  }

  return output.join('');
}
