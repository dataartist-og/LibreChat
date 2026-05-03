import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  TDocumentClarification,
  TDocumentVisualization,
  TDocumentWorkspace,
} from 'librechat-data-provider';
import DocumentViewer from '../Viewer';

const mockCreateClarification = jest.fn();
const mockCreateVisualization = jest.fn();
const mockMarkdownLite = jest.fn(({ content }: { content?: string }) => <div>{content}</div>);

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  OGDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  OGDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OGDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OGDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: (props: { content?: string }) => mockMarkdownLite(props),
}));

jest.mock('~/data-provider/Documents', () => ({
  useCreateDocumentClarificationMutation: () => ({
    mutateAsync: mockCreateClarification,
    isLoading: false,
  }),
  useCreateDocumentVisualizationMutation: () => ({
    mutateAsync: mockCreateVisualization,
    isLoading: false,
  }),
}));

jest.mock('../ClarificationCard', () => ({
  __esModule: true,
  default: ({ clarification }: { clarification: TDocumentClarification }) => (
    <div>{clarification.clarificationQuestion}</div>
  ),
}));

jest.mock('../VisualizationCard', () => ({
  __esModule: true,
  default: ({ visualization }: { visualization: TDocumentVisualization }) => (
    <div>{visualization.title}</div>
  ),
}));

const baseWorkspace: TDocumentWorkspace = {
  document: {
    documentId: 'document-1',
    projectId: 'project-1',
    sourceFileId: 'file-1',
    title: 'Entropy Notes',
    sourceMimeType: 'application/pdf',
    sourceKind: 'pdf',
    ingestionStatus: 'ready',
    ingestionStrategy: 'document_parser',
    activeRenderVersionId: 'render-1',
    activeOverlayId: 'overlay-1',
    createdByUserId: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  renderVersion: {
    renderVersionId: 'render-1',
    documentId: 'document-1',
    versionNumber: 1,
    documentIrJson: {
      documentId: 'document-1',
      projectId: 'project-1',
      sourceFileId: 'file-1',
      sourceType: 'application/pdf',
      title: 'Entropy Notes',
      blocks: [
        {
          blockId: 'block-1',
          type: 'paragraph',
          level: null,
          title: null,
          sourcePageStart: 1,
          sourcePageEnd: 1,
          contentMarkdown: 'Entropy increases in isolated systems.',
          contentHtml: null,
          plainText: 'Entropy increases in isolated systems.',
          anchorPath: 'block:block-1',
        },
      ],
      outline: [],
      citations: [],
      assets: [],
      mathSpans: [],
      anchorIndex: {
        'block-1': {
          blockId: 'block-1',
          type: 'paragraph',
        },
      },
      renderVersion: 1,
    },
    renderHtml: null,
    outlineJson: [],
    assetsJson: [],
    createdByUserId: 'user-1',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  overlay: {
    overlayId: 'overlay-1',
    documentId: 'document-1',
    renderVersionId: 'render-1',
    overlayVersionNumber: 1,
    overlayJson: {
      integratedClarificationIds: [],
      integratedVisualizationIds: [],
    },
    createdByUserId: 'user-1',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  clarifications: [
    {
      clarificationId: 'clarification-1',
      documentId: 'document-1',
      renderVersionId: 'render-1',
      overlayId: null,
      anchor: {
        blockId: 'block-1',
        blockType: 'paragraph',
        anchorText: 'Entropy',
        anchorContextBefore: '',
        anchorContextAfter: ' increases in isolated systems.',
        startOffset: 0,
        endOffset: 7,
        headingPath: [],
        pageStart: 1,
        pageEnd: 1,
      },
      clarificationQuestion: 'What does entropy mean?',
      clarificationAnswer: 'It measures compatible microscopic states.',
      promptText: 'What does entropy mean?',
      modelProvider: 'openai',
      modelName: 'gpt-4o-mini',
      status: 'active',
      integratedAt: null,
      createdByUserId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  visualizations: [
    {
      visualizationId: 'visualization-1',
      documentId: 'document-1',
      renderVersionId: 'render-1',
      overlayId: null,
      anchor: {
        blockId: 'block-1',
        blockType: 'paragraph',
        anchorText: 'Entropy',
        anchorContextBefore: '',
        anchorContextAfter: ' increases in isolated systems.',
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
      canonicalSourceText: '<svg viewBox="0 0 10 10"></svg>',
      canonicalSourceMimeType: 'image/svg+xml',
      compiledRenderText: '<svg viewBox="0 0 10 10"></svg>',
      compiledRenderMimeType: 'image/svg+xml',
      compiledRenderStoragePath: null,
      sourcePrompt: 'Draw an entropy curve',
      generationModel: 'gpt-4o-mini',
      generationMetadata: {
        warnings: [],
      },
      integrationState: 'nested_only',
      isLatestVersion: true,
      versionNumber: 1,
      parentVisualizationId: null,
      rootVisualizationId: 'visualization-1',
      integratedAt: null,
      deletedAt: null,
      createdByUserId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
};

describe('DocumentViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkdownLite.mockClear();
    mockCreateClarification.mockResolvedValue({});
    mockCreateVisualization.mockResolvedValue({});
  });

  it('renders grouped document augmentations under the selected excerpt', () => {
    render(<DocumentViewer workspace={baseWorkspace} />);

    expect(screen.getByText('com_ui_selected_excerpt')).toBeInTheDocument();
    expect(screen.getByText('What does entropy mean?')).toBeInTheDocument();
    expect(screen.getByText('Entropy curve')).toBeInTheDocument();
    expect(screen.getByText('Entropy')).toBeInTheDocument();
  });

  it('starts and pauses speech playback from block controls', () => {
    const onPausePlayback = jest.fn();
    const onPlayFromBlock = jest.fn();
    const { rerender } = render(
      <DocumentViewer
        workspace={baseWorkspace}
        onPausePlayback={onPausePlayback}
        onPlayFromBlock={onPlayFromBlock}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_document_tts_play_from_here' }));

    expect(onPlayFromBlock).toHaveBeenCalledWith('block-1');

    const idleActionContainer = document.querySelector('[data-document-block-actions="block-1"]');

    expect(idleActionContainer).toHaveClass('pointer-events-none');
    expect(idleActionContainer).toHaveClass('opacity-0');
    expect(idleActionContainer).toHaveClass('group-hover:opacity-100');
    expect(idleActionContainer).not.toHaveClass('group-focus-within:opacity-100');

    rerender(
      <DocumentViewer
        workspace={baseWorkspace}
        playbackState={{
          currentBlockId: 'block-1',
          isPausedForVisual: false,
          isPlaying: true,
          isPreparing: false,
        }}
        onPausePlayback={onPausePlayback}
        onPlayFromBlock={onPlayFromBlock}
      />,
    );

    const activeActionContainer = document.querySelector('[data-document-block-actions="block-1"]');

    expect(activeActionContainer).toHaveClass('pointer-events-none');
    expect(activeActionContainer).toHaveClass('opacity-0');
    expect(activeActionContainer).not.toHaveClass('opacity-100');
    expect(activeActionContainer).not.toHaveClass('group-focus-within:opacity-100');

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_document_tts_pause' }));

    expect(onPausePlayback).toHaveBeenCalled();
  });

  it('creates a clarification from the block-level document action', async () => {
    render(<DocumentViewer workspace={baseWorkspace} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'com_ui_clarify' })[0]);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Explain entropy in this sentence.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_generate' }));

    await waitFor(() => {
      expect(mockCreateClarification).toHaveBeenCalledWith({
        documentId: 'document-1',
        renderVersionId: 'render-1',
        anchor: {
          blockId: 'block-1',
          blockType: 'paragraph',
          anchorText: 'Entropy increases in isolated systems.',
          anchorContextBefore: '',
          anchorContextAfter: '',
          startOffset: 0,
          endOffset: 38,
          headingPath: [],
          pageStart: 1,
          pageEnd: 1,
        },
        clarificationQuestion: 'Explain entropy in this sentence.',
      });
    });
  });

  it('creates a visualization from the block-level document action', async () => {
    render(<DocumentViewer workspace={baseWorkspace} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'com_ui_visualize' })[0]);
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'html_app' },
    });
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Build a small interactive entropy visualization.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_generate' }));

    await waitFor(() => {
      expect(mockCreateVisualization).toHaveBeenCalledWith({
        documentId: 'document-1',
        renderVersionId: 'render-1',
        anchor: {
          blockId: 'block-1',
          blockType: 'paragraph',
          anchorText: 'Entropy increases in isolated systems.',
          anchorContextBefore: '',
          anchorContextAfter: '',
          startOffset: 0,
          endOffset: 38,
          headingPath: [],
          pageStart: 1,
          pageEnd: 1,
        },
        prompt: 'Build a small interactive entropy visualization.',
        artifactType: 'html_app',
      });
    });
  });

  it('decodes OCR html entities before rendering markdown content', () => {
    const workspace: TDocumentWorkspace = {
      ...baseWorkspace,
      renderVersion: {
        ...baseWorkspace.renderVersion,
        documentIrJson: {
          ...baseWorkspace.renderVersion.documentIrJson,
          blocks: [
            {
              blockId: 'block-math',
              type: 'paragraph',
              assetId: null,
              level: null,
              title: null,
              sourcePageStart: 1,
              sourcePageEnd: 1,
              contentMarkdown: "For internal states $s_0 &lt; s &lt; s_f$, the flow is defined.",
              contentHtml: null,
              plainText: 'For internal states s_0 < s < s_f, the flow is defined.',
              anchorPath: 'block:block-math',
            },
          ],
          assets: [],
          anchorIndex: {
            'block-math': {
              blockId: 'block-math',
              type: 'paragraph',
            },
          },
        },
      },
      clarifications: [],
      visualizations: [],
    };

    render(<DocumentViewer workspace={workspace} />);

    expect(
      screen.getByText('For internal states $s_0 < s < s_f$, the flow is defined.'),
    ).toBeInTheDocument();
  });

  it('renders hydrated figure assets inline with their captions', () => {
    const workspace: TDocumentWorkspace = {
      ...baseWorkspace,
      renderVersion: {
        ...baseWorkspace.renderVersion,
        documentIrJson: {
          ...baseWorkspace.renderVersion.documentIrJson,
          blocks: [
            {
              blockId: 'block-figure',
              type: 'figure',
              assetId: 'asset-figure-1',
              level: null,
              title: null,
              sourcePageStart: 1,
              sourcePageEnd: 1,
              contentMarkdown: '*Figure 1: Flow network diagram.*',
              contentHtml: null,
              plainText: 'Figure 1: Flow network diagram.',
              anchorPath: 'block:block-figure',
            },
          ],
          assets: [
            {
              assetId: 'asset-figure-1',
              dataUri: 'data:image/png;base64,ZmFrZQ==',
            },
          ],
          anchorIndex: {
            'block-figure': {
              blockId: 'block-figure',
              type: 'figure',
            },
          },
        },
        assetsJson: [
          {
            assetId: 'asset-figure-1',
            dataUri: 'data:image/png;base64,ZmFrZQ==',
          },
        ],
      },
      clarifications: [],
      visualizations: [],
    };

    render(<DocumentViewer workspace={workspace} />);

    expect(screen.getByRole('img', { name: 'Figure 1: Flow network diagram.' })).toHaveAttribute(
      'src',
      'data:image/png;base64,ZmFrZQ==',
    );
    expect(screen.getByText('*Figure 1: Flow network diagram.*')).toBeInTheDocument();
  });

  it('rewrites OCR image placeholders to hydrated data URIs for inline markdown figures', () => {
    const workspace: TDocumentWorkspace = {
      ...baseWorkspace,
      renderVersion: {
        ...baseWorkspace.renderVersion,
        documentIrJson: {
          ...baseWorkspace.renderVersion.documentIrJson,
          blocks: [
            {
              blockId: 'block-inline-figure',
              type: 'paragraph',
              assetId: null,
              level: null,
              title: null,
              sourcePageStart: 1,
              sourcePageEnd: 1,
              contentMarkdown: '![img-3.jpeg](img-3.jpeg)\n\nFigure 4: Crystal mode exploration.',
              contentHtml: null,
              plainText: 'img-3.jpeg Figure 4: Crystal mode exploration.',
              anchorPath: 'block:block-inline-figure',
            },
          ],
          assets: [
            {
              assetId: 'ocr-figure-1-1-img-3.jpeg',
              ocrImageId: 'img-3.jpeg',
              dataUri: 'data:image/png;base64,ZmFrZQ==',
            },
          ],
          anchorIndex: {
            'block-inline-figure': {
              blockId: 'block-inline-figure',
              type: 'paragraph',
            },
          },
        },
        assetsJson: [
          {
            assetId: 'ocr-figure-1-1-img-3.jpeg',
            ocrImageId: 'img-3.jpeg',
            dataUri: 'data:image/png;base64,ZmFrZQ==',
          },
        ],
      },
      clarifications: [],
      visualizations: [],
    };

    render(<DocumentViewer workspace={workspace} />);

    expect(
      mockMarkdownLite.mock.calls.some(
        ([props]) =>
          typeof props?.content === 'string' &&
          props.content.includes('![img-3.jpeg](data:image/png;base64,ZmFrZQ==)'),
      ),
    ).toBe(true);
  });

  it('shows the active spoken excerpt when excerpt highlighting is enabled', () => {
    render(
      <DocumentViewer
        workspace={baseWorkspace}
        activeSpeech={{
          blockId: 'block-1',
          excerpt: 'Entropy increases in isolated systems.',
          segmentKind: 'text',
        }}
        highlightMode="excerpt"
      />,
    );

    expect(screen.getAllByText('Entropy increases in isolated systems.').length).toBeGreaterThan(1);
  });
});
