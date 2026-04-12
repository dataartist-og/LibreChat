const express = require('express');
const request = require('supertest');

const mockCreateStudyDocumentFromFile = jest.fn();
const mockGetStudyDocumentWorkspace = jest.fn();
const mockGetDocumentVisualizationRenderPayload = jest.fn();

jest.mock('@librechat/api', () => ({
  listStudyDocuments: jest.fn(),
  createStudyDocumentFromFile: (...args) => mockCreateStudyDocumentFromFile(...args),
  getStudyDocumentWorkspace: (...args) => mockGetStudyDocumentWorkspace(...args),
  reingestStudyDocument: jest.fn(),
  createDocumentClarification: jest.fn(),
  integrateDocumentClarification: jest.fn(),
  archiveDocumentClarification: jest.fn(),
  createDocumentVisualization: jest.fn(),
  integrateDocumentVisualization: jest.fn(),
  deleteDocumentVisualization: jest.fn(),
  getDocumentVisualizationRenderPayload: (...args) =>
    mockGetDocumentVisualizationRenderPayload(...args),
}));

jest.mock('~/server/middleware/requireJwtAuth', () => (req, _res, next) => {
  req.user = { id: 'user-1' };
  req.config = {};
  next();
});

jest.mock('~/models', () => ({
  findFileById: jest.fn(),
  createStudyDocument: jest.fn(),
  listStudyDocuments: jest.fn(),
  getStudyDocument: jest.fn(),
  getStudyDocumentBySourceFile: jest.fn(),
  updateStudyDocument: jest.fn(),
  createDocumentRenderVersion: jest.fn(),
  listDocumentRenderVersions: jest.fn(),
  getDocumentRenderVersion: jest.fn(),
  getActiveDocumentRenderVersion: jest.fn(),
  setActiveDocumentRenderVersion: jest.fn(),
  createDocumentOverlay: jest.fn(),
  listDocumentOverlays: jest.fn(),
  getActiveDocumentOverlay: jest.fn(),
  setActiveDocumentOverlay: jest.fn(),
  createDocumentClarification: jest.fn(),
  listDocumentClarifications: jest.fn(),
  getDocumentClarification: jest.fn(),
  updateDocumentClarification: jest.fn(),
  createDocumentVisualization: jest.fn(),
  listDocumentVisualizations: jest.fn(),
  getDocumentVisualization: jest.fn(),
  updateDocumentVisualization: jest.fn(),
}));

const documentsRoute = require('./documents');

describe('documents route', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/documents', documentsRoute);
  });

  it('returns strict headers for html visualization render payloads', async () => {
    mockGetDocumentVisualizationRenderPayload.mockResolvedValue({
      body: '<!DOCTYPE html><html><body>entropy plot</body></html>',
      isBinary: false,
      mimeType: 'text/html',
    });

    const response = await request(app).get('/api/documents/visualizations/visualization-1/render');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.text).toContain('entropy plot');
  });

  it('returns 404 when a requested document workspace does not exist', async () => {
    mockGetStudyDocumentWorkspace.mockRejectedValueOnce(new Error('Document not found'));

    const response = await request(app).get('/api/documents/document-404');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Document not found' });
  });

  it('creates a study document workspace', async () => {
    mockCreateStudyDocumentFromFile.mockResolvedValue({
      document: {
        documentId: 'document-1',
        sourceFileId: 'file-1',
      },
      renderVersion: {
        renderVersionId: 'render-1',
      },
      overlay: null,
      clarifications: [],
      visualizations: [],
    });

    const response = await request(app).post('/api/documents').send({
      sourceFileId: 'file-1',
    });

    expect(response.status).toBe(201);
    expect(response.body.document.documentId).toBe('document-1');
    expect(mockCreateStudyDocumentFromFile).toHaveBeenCalled();
  });
});
