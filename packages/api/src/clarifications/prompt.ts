import type { IMessage, IProjectSource } from '@librechat/data-schemas';
import { parseTextParts } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';

type ProjectFileSnippet = {
  title: string;
  text: string;
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

export function buildClarificationMessages(input: PromptInput) {
  const conversationContext = buildConversationContext(input.recentMessages);
  const sourceContext = buildSourceContext(input.projectSources, input.projectFiles);
  const systemContent =
    'You are answering an inline clarification for a specific span of an existing assistant response. ' +
    'Answer the local confusion point directly, preserve the parent explanation terminology, avoid restating the entire topic unless needed, and stay concise unless the question explicitly asks for depth. ' +
    'When mathematical notation is relevant, use standard LaTeX-compatible formatting with \\(...\\) for inline math and \\[...\\] for display math, and prefer proper notation such as \\mathbb{Z} or \\mathbb{R} over ASCII stand-ins.';

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
