import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

type InlineMathPromptInput = {
  documentTitle: string;
  headingPath: string[];
  blockType: string;
  sourceMarkdown: string;
  segmentText: string;
  contextBefore: string;
  contextAfter: string;
};

type DisplayMathPromptInput = {
  documentTitle: string;
  headingPath: string[];
  blockId: string;
  sourceMarkdown: string;
  contextBefore: string;
  contextAfter: string;
};

function formatHeadingPath(value: string[]): string {
  return value.length > 0 ? value.join(' > ') : '(root)';
}

export function buildInlineMathSpeechMessages(
  input: InlineMathPromptInput,
): ChatCompletionMessageParam[] {
  return [
    {
      role: 'system',
      content: [
        'You rewrite document text into natural spoken English for text-to-speech.',
        'Preserve the meaning exactly, but do not output LaTeX, TeX commands, raw symbols, markdown fences, or JSON keys outside the requested JSON object.',
        'Use nearby context to make inline mathematical notation sound natural inside the sentence.',
        'Return strict JSON with exactly one key: spoken_text.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Document title: ${input.documentTitle}`,
        `Heading path: ${formatHeadingPath(input.headingPath)}`,
        `Block type: ${input.blockType}`,
        '',
        'Source markdown:',
        input.sourceMarkdown || '(none)',
        '',
        'Segment to rewrite:',
        input.segmentText,
        '',
        'Context before:',
        input.contextBefore || '(none)',
        '',
        'Context after:',
        input.contextAfter || '(none)',
      ].join('\n'),
    },
  ];
}

export function buildDisplayMathSpeechMessages(
  input: DisplayMathPromptInput,
): ChatCompletionMessageParam[] {
  return [
    {
      role: 'system',
      content: [
        'You are planning spoken narration for a display equation inside a source document.',
        'Use the surrounding prose only for local context and flow.',
        'Do not repeat the surrounding prose verbatim unless it is needed for a natural spoken handoff.',
        'Choose mode "narrate" if the equation can be explained naturally in full audio without overwhelming the listener.',
        'Choose mode "handoff" if the equation is too dense, too symbolic, or too long for a natural full spoken rendering.',
        'Return strict JSON with exactly these keys: mode, prePauseText, equationNarration, handoffText, resumeText, focusBlockId.',
        'mode must be either "narrate" or "handoff".',
        'prePauseText should be a very short lead-in and may be empty.',
        'equationNarration should describe the equation in clear spoken English and may be empty only when mode is "handoff".',
        'handoffText should tell the listener to inspect the equation visually and may be empty only when mode is "narrate".',
        'resumeText should be a short phrase that sounds natural after the listener resumes and may be empty.',
        'focusBlockId must equal the provided block id.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Document title: ${input.documentTitle}`,
        `Heading path: ${formatHeadingPath(input.headingPath)}`,
        `Block id: ${input.blockId}`,
        '',
        'Context before:',
        input.contextBefore || '(none)',
        '',
        'Display equation markdown:',
        input.sourceMarkdown,
        '',
        'Context after:',
        input.contextAfter || '(none)',
      ].join('\n'),
    },
  ];
}
