import { resolveAnchor } from './anchors';

describe('resolveAnchor', () => {
  const text =
    'First paragraph about matrices.\n\nThe determinant captures area scaling and invertibility.\nIt is useful when reasoning about linear maps.\n\nFinal paragraph.';

  it('keeps exact offsets when the original slice still matches', () => {
    const anchorStart = text.indexOf('determinant');
    const resolution = resolveAnchor(text, {
      anchorStart,
      anchorEnd: anchorStart + 'determinant'.length,
      anchorText: 'determinant',
    });

    expect(resolution.method).toBe('offset');
    expect(resolution.anchorText).toBe('determinant');
    expect(resolution.needsManualReanchor).toBe(false);
  });

  it('falls back to text search when offsets drift', () => {
    const resolution = resolveAnchor(text, {
      anchorStart: 2,
      anchorEnd: 13,
      anchorText: 'invertibility',
    });

    expect(resolution.method).toBe('text');
    expect(text.slice(resolution.anchorStart, resolution.anchorEnd)).toBe('invertibility');
    expect(resolution.needsManualReanchor).toBe(false);
  });

  it('falls back to fuzzy matching within the same paragraph', () => {
    const resolution = resolveAnchor(text, {
      anchorStart: 40,
      anchorEnd: 58,
      anchorText: 'determinants capture scaling',
    });

    expect(resolution.method).toBe('fuzzy');
    expect(resolution.score).toBeGreaterThan(0.55);
    expect(resolution.needsManualReanchor).toBe(false);
  });

  it('prefers whole-word fuzzy matches over partial substrings', () => {
    const updatedText =
      'Eigenvalues describe how much a transformation stretches or compresses certain special directions. Those special directions are the eigenvectors. If a matrix acts on an eigenvector, the output stays on the same line as the original vector and only its magnitude changes by the eigenvalue. This matters because eigenvectors reveal the stable geometric structure of the transformation and let you reason about repeated applications of the matrix much more easily.';

    const resolution = resolveAnchor(updatedText, {
      anchorStart: 334,
      anchorEnd: 353,
      anchorText: 'invariant structure',
    });

    expect(resolution.method).toBe('fuzzy');
    expect(resolution.anchorText).toBe('geometric structure');
    expect(resolution.needsManualReanchor).toBe(false);
  });

  it('marks anchors for manual reanchor when no match is recoverable', () => {
    const resolution = resolveAnchor(text, {
      anchorStart: 4,
      anchorEnd: 12,
      anchorText: 'nonexistent phrase',
    });

    expect(resolution.method).toBe('manual');
    expect(resolution.needsManualReanchor).toBe(true);
  });
});
