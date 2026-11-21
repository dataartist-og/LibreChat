const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  listStudyDocuments,
  listExploreStudyDocuments,
  createStudyDocumentFromFile,
  getStudyDocumentWorkspace,
  getExploreStudyDocumentWorkspace,
  importStudyDocument,
  updateStudyDocumentSharing,
  reingestStudyDocument,
  createDocumentClarification,
  integrateDocumentClarification,
  archiveDocumentClarification,
  createDocumentVisualization,
  integrateDocumentVisualization,
  deleteDocumentVisualization,
  getDocumentVisualizationRenderPayload,
  getOrCreateDocumentSpeechManifest,
  getOrCreateDocumentSpeechAudioArtifact,
  getDocumentSpeechAudioPayload,
} = require('@librechat/api');
const { configMiddleware } = require('~/server/middleware');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { refreshStoredTextFileFromOriginal } = require('~/server/services/Files/process');
const db = require('~/models');

const router = express.Router();

const deps = {
  findFileById: db.findFileById,
  createStudyDocument: db.createStudyDocument,
  listStudyDocuments: db.listStudyDocuments,
  listExploreStudyDocuments: db.listExploreStudyDocuments,
  getStudyDocument: db.getStudyDocument,
  getOwnedStudyDocument: db.getOwnedStudyDocument,
  getSharedStudyDocument: db.getSharedStudyDocument,
  getStudyDocumentBySourceFile: db.getStudyDocumentBySourceFile,
  addStudyDocumentToLibrary: db.addStudyDocumentToLibrary,
  updateStudyDocument: db.updateStudyDocument,
  createDocumentRenderVersion: db.createDocumentRenderVersion,
  listDocumentRenderVersions: db.listDocumentRenderVersions,
  getDocumentRenderVersion: db.getDocumentRenderVersion,
  getActiveDocumentRenderVersion: db.getActiveDocumentRenderVersion,
  setActiveDocumentRenderVersion: db.setActiveDocumentRenderVersion,
  createDocumentOverlay: db.createDocumentOverlay,
  listDocumentOverlays: db.listDocumentOverlays,
  getActiveDocumentOverlay: db.getActiveDocumentOverlay,
  setActiveDocumentOverlay: db.setActiveDocumentOverlay,
  createDocumentClarification: db.createDocumentClarification,
  listDocumentClarifications: db.listDocumentClarifications,
  getDocumentClarification: db.getDocumentClarification,
  updateDocumentClarification: db.updateDocumentClarification,
  createDocumentVisualization: db.createDocumentVisualization,
  listDocumentVisualizations: db.listDocumentVisualizations,
  getDocumentVisualization: db.getDocumentVisualization,
  updateDocumentVisualization: db.updateDocumentVisualization,
  upsertDocumentSpeechPlan: db.upsertDocumentSpeechPlan,
  getDocumentSpeechPlan: db.getDocumentSpeechPlan,
  upsertDocumentSpeechSegments: db.upsertDocumentSpeechSegments,
  listDocumentSpeechSegments: db.listDocumentSpeechSegments,
  getDocumentSpeechSegment: db.getDocumentSpeechSegment,
  upsertDocumentSpeechAudioArtifact: db.upsertDocumentSpeechAudioArtifact,
  listDocumentSpeechAudioArtifacts: db.listDocumentSpeechAudioArtifacts,
  getDocumentSpeechAudioArtifact: db.getDocumentSpeechAudioArtifact,
  createFile: db.createFile,
  createLearnerProfile: db.createLearnerProfile,
  getLearnerProfile: db.getLearnerProfile,
  updateLearnerProfile: db.updateLearnerProfile,
  listLearnerKnowledgeNodes: db.listLearnerKnowledgeNodes,
  getLearnerKnowledgeNodeByLabel: db.getLearnerKnowledgeNodeByLabel,
  upsertLearnerKnowledgeNode: db.upsertLearnerKnowledgeNode,
  listLearnerKnowledgeEdges: db.listLearnerKnowledgeEdges,
  upsertLearnerKnowledgeEdge: db.upsertLearnerKnowledgeEdge,
  createLearnerEvent: db.createLearnerEvent,
  listLearnerEvents: db.listLearnerEvents,
};

function setRenderHeaders(res, mimeType) {
  res.set({
    'Cache-Control': 'private, max-age=60',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });

  if (mimeType === 'text/html') {
    res.set({
      'Content-Security-Policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src data: blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self';",
      'X-Frame-Options': 'SAMEORIGIN',
    });
  }
}

function handleDocumentError(res, error) {
  logger.error('[documents route] request failed', error);

  if (
    error.message === 'Document not found' ||
    error.message === 'Document render version not found' ||
    error.message === 'Document clarification not found' ||
    error.message === 'Document visualization not found' ||
    error.message === 'Source file not found' ||
    error.message === 'Document speech segment not found' ||
    error.message === 'Document speech audio not found'
  ) {
    return res.status(404).json({ error: error.message });
  }

  return res.status(400).json({ error: error.message || 'Document request failed' });
}

router.use(requireJwtAuth);
router.use(configMiddleware);

router.get('/', async (req, res) => {
  try {
    const documents = await listStudyDocuments(deps, req.user.id, {
      projectId: req.query.projectId ?? undefined,
    });
    res.status(200).json(documents);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.get('/explore', async (req, res) => {
  try {
    const documents = await listExploreStudyDocuments(deps, req.user.id, {
      projectId: req.query.projectId ?? undefined,
    });
    res.status(200).json(documents);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.post('/', async (req, res) => {
  try {
    const workspace = await createStudyDocumentFromFile(deps, req.user.id, req.body);
    res.status(201).json(workspace);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.get('/explore/:documentId', async (req, res) => {
  try {
    const workspace = await getExploreStudyDocumentWorkspace(
      deps,
      req.user.id,
      req.params.documentId,
    );
    res.status(200).json(workspace);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.post('/clarifications/:clarificationId/integrate', async (req, res) => {
  try {
    const clarification = await integrateDocumentClarification(deps, req.user.id, {
      clarificationId: req.params.clarificationId,
      ...req.body,
    });
    res.status(200).json(clarification);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.delete('/clarifications/:clarificationId', async (req, res) => {
  try {
    const clarification = await archiveDocumentClarification(
      deps,
      req.user.id,
      req.params.clarificationId,
    );
    res.status(200).json(clarification);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.get('/visualizations/:visualizationId/render', async (req, res) => {
  try {
    const payload = await getDocumentVisualizationRenderPayload(
      deps,
      req.user.id,
      req.params.visualizationId,
      {
        appConfig: req.config,
      },
    );

    setRenderHeaders(res, payload.mimeType);
    res.type(payload.mimeType);
    res.send(payload.body);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.post('/visualizations/:visualizationId/integrate', async (req, res) => {
  try {
    const visualization = await integrateDocumentVisualization(deps, req.user.id, {
      visualizationId: req.params.visualizationId,
      ...req.body,
    });
    res.status(200).json(visualization);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.delete('/visualizations/:visualizationId', async (req, res) => {
  try {
    const visualization = await deleteDocumentVisualization(
      deps,
      req.user.id,
      req.params.visualizationId,
    );
    res.status(200).json(visualization);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.post('/:documentId/reingest', async (req, res) => {
  try {
    const document = await db.getOwnedStudyDocument(req.user.id, req.params.documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    const sourceFile = await db.findFileById(document.sourceFileId);
    if (!sourceFile) {
      throw new Error('Source file not found');
    }

    await refreshStoredTextFileFromOriginal({ req, file: sourceFile });
    const workspace = await reingestStudyDocument(deps, req.user.id, req.params.documentId);
    res.status(200).json(workspace);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.post('/:documentId/import', async (req, res) => {
  try {
    const workspace = await importStudyDocument(deps, req.user.id, req.params.documentId);
    res.status(200).json(workspace);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.patch('/:documentId/sharing', async (req, res) => {
  try {
    const document = await updateStudyDocumentSharing(deps, req.user.id, {
      documentId: req.params.documentId,
      sharingVisibility: req.body.sharingVisibility,
    });
    res.status(200).json(document);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.post('/:documentId/clarifications', async (req, res) => {
  try {
    const clarification = await createDocumentClarification(deps, req.user.id, {
      documentId: req.params.documentId,
      ...req.body,
    });
    res.status(201).json(clarification);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.post('/:documentId/visualizations', async (req, res) => {
  try {
    const visualization = await createDocumentVisualization(
      deps,
      req.user.id,
      {
        documentId: req.params.documentId,
        ...req.body,
      },
      {
        appConfig: req.config,
      },
    );
    res.status(201).json(visualization);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.post('/:documentId/speech/manifest', async (req, res) => {
  try {
    const manifest = await getOrCreateDocumentSpeechManifest(
      deps,
      req.user.id,
      req.params.documentId,
      req.body,
      {
        appConfig: req.config,
      },
    );
    res.status(200).json(manifest);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.post('/:documentId/speech/audio', async (req, res) => {
  try {
    const artifact = await getOrCreateDocumentSpeechAudioArtifact(
      deps,
      req.user.id,
      req.params.documentId,
      req.body,
      {
        appConfig: req.config,
      },
    );
    res.status(200).json(artifact);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.get('/:documentId/speech/audio/:audioArtifactId', async (req, res) => {
  try {
    const payload = await getDocumentSpeechAudioPayload(
      deps,
      req.user.id,
      req.params.documentId,
      req.params.audioArtifactId,
    );

    res.set({
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    res.type(payload.mimeType);
    res.sendFile(payload.filePath, {
      headers: {
        'Content-Disposition': `inline; filename="${payload.filename}"`,
      },
    });
  } catch (error) {
    handleDocumentError(res, error);
  }
});

router.get('/:documentId', async (req, res) => {
  try {
    const workspace = await getStudyDocumentWorkspace(deps, req.user.id, req.params.documentId);
    res.status(200).json(workspace);
  } catch (error) {
    handleDocumentError(res, error);
  }
});

module.exports = router;
