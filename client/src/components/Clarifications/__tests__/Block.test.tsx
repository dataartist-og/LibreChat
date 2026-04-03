import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { TClarification } from 'librechat-data-provider';
import ClarificationBlock from '../Block';

const mockUpdateClarification = jest.fn();
const mockReanchorClarification = jest.fn();
const mockIntegrateClarification = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  OGDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  OGDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OGDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OGDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('~/data-provider', () => ({
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

const clarification: TClarification = {
  clarificationId: 'clarification-1',
  projectId: 'project-1',
  conversationId: 'conversation-1',
  parentMessageId: 'message-1',
  anchorStart: 8,
  anchorEnd: 14,
  anchorText: 'energy',
  anchorContextBefore: 'Cells use ',
  anchorContextAfter: ' to function.',
  clarificationQuestion: 'What kind of energy?',
  clarificationAnswer: 'Cells mostly rely on ATP as the immediate usable energy currency.',
  status: 'collapsed',
  createdByUserId: 'user-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('ClarificationBlock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('supports collapse and expand controls', async () => {
    render(
      <ClarificationBlock
        clarification={clarification}
        parentText="Cells use energy to function."
        conversationId="conversation-1"
        parentMessageId="message-1"
      />,
    );

    fireEvent.click(screen.getByText('What kind of energy?'));

    await waitFor(() => {
      expect(mockUpdateClarification).toHaveBeenCalledWith(
        expect.objectContaining({
          clarificationId: 'clarification-1',
          status: 'active',
        }),
      );
    });
  });

  it('opens the integration modal and saves merged parent content', async () => {
    render(
      <ClarificationBlock
        clarification={{ ...clarification, status: 'active' }}
        parentText="Cells use energy to function."
        conversationId="conversation-1"
        parentMessageId="message-1"
      />,
    );

    fireEvent.click(screen.getByLabelText('com_ui_integrate_into_parent'));

    fireEvent.change(screen.getByRole('textbox'), {
      target: {
        value: 'Cells use energy to function.\n\nATP is the immediate usable energy currency.',
      },
    });
    fireEvent.click(screen.getAllByText('com_ui_save')[0]);

    await waitFor(() => {
      expect(mockIntegrateClarification).toHaveBeenCalledWith(
        expect.objectContaining({
          clarificationId: 'clarification-1',
          conversationId: 'conversation-1',
          parentMessageId: 'message-1',
        }),
      );
    });
  });
});
