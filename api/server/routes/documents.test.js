const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

const mockListStudyDocuments = jest.fn();
const mockListExploreStudyDocuments = jest.fn();
const mockCreateStudyDocumentFromFile = jest.fn();
const mockGetStudyDocumentWorkspace = jest.fn();
const mockGetExploreStudyDocumentWorkspace = jest.fn();
const mockImportStudyDocument = jest.fn();
const mockUpdateStudyDocumentSharing = jest.fn();
const mockGetDocumentVisualizationRenderPayload = jest.fn();
const mockGetDocumentSpeechManifest = jest.fn();
const mockGetDocumentSpeechAudioArtifact = jest.fn();
const mockGetDocumentSpeechAudioPayload = jest.fn();

jest.mock('@librechat/api', () => ({
  listStudyDocuments: (...args) => mockListStudyDocuments(...args),
  listExploreStudyDocuments: (...args) => mockListExploreStudyDocuments(...args),
  createStudyDocumentFromFile: (...args) => mockCreateStudyDocumentFromFile(...args),
  getStudyDocumentWorkspace: (...args) => mockGetStudyDocumentWorkspace(...args),
  getExploreStudyDocumentWorkspace: (...args) => mockGetExploreStudyDocumentWorkspace(...args),
  importStudyDocument: (...args) => mockImportStudyDocument(...args),
  updateStudyDocumentSharing: (...args) => mockUpdateStudyDocumentSharing(...args),
  reingestStudyDocument: jest.fn(),
  createDocumentClarification: jest.fn(),
  integrateDocumentClarification: jest.fn(),
  archiveDocumentClarification: jest.fn(),
  createDocumentVisualization: jest.fn(),
  integrateDocumentVisualization: jest.fn(),
  deleteDocumentVisualization: jest.fn(),
  getDocumentVisualizationRenderPayload: (...args) =>
    mockGetDocumentVisualizationRenderPayload(...args),
  getOrCreateDocumentSpeechManifest: (...args) => mockGetDocumentSpeechManifest(...args),
  getOrCreateDocumentSpeechAudioArtifact: (...args) => mockGetDocumentSpeechAudioArtifact(...args),
  getDocumentSpeechAudioPayload: (...args) => mockGetDocumentSpeechAudioPayload(...args),
}));

jest.mock('~/server/middleware/requireJwtAuth', () => (req, _res, next) => {
  req.user = { id: 'user-1' };
  next();
});

jest.mock('~/server/middleware', () => ({
  configMiddleware: (req, _res, next) => {
    req.config = {};
    next();
  },
}));

jest.mock('~/models', () => ({
  findFileById: jest.fn(),
  createFile: jest.fn(),
  createStudyDocument: jest.fn(),
  listStudyDocuments: jest.fn(),
  getStudyDocument: jest.fn(),
  getOwnedStudyDocument: jest.fn(),
  getSharedStudyDocument: jest.fn(),
  getStudyDocumentBySourceFile: jest.fn(),
  addStudyDocumentToLibrary: jest.fn(),
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
  upsertDocumentSpeechPlan: jest.fn(),
  getDocumentSpeechPlan: jest.fn(),
  upsertDocumentSpeechSegments: jest.fn(),
  listDocumentSpeechSegments: jest.fn(),
  getDocumentSpeechSegment: jest.fn(),
  upsertDocumentSpeechAudioArtifact: jest.fn(),
  listDocumentSpeechAudioArtifacts: jest.fn(),
  getDocumentSpeechAudioArtifact: jest.fn(),
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

  it('returns the shared explore document list', async () => {
    mockListExploreStudyDocuments.mockResolvedValue([
      {
        documentId: 'document-2',
        title: 'Shared Notes',
      },
    ]);

    const response = await request(app).get('/api/documents/explore');

    expect(response.status).toBe(200);
    expect(response.body[0].documentId).toBe('document-2');
    expect(mockListExploreStudyDocuments).toHaveBeenCalled();
  });

  it('imports a shared document into the current user library', async () => {
    mockImportStudyDocument.mockResolvedValue({
      document: {
        documentId: 'document-2',
      },
      renderVersion: {
        renderVersionId: 'render-2',
      },
      overlay: null,
      clarifications: [],
      visualizations: [],
    });

    const response = await request(app).post('/api/documents/document-2/import').send({});

    expect(response.status).toBe(200);
    expect(response.body.document.documentId).toBe('document-2');
    expect(mockImportStudyDocument).toHaveBeenCalled();
  });

  it('updates document sharing visibility', async () => {
    mockUpdateStudyDocumentSharing.mockResolvedValue({
      documentId: 'document-1',
      sharingVisibility: 'private',
    });

    const response = await request(app)
      .patch('/api/documents/document-1/sharing')
      .send({ sharingVisibility: 'private' });

    expect(response.status).toBe(200);
    expect(response.body.sharingVisibility).toBe('private');
    expect(mockUpdateStudyDocumentSharing).toHaveBeenCalled();
  });

  it('returns a document speech manifest', async () => {
    mockGetDocumentSpeechManifest.mockResolvedValue({
      planId: 'plan-1',
      documentId: 'document-1',
      renderVersionId: 'render-1',
      speechSurfaceFingerprint: 'fingerprint-1',
      narrationPolicyVersion: 'document_speech_v1',
      resolvedProfile: {
        provider: 'openai',
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
        language: null,
        format: 'audio/mpeg',
        rate: null,
      },
      segments: [],
      startSegmentId: null,
      nextPrefetchSegmentIds: [],
    });

    const response = await request(app).post('/api/documents/document-1/speech/manifest').send({
      renderVersionId: 'render-1',
    });

    expect(response.status).toBe(200);
    expect(response.body.planId).toBe('plan-1');
    expect(mockGetDocumentSpeechManifest).toHaveBeenCalled();
  });

  it('streams a persisted document speech audio file', async () => {
    const tempFilePath = path.join(os.tmpdir(), `document-audio-${Date.now()}.mp3`);
    await fs.writeFile(tempFilePath, 'audio');

    mockGetDocumentSpeechAudioPayload.mockResolvedValue({
      filePath: tempFilePath,
      mimeType: 'audio/mpeg',
      filename: 'document-audio.mp3',
    });

    const response = await request(app).get(
      '/api/documents/document-1/speech/audio/audio-artifact-1',
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('audio/mpeg');
    expect(response.headers['cache-control']).toContain('private');
    expect(mockGetDocumentSpeechAudioPayload).toHaveBeenCalled();

    await fs.unlink(tempFilePath);
  });
});
