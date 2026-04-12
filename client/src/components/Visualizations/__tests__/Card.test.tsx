import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TVisualization } from 'librechat-data-provider';
import VisualizationCard from '../Card';

const mockIntegrateVisualization = jest.fn();
const mockRefineVisualization = jest.fn();

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
  useUpdateVisualizationMutation: () => ({
    mutateAsync: jest.fn(),
  }),
  useRegenerateVisualizationMutation: () => ({
    mutateAsync: jest.fn(),
  }),
  useRefineVisualizationMutation: () => ({
    mutateAsync: mockRefineVisualization,
    isLoading: false,
  }),
  useIntegrateVisualizationMutation: () => ({
    mutateAsync: mockIntegrateVisualization,
  }),
  useDuplicateVisualizationMutation: () => ({
    mutateAsync: jest.fn(),
  }),
  useDeleteVisualizationMutation: () => ({
    mutateAsync: jest.fn(),
  }),
}));

jest.mock('../Renderer', () => ({
  __esModule: true,
  default: ({ visualization }: { visualization: TVisualization }) => (
    <div>{visualization.title}</div>
  ),
}));

const visualization: TVisualization = {
  visualizationId: 'visualization-1',
  projectId: 'project-1',
  conversationId: 'conversation-1',
  parentMessageId: 'message-1',
  anchorStart: 0,
  anchorEnd: 10,
  anchorText: 'phase plane',
  anchorContextBefore: '',
  anchorContextAfter: '',
  anchorPath: null,
  inlineThreadId: null,
  parentVisualizationId: null,
  rootVisualizationId: 'visualization-1',
  title: 'Phase plane',
  description: 'A simple visualization',
  artifactType: 'html_app',
  status: 'ready',
  storageMode: 'db_inline',
  canonicalSourceText: '<html><body>phase plane</body></html>',
  canonicalSourceMimeType: 'text/html',
  compiledRenderText: '<html><body>phase plane</body></html>',
  compiledRenderMimeType: 'text/html',
  compiledRenderStoragePath: null,
  thumbnailUrl: null,
  sourcePrompt: 'Show the phase plane',
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
};

describe('VisualizationCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls integrate mutation from the action bar', async () => {
    render(
      <VisualizationCard
        visualization={visualization}
        conversationId="conversation-1"
        parentMessageId="message-1"
      />,
    );

    fireEvent.click(screen.getByLabelText('com_ui_integrate_into_parent'));

    await waitFor(() => {
      expect(mockIntegrateVisualization).toHaveBeenCalledWith(
        expect.objectContaining({
          visualizationId: 'visualization-1',
          messageId: 'message-1',
          displayMode: 'integrated',
        }),
      );
    });
  });

  it('submits a refinement instruction as a new visualization version', async () => {
    render(
      <VisualizationCard
        visualization={visualization}
        conversationId="conversation-1"
        parentMessageId="message-1"
      />,
    );

    fireEvent.click(screen.getByLabelText('com_ui_edit'));
    fireEvent.change(screen.getByPlaceholderText('com_ui_visualization_follow_up_placeholder'), {
      target: { value: 'Add a slider for pole order.' },
    });
    fireEvent.click(screen.getByText('com_ui_refine_visualization'));

    await waitFor(() => {
      expect(mockRefineVisualization).toHaveBeenCalledWith(
        expect.objectContaining({
          visualizationId: 'visualization-1',
          instruction: 'Add a slider for pole order.',
        }),
      );
    });
  });
});
