import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import type { TVisualization } from 'librechat-data-provider';
import VisualizationRenderer from '../Renderer';

const mockRequestGet = jest.fn();

jest.mock('librechat-data-provider', () => ({
  apiBaseUrl: () => '',
  request: {
    get: (...args: unknown[]) => mockRequestGet(...args),
  },
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

jest.mock('~/components/Messages/Content/Mermaid', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const baseVisualization: TVisualization = {
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

describe('VisualizationRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders html visualizations in a sandboxed iframe', () => {
    render(<VisualizationRenderer visualization={baseVisualization} />);

    const iframe = screen.getByTitle('Phase plane');

    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
    expect(iframe).toHaveAttribute('srcdoc', '<html><body>phase plane</body></html>');
    expect(iframe).toHaveAttribute('csp');
    expect(mockRequestGet).not.toHaveBeenCalled();
  });

  it('fetches html render content through the authenticated request client when needed', async () => {
    mockRequestGet.mockResolvedValue('<html><body>fetched phase plane</body></html>');
    const fetchedVisualization: TVisualization = {
      ...baseVisualization,
      visualizationId: 'visualization-remote',
      compiledRenderText: null,
      compiledRenderStoragePath: 'uploads/visualizations/visualization-remote.html',
    };

    render(<VisualizationRenderer visualization={fetchedVisualization} />);

    await waitFor(() => {
      expect(screen.getByTitle('Phase plane')).toHaveAttribute(
        'srcdoc',
        '<html><body>fetched phase plane</body></html>',
      );
    });

    expect(mockRequestGet).toHaveBeenCalledWith('/api/visualizations/visualization-remote/render');
  });

  it('renders svg visualizations inline', () => {
    const svgVisualization: TVisualization = {
      ...baseVisualization,
      visualizationId: 'visualization-2',
      artifactType: 'svg',
      canonicalSourceText: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>',
      canonicalSourceMimeType: 'image/svg+xml',
      compiledRenderText: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>',
      compiledRenderMimeType: 'image/svg+xml',
    };

    const { container } = render(<VisualizationRenderer visualization={svgVisualization} />);

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelector('circle')).toBeInTheDocument();
  });
});
