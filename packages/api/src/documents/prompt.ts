import { appendMathFormattingInstructions } from '~/agents/math';

type ContextBlock = {
  type: string;
  text: string;
};

type ClarificationPromptInput = {
  documentTitle: string;
  headingPath: string[];
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  currentBlock: ContextBlock;
  previousBlock?: ContextBlock | null;
  nextBlock?: ContextBlock | null;
  clarificationQuestion: string;
};

type VisualizationPromptInput = {
  documentTitle: string;
  headingPath: string[];
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  currentBlock: ContextBlock;
  previousBlock?: ContextBlock | null;
  nextBlock?: ContextBlock | null;
  prompt: string;
  artifactType: string;
};

function formatBlock(label: string, block?: ContextBlock | null): string {
  if (!block || !block.text.trim()) {
    return `${label}: (none)`;
  }

  return `${label} (${block.type}):\n${block.text.trim()}`;
}

function formatHeadingPath(value: string[]): string {
  return value.length > 0 ? value.join(' > ') : '(root)';
}

export function buildDocumentClarificationMessages(input: ClarificationPromptInput) {
  return [
    {
      role: 'system' as const,
      content: appendMathFormattingInstructions(
        'You are answering an inline clarification for a selected passage inside a source document. Explain the local passage directly, preserve the document terminology, avoid unnecessary global summaries, and stay concise unless the user asks for depth.',
      ),
    },
    {
      role: 'user' as const,
      content: [
        `Document title: ${input.documentTitle}`,
        `Heading path: ${formatHeadingPath(input.headingPath)}`,
        '',
        'Selected text:',
        input.selectedText,
        '',
        'Context before:',
        input.contextBefore || '(none)',
        '',
        'Context after:',
        input.contextAfter || '(none)',
        '',
        formatBlock('Current block', input.currentBlock),
        '',
        formatBlock('Previous block', input.previousBlock),
        '',
        formatBlock('Next block', input.nextBlock),
        '',
        'Clarification question:',
        input.clarificationQuestion,
      ].join('\n'),
    },
  ];
}

function getArtifactInstructions(artifactType: string): string {
  if (artifactType === 'html_app') {
    return [
      'Return a self-contained HTML document.',
      'Use only inline CSS and inline JavaScript.',
      'Do not use remote assets, fetch, storage APIs, websockets, or imports.',
      'Make the layout responsive inside a narrow document card.',
    ].join(' ');
  }

  if (artifactType === 'svg') {
    return [
      'Return a single valid SVG document.',
      'Use a responsive viewBox.',
      'Do not include scripts or external references.',
    ].join(' ');
  }

  if (artifactType === 'mermaid') {
    return 'Return Mermaid source only with no markdown fences.';
  }

  return 'Return the complete artifact source only.';
}

export function buildDocumentVisualizationMessages(input: VisualizationPromptInput) {
  return [
    {
      role: 'system' as const,
      content: appendMathFormattingInstructions(
        [
          'You are generating a visualization artifact for a selected span inside a source document.',
          'Return a JSON object with exactly these keys: title, description, artifact_type, content.',
          `artifact_type must be "${input.artifactType}".`,
          'content must contain the full artifact source with no markdown fences.',
          getArtifactInstructions(input.artifactType),
        ].join(' '),
      ),
    },
    {
      role: 'user' as const,
      content: [
        `Document title: ${input.documentTitle}`,
        `Heading path: ${formatHeadingPath(input.headingPath)}`,
        '',
        'Selected text:',
        input.selectedText,
        '',
        'Context before:',
        input.contextBefore || '(none)',
        '',
        'Context after:',
        input.contextAfter || '(none)',
        '',
        formatBlock('Current block', input.currentBlock),
        '',
        formatBlock('Previous block', input.previousBlock),
        '',
        formatBlock('Next block', input.nextBlock),
        '',
        'Visualization request:',
        input.prompt,
      ].join('\n'),
    },
  ];
}
