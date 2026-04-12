const express = require('express');
const request = require('supertest');

const mockGetVisualizationRenderPayload = jest.fn();
const mockSuggestVisualizationOptions = jest.fn();
const mockRefineVisualization = jest.fn();

jest.mock('@librechat/api', () => ({
  createVisualization: jest.fn(),
  listVisualizations: jest.fn(),
  getVisualization: jest.fn(),
  updateVisualization: jest.fn(),
  regenerateVisualization: jest.fn(),
  refineVisualization: (...args) => mockRefineVisualization(...args),
  integrateVisualization: jest.fn(),
  duplicateVisualization: jest.fn(),
  deleteVisualization: jest.fn(),
  getVisualizationRenderPayload: (...args) => mockGetVisualizationRenderPayload(...args),
  suggestVisualizationOptions: (...args) => mockSuggestVisualizationOptions(...args),
}));

jest.mock('~/server/middleware/requireJwtAuth', () => (req, _res, next) => {
  req.user = { id: 'user-1' };
  req.config = {};
  next();
});

jest.mock('~/models', () => ({
  getConvo: jest.fn(),
  getMessages: jest.fn(),
  getMessage: jest.fn(),
  createVisualization: jest.fn(),
  listVisualizations: jest.fn(),
  listVisualizationVersions: jest.fn(),
  getVisualization: jest.fn(),
  updateVisualization: jest.fn(),
  setVisualizationLatestVersion: jest.fn(),
  getLatestVisualizationVersion: jest.fn(),
  listProjectSources: jest.fn(),
  getFiles: jest.fn(),
}));

const visualizationsRoute = require('./visualizations');

describe('visualizations route', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use('/api/visualizations', visualizationsRoute);
  });

  it('returns strict headers for html render payloads', async () => {
    mockGetVisualizationRenderPayload.mockResolvedValue({
      body: '<!DOCTYPE html><html><body>phase portrait</body></html>',
      isBinary: false,
      mimeType: 'text/html',
    });

    const response = await request(app).get('/api/visualizations/visualization-1/render');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.text).toContain('phase portrait');
  });

  it('serves binary image payloads with the requested mime type', async () => {
    mockGetVisualizationRenderPayload.mockResolvedValue({
      body: Buffer.from([1, 2, 3, 4]),
      isBinary: true,
      mimeType: 'image/png',
    });

    const response = await request(app).get('/api/visualizations/visualization-2/render');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['content-security-policy']).toBeUndefined();
    expect(response.body).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it('returns model-generated visualization options', async () => {
    mockSuggestVisualizationOptions.mockResolvedValue({
      contentProfile: 'conceptual',
      focusSummary: 'A diagram would likely help explain the passage.',
      suggestions: [
        {
          label: 'Flow sketch',
          artifactType: 'mermaid',
          proposedPrompt: 'Create a mermaid diagram for the highlighted passage.',
          understandingGain: 'It would make the sequence easier to understand.',
          reasoning: 'A flow diagram fits the structure.',
        },
      ],
    });

    const response = await request(app).post('/api/visualizations/options').send({
      conversationId: 'conversation-1',
      parentMessageId: 'message-1',
      anchorStart: 0,
      anchorEnd: 5,
      anchorText: 'phase',
      anchorContextBefore: 'A ',
      anchorContextAfter: ' portrait',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        contentProfile: 'conceptual',
      }),
    );
    expect(mockSuggestVisualizationOptions).toHaveBeenCalled();
  });

  it('refines an existing visualization into a new version', async () => {
    mockRefineVisualization.mockResolvedValue({
      visualizationId: 'visualization-1',
      versionNumber: 2,
    });

    const response = await request(app).post('/api/visualizations/visualization-1/refine').send({
      instruction: 'Add controls for the poles.',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        visualizationId: 'visualization-1',
        versionNumber: 2,
      }),
    );
    expect(mockRefineVisualization).toHaveBeenCalled();
  });
});
