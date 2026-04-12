import type { IMessage, IProjectSource, VisualizationArtifactType } from '@librechat/data-schemas';
import { appendMathFormattingInstructions } from '~/agents/math';
import { extractMessageText } from '~/clarifications/prompt';

type ProjectFileSnippet = {
  title: string;
  text: string;
};

type ExistingClarificationContext = {
  question: string;
  answer: string;
};

type PromptInput = {
  artifactType: VisualizationArtifactType;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  userPrompt: string;
  recentMessages: IMessage[];
  projectSources: IProjectSource[];
  projectFiles: ProjectFileSnippet[];
};

type SuggestionPromptInput = {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  recentMessages: IMessage[];
  projectSources: IProjectSource[];
  projectFiles: ProjectFileSnippet[];
  existingClarifications: ExistingClarificationContext[];
};

type RefinementPromptInput = {
  artifactType: VisualizationArtifactType;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  existingPrompt: string;
  currentSource: string;
  followUpInstruction: string;
  recentMessages: IMessage[];
  projectSources: IProjectSource[];
  projectFiles: ProjectFileSnippet[];
};

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function buildConversationContext(messages: IMessage[]): string {
  return messages
    .slice(-6)
    .map((message) => {
      const role = message.isCreatedByUser ? 'User' : 'Assistant';
      return `${role}: ${truncate(extractMessageText(message), 700)}`;
    })
    .join('\n\n');
}

function buildSourceContext(sources: IProjectSource[], files: ProjectFileSnippet[]): string {
  const noteSources = sources
    .filter((source) => source.sourceType === 'note' && source.noteBody)
    .slice(0, 2)
    .map((source) => `Note: ${source.title}\n${truncate(source.noteBody ?? '', 1200)}`);

  const urlSources = sources
    .filter((source) => source.sourceType === 'url')
    .slice(0, 2)
    .map((source) =>
      `Link: ${source.title}\n${source.url ?? ''}\n${source.description ?? ''}`.trim(),
    );

  const fileSources = files
    .slice(0, 3)
    .map((file) => `File: ${file.title}\n${truncate(file.text, 1200)}`);

  return [...noteSources, ...urlSources, ...fileSources].filter(Boolean).join('\n\n');
}

function buildExistingClarificationContext(clarifications: ExistingClarificationContext[]): string {
  return clarifications
    .slice(0, 3)
    .map(
      (clarification, index) =>
        `Clarification ${index + 1} question: ${clarification.question}\nClarification ${index + 1} answer: ${truncate(clarification.answer, 700)}`,
    )
    .join('\n\n');
}

function getArtifactInstructions(artifactType: VisualizationArtifactType): string {
  if (artifactType === 'html_app') {
    return [
      'Return a self-contained HTML document.',
      'Use inline CSS only and inline JavaScript only.',
      'Do not use CDNs, remote assets, imports, fetch, websockets, storage APIs, or network requests.',
      'Make the layout responsive and constrained for a chat-width container.',
      'Prefer accessible labels and touch-friendly controls.',
      'Dark-mode aware styling is strongly preferred.',
    ].join(' ');
  }

  if (artifactType === 'svg') {
    return [
      'Return a single valid SVG document.',
      'Use a responsive viewBox.',
      'Do not include scripts or external references.',
      'Inline styles are allowed.',
    ].join(' ');
  }

  if (artifactType === 'mermaid') {
    return [
      'Return Mermaid source only.',
      'Do not wrap it in markdown prose outside the JSON envelope.',
      'Prefer flowcharts, sequence diagrams, graphs, or state diagrams that fit well inline.',
    ].join(' ');
  }

  if (artifactType === 'markdown_explainer_with_embeds') {
    return [
      'Return markdown only.',
      'Use concise headings and bullets.',
      'Do not reference external assets.',
    ].join(' ');
  }

  return [
    'Return structured JSON content that is directly renderable for the requested visualization.',
    'Do not reference external assets.',
  ].join(' ');
}

export function buildVisualizationMessages(input: PromptInput) {
  const conversationContext = buildConversationContext(input.recentMessages);
  const sourceContext = buildSourceContext(input.projectSources, input.projectFiles);
  const systemContent = appendMathFormattingInstructions(
    [
      'You are generating a visualization artifact for an anchored span inside an existing assistant response.',
      'Return a JSON object with exactly these keys: title, description, artifact_type, content.',
      'The content field must contain the full visualization source with no markdown fences.',
      `The artifact_type must be "${input.artifactType}".`,
      getArtifactInstructions(input.artifactType),
    ].join(' '),
  );

  return [
    {
      role: 'system' as const,
      content: systemContent,
    },
    {
      role: 'user' as const,
      content: [
        'Selected text:',
        input.selectedText,
        '',
        'Context before:',
        input.contextBefore || '(none)',
        '',
        'Context after:',
        input.contextAfter || '(none)',
        '',
        'Visualization request:',
        input.userPrompt,
        sourceContext ? `\nProject sources:\n${sourceContext}` : '',
        conversationContext ? `\nRecent conversation:\n${conversationContext}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
}

export function buildVisualizationSuggestionMessages(input: SuggestionPromptInput) {
  const conversationContext = buildConversationContext(input.recentMessages);
  const sourceContext = buildSourceContext(input.projectSources, input.projectFiles);
  const existingClarifications = buildExistingClarificationContext(input.existingClarifications);
  const systemContent = appendMathFormattingInstructions(
    [
      'You are proposing inline visualization ideas for a selected span inside an assistant answer.',
      'Infer whether the local material is primarily conceptual, procedural, equational, precise, or mixed.',
      'Return a JSON object with exactly these keys: content_profile, focus_summary, suggestions.',
      'content_profile must be one of: conceptual, procedural, equational, precise, mixed.',
      'focus_summary must be a single sentence naming the likely confusion point or understanding goal.',
      'suggestions must contain 2 or 3 objects with exactly these keys: label, artifact_type, proposed_prompt, understanding_gain, reasoning.',
      'artifact_type must be one of: html_app, svg, mermaid, image.',
      'proposed_prompt must be a ready-to-send visualization request tailored to the selected span.',
      'understanding_gain must say what the visualization would make easier to understand.',
      'reasoning must explain why this visualization is well matched to the local material.',
      'Prefer diverse suggestions, such as structural diagrams, process views, equation decompositions, or intuition-building interactive views.',
      'If an inline clarification already exists, use it to propose visualizations that would answer or reinforce that clarification.',
      'If no clarification exists, infer what the user most likely needs to understand better.',
    ].join(' '),
  );

  return [
    {
      role: 'system' as const,
      content: systemContent,
    },
    {
      role: 'user' as const,
      content: [
        'Selected text:',
        input.selectedText,
        '',
        'Context before:',
        input.contextBefore || '(none)',
        '',
        'Context after:',
        input.contextAfter || '(none)',
        existingClarifications
          ? `\nExisting inline clarifications:\n${existingClarifications}`
          : '\nExisting inline clarifications:\n(none)',
        sourceContext ? `\nProject sources:\n${sourceContext}` : '',
        conversationContext ? `\nRecent conversation:\n${conversationContext}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
}

export function buildVisualizationRefinementMessages(input: RefinementPromptInput) {
  const conversationContext = buildConversationContext(input.recentMessages);
  const sourceContext = buildSourceContext(input.projectSources, input.projectFiles);
  const systemContent = appendMathFormattingInstructions(
    [
      'You are revising an existing visualization artifact for an anchored span inside an assistant response.',
      'Return a JSON object with exactly these keys: title, description, artifact_type, content.',
      'The content field must contain the full revised visualization source with no markdown fences.',
      `The artifact_type must be "${input.artifactType}".`,
      'Preserve the parts of the current artifact that are already good unless the follow-up instruction changes them.',
      'Apply the follow-up instruction directly rather than starting from scratch.',
      getArtifactInstructions(input.artifactType),
    ].join(' '),
  );

  return [
    {
      role: 'system' as const,
      content: systemContent,
    },
    {
      role: 'user' as const,
      content: [
        'Selected text:',
        input.selectedText,
        '',
        'Context before:',
        input.contextBefore || '(none)',
        '',
        'Context after:',
        input.contextAfter || '(none)',
        '',
        'Original visualization request:',
        input.existingPrompt,
        '',
        'Current visualization source:',
        input.currentSource,
        '',
        'Follow-up revision instruction:',
        input.followUpInstruction,
        sourceContext ? `\nProject sources:\n${sourceContext}` : '',
        conversationContext ? `\nRecent conversation:\n${conversationContext}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
}
