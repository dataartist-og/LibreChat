const MATH_GUIDANCE_SENTINEL = 'When mathematical notation materially improves clarity';

const MATH_FORMATTING_GUIDANCE =
  'When mathematical notation materially improves clarity, format it with standard LaTeX-compatible notation. ' +
  'Use \\(...\\) for inline math and \\[...\\] for display math. ' +
  'Use \\mathbb{Z}, \\mathbb{Q}, \\mathbb{R}, \\mathbb{C}, and \\mathbb{N} for the standard number systems; ' +
  'render symbolic objects such as R, M, V, T, p(x), x_i, and maps like f: V \\to W in math mode instead of plain ASCII prose when they are mathematical objects. ' +
  'Avoid ASCII approximations such as Z/nZ when clearer mathematical notation is appropriate, and do not put math in code fences unless the user explicitly asks for raw LaTeX.';

export function appendMathFormattingInstructions(
  instructions?: string | null,
): string | undefined {
  const trimmed = instructions?.trim();
  if (!trimmed) {
    return MATH_FORMATTING_GUIDANCE;
  }

  if (trimmed.includes(MATH_GUIDANCE_SENTINEL)) {
    return trimmed;
  }

  return `${trimmed}\n\n${MATH_FORMATTING_GUIDANCE}`;
}
