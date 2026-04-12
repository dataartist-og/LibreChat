import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TDocumentClarification, TDocumentVisualization } from 'librechat-data-provider';
import DocumentClarificationCard from '../ClarificationCard';
import DocumentVisualizationCard from '../VisualizationCard';

const mockIntegrateClarification = jest.fn();
const mockArchiveClarification = jest.fn();
const mockIntegrateVisualization = jest.fn();
const mockDeleteVisualization = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content?: string }) => <div>{content}</div>,
}));

jest.mock('~/components/Visualizations', () => ({
  VisualizationRenderer: () => <div>rendered visualization</div>,
}));

jest.mock('~/data-provider/Documents', () => ({
  useIntegrateDocumentClarificationMutation: () => ({
    mutateAsync: mockIntegrateClarification,
  }),
  useArchiveDocumentClarificationMutation: () => ({
    mutateAsync: mockArchiveClarification,
  }),
  useIntegrateDocumentVisualizationMutation: () => ({
    mutateAsync: mockIntegrateVisualization,
  }),
  useDeleteDocumentVisualizationMutation: () => ({
    mutateAsync: mockDeleteVisualization,
  }),
}));

const clarification: TDocumentClarification = {
  clarificationId: 'clarification-1',
  documentId: 'document-1',
  renderVersionId: 'render-1',
  overlayId: null,
  anchor: {
    blockId: 'block-1',
    blockType: 'paragraph',
    anchorText: 'Entropy',
    anchorContextBefore: '',
    anchorContextAfter: ' increases.',
    startOffset: 0,
    endOffset: 7,
    headingPath: [],
    pageStart: 1,
    pageEnd: 1,
  },
  clarificationQuestion: 'What does entropy mean?',
  clarificationAnswer: 'It counts compatible microscopic states.',
  promptText: 'What does entropy mean?',
  modelProvider: 'openai',
  modelName: 'gpt-5.4-mini',
  status: 'integrated',
  integratedAt: new Date().toISOString(),
  createdByUserId: 'user-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const visualization: TDocumentVisualization = {
  visualizationId: 'visualization-1',
  documentId: 'document-1',
  renderVersionId: 'render-1',
  overlayId: null,
  anchor: {
    blockId: 'block-1',
    blockType: 'paragraph',
    anchorText: 'Entropy',
    anchorContextBefore: '',
    anchorContextAfter: ' increases.',
    startOffset: 0,
    endOffset: 7,
    headingPath: [],
    pageStart: 1,
    pageEnd: 1,
  },
  title: 'Entropy curve',
  description: 'A simple SVG curve',
  artifactType: 'svg',
  status: 'ready',
  storageMode: 'db_inline',
  canonicalSourceText: '<svg></svg>',
  canonicalSourceMimeType: 'image/svg+xml',
  compiledRenderText: '<svg></svg>',
  compiledRenderMimeType: 'image/svg+xml',
  compiledRenderStoragePath: null,
  sourcePrompt: 'Draw the entropy curve',
  generationModel: 'gpt-5.4-mini',
  generationMetadata: {
    warnings: [],
  },
  integrationState: 'integrated',
  isLatestVersion: true,
  versionNumber: 1,
  parentVisualizationId: null,
  rootVisualizationId: 'visualization-1',
  integratedAt: new Date().toISOString(),
  deletedAt: null,
  createdByUserId: 'user-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('document augmentation cards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIntegrateClarification.mockResolvedValue({});
    mockArchiveClarification.mockResolvedValue({});
    mockIntegrateVisualization.mockResolvedValue({});
    mockDeleteVisualization.mockResolvedValue({});
  });

  it('shows integrated clarification state and toggles back to nested mode', async () => {
    render(
      <DocumentClarificationCard clarification={clarification} documentId={clarification.documentId} />,
    );

    expect(screen.getByText('com_ui_inline_clarification')).toBeInTheDocument();
    expect(screen.getByText('com_ui_integrated')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('com_ui_show_as_nested'));

    await waitFor(() => {
      expect(mockIntegrateClarification).toHaveBeenCalledWith({
        documentId: 'document-1',
        clarificationId: 'clarification-1',
        displayMode: 'nested',
      });
    });
  });

  it('shows integrated visualization state and toggles back to nested mode', async () => {
    render(
      <DocumentVisualizationCard visualization={visualization} documentId={visualization.documentId} />,
    );

    expect(screen.getByText('com_ui_visualization')).toBeInTheDocument();
    expect(screen.getByText('com_ui_integrated')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('com_ui_show_as_nested'));

    await waitFor(() => {
      expect(mockIntegrateVisualization).toHaveBeenCalledWith({
        documentId: 'document-1',
        visualizationId: 'visualization-1',
        displayMode: 'nested',
      });
    });
  });

  it('offers integrate action for nested visualizations', async () => {
    render(
      <DocumentVisualizationCard
        visualization={{ ...visualization, integrationState: 'nested_only', integratedAt: null }}
        documentId={visualization.documentId}
      />,
    );

    fireEvent.click(screen.getByLabelText('com_ui_integrate_into_parent'));

    await waitFor(() => {
      expect(mockIntegrateVisualization).toHaveBeenCalledWith({
        documentId: 'document-1',
        visualizationId: 'visualization-1',
        displayMode: 'integrated',
      });
    });
  });
});
