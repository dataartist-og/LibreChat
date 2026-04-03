export type AnchorCandidate = {
  anchorStart: number;
  anchorEnd: number;
  anchorText: string;
  anchorContextBefore?: string;
  anchorContextAfter?: string;
};

export type AnchorResolution = {
  anchorStart: number;
  anchorEnd: number;
  anchorText: string;
  method: 'offset' | 'text' | 'fuzzy' | 'manual';
  score?: number;
  needsManualReanchor: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isWordChar(value: string | undefined): boolean {
  return value != null && /[A-Za-z0-9_]/.test(value);
}

function hasWordBoundaries(text: string, start: number, end: number): boolean {
  const previous = start > 0 ? text[start - 1] : undefined;
  const next = end < text.length ? text[end] : undefined;
  return !isWordChar(previous) && !isWordChar(next);
}

function findAllIndexes(haystack: string, needle: string): number[] {
  if (!needle) {
    return [];
  }

  const indexes: number[] = [];
  let start = 0;

  while (start < haystack.length) {
    const index = haystack.indexOf(needle, start);
    if (index === -1) {
      break;
    }
    indexes.push(index);
    start = index + 1;
  }

  return indexes;
}

function getNearestIndex(indexes: number[], target: number): number | null {
  if (indexes.length === 0) {
    return null;
  }

  return indexes.reduce((closest, current) => {
    const currentDistance = Math.abs(current - target);
    const closestDistance = Math.abs(closest - target);
    return currentDistance < closestDistance ? current : closest;
  }, indexes[0]);
}

function getParagraphRange(text: string, index: number): { start: number; end: number } {
  const safeIndex = clamp(index, 0, text.length);
  const beforeDoubleBreak = text.lastIndexOf('\n\n', safeIndex);
  const beforeSingleBreak = text.lastIndexOf('\n', safeIndex);
  const afterDoubleBreak = text.indexOf('\n\n', safeIndex);
  const afterSingleBreak = text.indexOf('\n', safeIndex);
  const start = Math.max(beforeDoubleBreak, beforeSingleBreak) + 1;
  const endCandidates = [afterDoubleBreak, afterSingleBreak].filter((value) => value >= 0);
  const end = endCandidates.length > 0 ? Math.min(...endCandidates) : text.length;
  return { start, end };
}

function normalizeForSimilarity(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function bigrams(value: string): string[] {
  const normalized = normalizeForSimilarity(value);
  if (normalized.length < 2) {
    return normalized ? [normalized] : [];
  }

  const pairs: string[] = [];
  for (let i = 0; i < normalized.length - 1; i += 1) {
    pairs.push(normalized.slice(i, i + 2));
  }
  return pairs;
}

function diceCoefficient(left: string, right: string): number {
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);

  if (leftPairs.length === 0 || rightPairs.length === 0) {
    return 0;
  }

  const counts = new Map<string, number>();
  leftPairs.forEach((pair) => counts.set(pair, (counts.get(pair) ?? 0) + 1));

  let overlap = 0;
  rightPairs.forEach((pair) => {
    const count = counts.get(pair) ?? 0;
    if (count <= 0) {
      return;
    }

    overlap += 1;
    counts.set(pair, count - 1);
  });

  return (2 * overlap) / (leftPairs.length + rightPairs.length);
}

function findBestFuzzyMatch(
  text: string,
  anchorText: string,
  expectedStart: number,
): { start: number; end: number; score: number } | null {
  const targetLength = anchorText.length;
  if (!text || !anchorText || targetLength === 0) {
    return null;
  }

  const paragraph = getParagraphRange(text, expectedStart);
  const paragraphText = text.slice(paragraph.start, paragraph.end);
  const localExpectedStart = clamp(expectedStart - paragraph.start, 0, paragraphText.length);
  const minLength = Math.max(6, Math.floor(targetLength * 0.65));
  const maxLength = Math.min(paragraphText.length, Math.ceil(targetLength * 1.35));
  const startLowerBound = Math.max(0, localExpectedStart - targetLength);
  const startUpperBound = Math.min(paragraphText.length - minLength, localExpectedStart + targetLength);

  const buildBestMatch = (
    requireWordBoundaries: boolean,
  ): { start: number; end: number; score: number } | null => {
    let bestMatch: { start: number; end: number; score: number } | null = null;

    for (let start = startLowerBound; start <= startUpperBound; start += 1) {
      for (let length = minLength; length <= maxLength; length += 1) {
        const end = start + length;
        if (end > paragraphText.length) {
          break;
        }

        if (requireWordBoundaries && !hasWordBoundaries(paragraphText, start, end)) {
          continue;
        }

        const candidate = paragraphText.slice(start, end);
        if (requireWordBoundaries && candidate !== candidate.trim()) {
          continue;
        }
        const similarity = diceCoefficient(candidate, anchorText);
        const lengthPenalty = Math.abs(candidate.length - targetLength) / Math.max(targetLength, 1);
        const score = similarity - lengthPenalty * 0.08;

        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            start: paragraph.start + start,
            end: paragraph.start + end,
            score,
          };
        }
      }
    }

    return bestMatch;
  };

  const bestMatch = buildBestMatch(true) ?? buildBestMatch(false);

  if (!bestMatch || bestMatch.score < 0.55) {
    return null;
  }

  return bestMatch;
}

export function resolveAnchor(text: string, anchor: AnchorCandidate): AnchorResolution {
  const safeStart = clamp(anchor.anchorStart, 0, text.length);
  const safeEnd = clamp(anchor.anchorEnd, safeStart, text.length);
  const exactSlice = text.slice(safeStart, safeEnd);

  if (anchor.anchorText && exactSlice === anchor.anchorText) {
    return {
      anchorStart: safeStart,
      anchorEnd: safeEnd,
      anchorText: anchor.anchorText,
      method: 'offset',
      needsManualReanchor: false,
    };
  }

  const exactMatches = findAllIndexes(text, anchor.anchorText);
  const exactStart = getNearestIndex(exactMatches, safeStart);
  if (exactStart != null) {
    return {
      anchorStart: exactStart,
      anchorEnd: exactStart + anchor.anchorText.length,
      anchorText: anchor.anchorText,
      method: 'text',
      needsManualReanchor: false,
    };
  }

  const fuzzyMatch = findBestFuzzyMatch(text, anchor.anchorText, safeStart);
  if (fuzzyMatch) {
    return {
      anchorStart: fuzzyMatch.start,
      anchorEnd: fuzzyMatch.end,
      anchorText: text.slice(fuzzyMatch.start, fuzzyMatch.end),
      method: 'fuzzy',
      score: fuzzyMatch.score,
      needsManualReanchor: false,
    };
  }

  return {
    anchorStart: safeStart,
    anchorEnd: safeEnd,
    anchorText: anchor.anchorText,
    method: 'manual',
    needsManualReanchor: true,
  };
}
