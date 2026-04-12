import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import type { TClarification, TMessage, TVisualization } from 'librechat-data-provider';
import { MessageContext } from '~/Providers';
import AnnotatedAssistantMessage from '../Annotated';
import store from '~/store';

const mockCreateClarification = jest.fn();
const mockClarificationsQuery = jest.fn();
const mockClarificationSuggestionsQuery = jest.fn();
const mockCreateVisualization = jest.fn();
const mockVisualizationsQuery = jest.fn();
const mockVisualizationSuggestionsQuery = jest.fn();
const mockUpdateClarification = jest.fn();
const mockReanchorClarification = jest.fn();
const mockIntegrateClarification = jest.fn();
const mockMarkdownLite = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useConversationClarificationsQuery: (...args: unknown[]) => mockClarificationsQuery(...args),
  useConversationVisualizationsQuery: (...args: unknown[]) => mockVisualizationsQuery(...args),
  useClarificationSuggestionsQuery: (...args: unknown[]) =>
    mockClarificationSuggestionsQuery(...args),
  useVisualizationSuggestionsQuery: (...args: unknown[]) =>
    mockVisualizationSuggestionsQuery(...args),
  useCreateClarificationMutation: () => ({
    mutateAsync: mockCreateClarification,
    isLoading: false,
  }),
  useCreateVisualizationMutation: () => ({
    mutateAsync: mockCreateVisualization,
    isLoading: false,
  }),
  useUpdateClarificationMutation: () => ({
    mutateAsync: mockUpdateClarification,
  }),
  useReanchorClarificationMutation: () => ({
    mutateAsync: mockReanchorClarification,
  }),
  useIntegrateClarificationMutation: () => ({
    mutateAsync: mockIntegrateClarification,
  }),
  useMessageRevisionsQuery: () => ({
    data: [],
  }),
}));

jest.mock('~/components/Visualizations', () => ({
  VisualizationCard: ({ visualization }: { visualization: TVisualization }) => (
    <div>{visualization.title}</div>
  ),
  VisualizationTab: ({ visualizations }: { visualizations: TVisualization[] }) => (
    <div data-testid="visualization-tab">{visualizations.length}</div>
  ),
}));

jest.mock('~/components/Chat/Messages/Content/Markdown', () => ({
  __esModule: true,
  default: ({ content }: { content?: string }) => {
    const normalizedContent = typeof content === 'string' ? content : '';
    const blocks = normalizedContent.split(/\n{2,}/).filter(Boolean);
    return (
      <div>
        {blocks.map((block, blockIndex) => {
          const lines = block.split('\n').filter(Boolean);
          if (lines.every((line) => line.startsWith('- '))) {
            return (
              <ul key={`list-${blockIndex}`}>
                {lines.map((line, lineIndex) => (
                  <li key={`item-${lineIndex}`}>{line.slice(2)}</li>
                ))}
              </ul>
            );
          }

          return <p key={`paragraph-${blockIndex}`}>{block}</p>;
        })}
      </div>
    );
  },
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content?: string }) => {
    mockMarkdownLite(content ?? '');
    return <div>{content}</div>;
  },
}));

const baseMessage: TMessage = {
  messageId: 'message-1',
  conversationId: 'conversation-1',
  parentMessageId: 'root',
  sender: 'Assistant',
  text: 'Photosynthesis makes sugar for the plant.',
  projectId: 'project-1',
  isCreatedByUser: false,
};

function renderAnnotated(
  content = baseMessage.text ?? '',
  clarifications: TClarification[] = [],
  visualizations: TVisualization[] = [],
) {
  mockClarificationsQuery.mockReturnValue({
    data: clarifications,
  });
  mockVisualizationsQuery.mockReturnValue({
    data: visualizations,
  });
  mockClarificationSuggestionsQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  });
  mockVisualizationSuggestionsQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  });

  const message = {
    ...baseMessage,
    text: content,
  };

  return render(
    <RecoilRoot
      initializeState={({ set }) => {
        set(store.activeProjectId, 'project-1');
      }}
    >
      <MessageContext.Provider
        value={{
          messageId: 'message-1',
          isExpanded: false,
          isLatestMessage: false,
          isSubmitting: false,
          conversationId: 'conversation-1',
        }}
      >
        <AnnotatedAssistantMessage
          message={message}
          content={message.text ?? ''}
          isLatestMessage={false}
        />
      </MessageContext.Provider>
    </RecoilRoot>,
  );
}

function renderAnnotatedWithoutClarifications() {
  mockClarificationsQuery.mockReturnValue({
    data: undefined,
  });
  mockVisualizationsQuery.mockReturnValue({
    data: undefined,
  });
  mockClarificationSuggestionsQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  });
  mockVisualizationSuggestionsQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  });

  const message = {
    ...baseMessage,
    text: baseMessage.text ?? '',
  };

  return render(
    <RecoilRoot
      initializeState={({ set }) => {
        set(store.activeProjectId, 'project-1');
      }}
    >
      <MessageContext.Provider
        value={{
          messageId: 'message-1',
          isExpanded: false,
          isLatestMessage: false,
          isSubmitting: false,
          conversationId: 'conversation-1',
        }}
      >
        <AnnotatedAssistantMessage
          message={message}
          content={message.text ?? ''}
          isLatestMessage={false}
        />
      </MessageContext.Provider>
    </RecoilRoot>,
  );
}

describe('AnnotatedAssistantMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders inline clarifications anchored to the message body', async () => {
    renderAnnotated(baseMessage.text ?? '', [
      {
        clarificationId: 'clarification-1',
        projectId: 'project-1',
        conversationId: 'conversation-1',
        parentMessageId: 'message-1',
        anchorStart: 22,
        anchorEnd: 27,
        anchorText: 'sugar',
        anchorContextBefore: 'Photosynthesis makes ',
        anchorContextAfter: ' for the plant.',
        clarificationQuestion: 'What kind of sugar?',
        clarificationAnswer: 'The plant primarily synthesizes glucose.',
        status: 'active',
        createdByUserId: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    expect(await screen.findByText('What kind of sugar?')).toBeInTheDocument();
    expect(screen.getByText('The plant primarily synthesizes glucose.')).toBeInTheDocument();
  });

  it('creates a clarification from a text selection', async () => {
    renderAnnotated();
    const textContainer = screen.getByText('Photosynthesis makes sugar for the plant.');
    const textNode = textContainer.firstChild as Text;
    const anchorStart = textNode.textContent?.indexOf('sugar') ?? 0;
    const range = document.createRange();
    range.setStart(textNode, anchorStart);
    range.setEnd(textNode, anchorStart + 'sugar'.length);
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => ({
        width: 80,
        height: 20,
        top: 10,
        left: 10,
        right: 90,
        bottom: 30,
        x: 10,
        y: 10,
        toJSON: () => ({}),
      }),
    });

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.mouseUp(textContainer as Element);

    const input = await screen.findByPlaceholderText('com_ui_clarification_question_placeholder');
    fireEvent.change(input, { target: { value: 'Why sugar?' } });
    fireEvent.click(screen.getByText('com_ui_ask'));

    await waitFor(() => {
      expect(mockCreateClarification).toHaveBeenCalledWith(
        expect.objectContaining({
          anchorText: 'sugar',
          conversationId: 'conversation-1',
          parentMessageId: 'message-1',
          clarificationQuestion: 'Why sugar?',
        }),
      );
    });
  });

  it('renders the selected passage preview in the popup', async () => {
    renderAnnotated('The notation \\(\\mathbb{Z}/6\\mathbb{Z}\\) matters here.');
    const textContainer = screen.getByText('The notation \\(\\mathbb{Z}/6\\mathbb{Z}\\) matters here.');
    const textNode = textContainer.firstChild as Text;
    const anchorStart = textNode.textContent?.indexOf('\\(\\mathbb{Z}/6\\mathbb{Z}\\)') ?? 0;
    const range = document.createRange();
    range.setStart(textNode, anchorStart);
    range.setEnd(textNode, anchorStart + '\\(\\mathbb{Z}/6\\mathbb{Z}\\)'.length);
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => ({
        width: 120,
        height: 20,
        top: 10,
        left: 10,
        right: 130,
        bottom: 30,
        x: 10,
        y: 10,
        toJSON: () => ({}),
      }),
    });

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.mouseUp(textContainer as Element);

    await screen.findByPlaceholderText('com_ui_clarification_question_placeholder');

    expect(screen.getByText('\\(\\mathbb{Z}/6\\mathbb{Z}\\)')).toBeInTheDocument();
  });

  it('prefills a clarification request from a suggested option', async () => {
    renderAnnotated();
    mockClarificationSuggestionsQuery.mockReturnValue({
      data: {
        contentProfile: 'conceptual',
        focusSummary: 'The local passage likely needs a more concrete explanation.',
        suggestions: [
          {
            label: 'Concrete meaning',
            proposedQuestion: 'What does sugar mean in this sentence?',
            understandingGain: 'It would make the biological role of the term explicit.',
            reasoning: 'The highlighted noun is the likely ambiguity point.',
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    const textContainer = screen.getByText('Photosynthesis makes sugar for the plant.');
    const textNode = textContainer.firstChild as Text;
    const anchorStart = textNode.textContent?.indexOf('sugar') ?? 0;
    const range = document.createRange();
    range.setStart(textNode, anchorStart);
    range.setEnd(textNode, anchorStart + 'sugar'.length);
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => ({
        width: 80,
        height: 20,
        top: 10,
        left: 10,
        right: 90,
        bottom: 30,
        x: 10,
        y: 10,
        toJSON: () => ({}),
      }),
    });

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.mouseUp(textContainer as Element);
    fireEvent.click(await screen.findByText('Concrete meaning'));
    fireEvent.click(screen.getByText('com_ui_ask'));

    await waitFor(() => {
      expect(mockCreateClarification).toHaveBeenCalledWith(
        expect.objectContaining({
          clarificationQuestion: 'What does sugar mean in this sentence?',
        }),
      );
    });
  });

  it('creates a visualization from a text selection', async () => {
    renderAnnotated();
    const textContainer = screen.getByText('Photosynthesis makes sugar for the plant.');
    const textNode = textContainer.firstChild as Text;
    const anchorStart = textNode.textContent?.indexOf('sugar') ?? 0;
    const range = document.createRange();
    range.setStart(textNode, anchorStart);
    range.setEnd(textNode, anchorStart + 'sugar'.length);
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => ({
        width: 80,
        height: 20,
        top: 10,
        left: 10,
        right: 90,
        bottom: 30,
        x: 10,
        y: 10,
        toJSON: () => ({}),
      }),
    });

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.mouseUp(textContainer as Element);
    fireEvent.click(await screen.findByText('com_ui_visualization'));

    const input = await screen.findByPlaceholderText('com_ui_visualization_prompt_placeholder');
    fireEvent.change(input, { target: { value: 'Draw the sugar flow.' } });
    fireEvent.click(screen.getByText('com_ui_generate_visualization'));

    await waitFor(() => {
      expect(mockCreateVisualization).toHaveBeenCalledWith(
        expect.objectContaining({
          anchorText: 'sugar',
          conversationId: 'conversation-1',
          parentMessageId: 'message-1',
          prompt: 'Draw the sugar flow.',
          artifactType: 'html_app',
        }),
      );
    });
  });

  it('creates a clarification when the browser reports element boundary selection', async () => {
    renderAnnotated();
    const textContainer = screen.getByText('Photosynthesis makes sugar for the plant.');
    const range = document.createRange();
    range.setStart(textContainer, 0);
    range.setEnd(textContainer, textContainer.childNodes.length);
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => ({
        width: 120,
        height: 20,
        top: 10,
        left: 10,
        right: 130,
        bottom: 30,
        x: 10,
        y: 10,
        toJSON: () => ({}),
      }),
    });

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.mouseUp(document);

    const input = await screen.findByPlaceholderText('com_ui_clarification_question_placeholder');
    fireEvent.change(input, { target: { value: 'What does this whole sentence mean?' } });
    fireEvent.click(screen.getByText('com_ui_ask'));

    await waitFor(() => {
      expect(mockCreateClarification).toHaveBeenCalledWith(
        expect.objectContaining({
          anchorText: 'Photosynthesis makes sugar for the plant.',
          clarificationQuestion: 'What does this whole sentence mean?',
        }),
      );
    });
  });

  it('keeps the composer open when the user clicks into the clarification textarea', async () => {
    renderAnnotated();
    const textContainer = screen.getByText('Photosynthesis makes sugar for the plant.');
    const textNode = textContainer.firstChild as Text;
    const anchorStart = textNode.textContent?.indexOf('sugar') ?? 0;
    const range = document.createRange();
    range.setStart(textNode, anchorStart);
    range.setEnd(textNode, anchorStart + 'sugar'.length);
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => ({
        width: 80,
        height: 20,
        top: 10,
        left: 10,
        right: 90,
        bottom: 30,
        x: 10,
        y: 10,
        toJSON: () => ({}),
      }),
    });

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.mouseUp(textContainer as Element);

    const input = await screen.findByPlaceholderText('com_ui_clarification_question_placeholder');
    selection?.removeAllRanges();
    fireEvent.mouseUp(input);

    expect(
      screen.getByPlaceholderText('com_ui_clarification_question_placeholder'),
    ).toBeInTheDocument();
  });

  it('renders once when clarifications have not loaded yet', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    renderAnnotatedWithoutClarifications();

    expect(screen.getByText('Photosynthesis makes sugar for the plant.')).toBeInTheDocument();
    expect(
      consoleErrorSpy.mock.calls.some(
        ([message]) =>
          typeof message === 'string' && message.includes('Maximum update depth exceeded'),
      ),
    ).toBe(false);

    consoleErrorSpy.mockRestore();
  });

  it('renders the same clarification under each touched list item for multi-element selections', async () => {
    renderAnnotated('- Alpha\n- Beta', [
      {
        clarificationId: 'clarification-2',
        projectId: 'project-1',
        conversationId: 'conversation-1',
        parentMessageId: 'message-1',
        anchorStart: 0,
        anchorEnd: 'AlphaBeta'.length,
        anchorText: 'AlphaBeta',
        anchorContextBefore: '',
        anchorContextAfter: '',
        clarificationQuestion: 'How do these fit together?',
        clarificationAnswer: 'Treat the two list items as one grouped clarification span.',
        status: 'active',
        createdByUserId: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    await waitFor(() => {
      expect(screen.getAllByText('How do these fit together?')).toHaveLength(2);
    });
  });

  it('hydrates existing visualizations inside the inline thread', async () => {
    renderAnnotated(
      baseMessage.text ?? '',
      [],
      [
        {
          visualizationId: 'visualization-1',
          projectId: 'project-1',
          conversationId: 'conversation-1',
          parentMessageId: 'message-1',
          anchorStart: 22,
          anchorEnd: 27,
          anchorText: 'sugar',
          anchorContextBefore: 'Photosynthesis makes ',
          anchorContextAfter: ' for the plant.',
          anchorPath: null,
          inlineThreadId: null,
          parentVisualizationId: null,
          rootVisualizationId: 'visualization-1',
          title: 'Sugar diagram',
          description: 'Shows the sugar produced by photosynthesis.',
          artifactType: 'html_app',
          status: 'ready',
          storageMode: 'db_inline',
          canonicalSourceText: '<html><body>Sugar diagram</body></html>',
          canonicalSourceMimeType: 'text/html',
          compiledRenderText: '<html><body>Sugar diagram</body></html>',
          compiledRenderMimeType: 'text/html',
          compiledRenderStoragePath: null,
          thumbnailUrl: null,
          sourcePrompt: 'Show the sugar flow.',
          generationModel: 'gpt-4o-mini',
          generationMetadata: {
            warnings: [],
          },
          integrationState: 'nested_only',
          isLatestVersion: true,
          versionNumber: 1,
          createdByUserId: 'user-1',
          integratedAt: null,
          deletedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    );

    expect(await screen.findByTestId('visualization-tab')).toHaveTextContent('1');
  });
});
