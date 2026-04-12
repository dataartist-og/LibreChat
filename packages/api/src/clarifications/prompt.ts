import type { IMessage, IProjectSource } from '@librechat/data-schemas';
import { parseTextParts } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import { appendMathFormattingInstructions } from '~/agents/math';

type ProjectFileSnippet = {
  title: string;
  text: string;
};

type ExistingClarificationContext = {
  question: string;
  answer: string;
};

type PromptInput = {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  clarificationQuestion: string;
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

export function extractMessageText(message: Pick<IMessage, 'text' | 'content'>): string {
  if (message.text && message.text.trim().length > 0) {
    return message.text.trim();
  }

  if (Array.isArray(message.content)) {
    return parseTextParts(message.content as TMessageContentParts[], true).trim();
  }

  return '';
}

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
    .map((source) => `Link: ${source.title}\n${source.url ?? ''}\n${source.description ?? ''}`.trim());

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

export function buildClarificationMessages(input: PromptInput) {
  const conversationContext = buildConversationContext(input.recentMessages);
  const sourceContext = buildSourceContext(input.projectSources, input.projectFiles);
  const systemContent = appendMathFormattingInstructions(
    'You are answering an inline clarification for a specific span of an existing assistant response. ' +
      'Answer the local confusion point directly, preserve the parent explanation terminology, avoid restating the entire topic unless needed, and stay concise unless the question explicitly asks for depth.',
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
        'Clarification question:',
        input.clarificationQuestion,
        sourceContext ? `\nProject sources:\n${sourceContext}` : '',
        conversationContext ? `\nRecent conversation:\n${conversationContext}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
}

export function buildClarificationSuggestionMessages(input: SuggestionPromptInput) {
  const conversationContext = buildConversationContext(input.recentMessages);
  const sourceContext = buildSourceContext(input.projectSources, input.projectFiles);
  const existingClarifications = buildExistingClarificationContext(input.existingClarifications);
  const systemContent = appendMathFormattingInstructions(
    [
      'You are proposing inline clarification requests for a selected span inside an assistant answer.',
      'Infer whether the local material is primarily conceptual, procedural, equational, precise, or mixed.',
      'Return a JSON object with exactly these keys: content_profile, focus_summary, suggestions.',
      'content_profile must be one of: conceptual, procedural, equational, precise, mixed.',
      'focus_summary must be a single sentence describing the likely local confusion point.',
      'suggestions must contain 2 or 3 objects with exactly these keys: label, proposed_question, understanding_gain, reasoning.',
      'label must be short and scannable.',
      'proposed_question must be a user-ready clarification request.',
      'understanding_gain must say what the answer would help the user understand.',
      'reasoning must explain why this clarification would be high value for the local passage.',
      'If existing clarifications are present, avoid repeating them and instead propose complementary or deeper follow-ups.',
      'If no clarification exists yet, infer what the user is most likely trying to understand better.',
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
