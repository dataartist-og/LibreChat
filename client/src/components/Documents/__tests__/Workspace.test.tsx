import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecoilRoot } from 'recoil';
import type { TDocumentWorkspace } from 'librechat-data-provider';
import store from '~/store';
import DocumentWorkspace from '../Workspace';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  OGDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  OGDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OGDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OGDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  useToastContext: () => ({
    showToast: jest.fn(),
  }),
}));

jest.mock('~/data-provider/Dialogs', () => ({
  useCreateStarterDialogMutation: () => ({
    mutateAsync: jest.fn(),
  }),
}));

jest.mock('~/data-provider/Documents', () => ({
  useImportStudyDocumentMutation: () => ({
    mutateAsync: jest.fn(),
  }),
  useReingestStudyDocumentMutation: () => ({
    mutateAsync: jest.fn(),
  }),
  useUpdateStudyDocumentSharingMutation: () => ({
    mutateAsync: jest.fn(),
  }),
}));

jest.mock('../Viewer', () => ({
  __esModule: true,
  default: () => <div data-testid="viewer" />,
}));

jest.mock('../Speech', () => ({
  __esModule: true,
  default: jest
    .requireActual<typeof import('react')>('react')
    .forwardRef(() => <div data-testid="speech-player" />),
}));

const workspace: TDocumentWorkspace = {
  document: {
    documentId: 'document-1',
    projectId: 'project-1',
    sourceFileId: 'file-1',
    title: 'Projective Geometry Notes',
    sourceMimeType: 'application/pdf',
    sourceKind: 'pdf',
    ingestionStatus: 'ready',
    ingestionStrategy: 'ocr_markdown',
    activeRenderVersionId: 'render-1',
    activeOverlayId: 'overlay-1',
    sharingVisibility: 'public',
    createdByUserId: 'user-1',
    isImported: false,
    isOwner: true,
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
      title: 'Projective Geometry Notes',
      blocks: [],
      outline: [],
      citations: [],
      assets: [],
      mathSpans: [],
      anchorIndex: {},
      renderVersion: 1,
    },
    renderHtml: null,
    outlineJson: [
      {
        id: 'outline-1',
        blockId: 'block-1',
        depth: 1,
        title: '1.6. The Complex Projective Line $\\mathbb{P}^1$',
      },
    ],
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
  clarifications: [],
  visualizations: [],
};

describe('DocumentWorkspace', () => {
  it('renders outline math with KaTeX instead of raw LaTeX source', () => {
    const { container } = render(
      <RecoilRoot initializeState={({ set }) => set(store.LaTeXParsing, true)}>
        <MemoryRouter>
          <DocumentWorkspace workspace={workspace} />
        </MemoryRouter>
      </RecoilRoot>,
    );

    const outlineButton = container.querySelector('aside button') as HTMLButtonElement | null;

    expect(outlineButton).toBeInTheDocument();
    expect(outlineButton).not.toHaveTextContent('$\\mathbb{P}^1$');
    expect(outlineButton).toHaveTextContent('1.6. The Complex Projective Line');
    expect(outlineButton.querySelector('.katex')).toBeInTheDocument();
    expect(container.querySelector('.katex')).toBeInTheDocument();
  });

  it('shows a parser fallback warning for pdf documents that were ingested without OCR', () => {
    const parserWorkspace: TDocumentWorkspace = {
      ...workspace,
      document: {
        ...workspace.document,
        ingestionStrategy: 'document_parser',
      },
    };

    const { getByText } = render(
      <RecoilRoot initializeState={({ set }) => set(store.LaTeXParsing, true)}>
        <MemoryRouter>
          <DocumentWorkspace workspace={parserWorkspace} />
        </MemoryRouter>
      </RecoilRoot>,
    );

    expect(getByText('com_ui_document_parser_warning_title')).toBeInTheDocument();
    expect(getByText('com_ui_document_parser_warning_body')).toBeInTheDocument();
  });
});
