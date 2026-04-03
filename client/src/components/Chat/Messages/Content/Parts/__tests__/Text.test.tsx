import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import TextPart from '../Text';
import { MessageContext } from '~/Providers';
import store from '~/store';

const mockAnnotatedAssistantMessage = jest.fn();

jest.mock('~/components/Clarifications', () => ({
  AnnotatedAssistantMessage: (props: unknown) => {
    mockAnnotatedAssistantMessage(props);
    return <div data-testid="annotated-assistant-message" />;
  },
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="markdown-lite">{content}</div>,
}));

jest.mock('~/components/Chat/Messages/Content/Markdown', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

describe('TextPart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders assistant text through the annotated assistant wrapper', () => {
    render(
      <RecoilRoot
        initializeState={({ set }) => {
          set(store.activeProjectId, 'project-1');
        }}
      >
        <MessageContext.Provider
          value={{
            messageId: 'message-1',
            isExpanded: true,
            conversationId: 'conversation-1',
            isLatestMessage: false,
            isSubmitting: false,
          }}
        >
          <TextPart text="Assistant response" isCreatedByUser={false} showCursor={false} />
        </MessageContext.Provider>
      </RecoilRoot>,
    );

    expect(screen.getByTestId('annotated-assistant-message')).toBeInTheDocument();
    expect(mockAnnotatedAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Assistant response',
        isLatestMessage: false,
        message: expect.objectContaining({
          messageId: 'message-1',
          projectId: 'project-1',
          isCreatedByUser: false,
        }),
      }),
    );
  });
});
