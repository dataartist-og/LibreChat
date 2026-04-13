const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  createVisualization,
  listVisualizations,
  getVisualization,
  updateVisualization,
  regenerateVisualization,
  refineVisualization,
  integrateVisualization,
  duplicateVisualization,
  deleteVisualization,
  getVisualizationRenderPayload,
  suggestVisualizationOptions,
} = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const db = require('~/models');

const router = express.Router();

const deps = {
  getConvo: db.getConvo,
  getMessages: db.getMessages,
  getMessage: db.getMessage,
  createVisualization: db.createVisualization,
  listVisualizations: db.listVisualizations,
  listVisualizationVersions: db.listVisualizationVersions,
  getVisualization: db.getVisualization,
  updateVisualization: db.updateVisualization,
  setVisualizationLatestVersion: db.setVisualizationLatestVersion,
  getLatestVisualizationVersion: db.getLatestVisualizationVersion,
  listProjectSources: db.listProjectSources,
  getFiles: db.getFiles,
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

function handleVisualizationError(res, error) {
  logger.error('[visualizations route] request failed', error);

  if (
    error.message === 'Visualization not found' ||
    error.message === 'Parent message not found' ||
    error.message === 'Conversation not found'
  ) {
    return res.status(404).json({ error: error.message });
  }

  return res.status(400).json({ error: error.message || 'Visualization request failed' });
}

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

router.use(requireJwtAuth);

router.get('/', async (req, res) => {
  try {
    const visualizations = await listVisualizations(deps, req.user.id, {
      conversationId: req.query.conversationId,
      parentMessageId: req.query.parentMessageId ?? req.query.messageId,
      includeArchived: req.query.includeArchived === 'true',
      includeDeleted: req.query.includeDeleted === 'true',
      includeAllVersions: req.query.includeAllVersions !== 'false',
    });

    res.status(200).json(visualizations);
  } catch (error) {
    handleVisualizationError(res, error);
  }
});

router.post('/', async (req, res) => {
  try {
    const visualization = await createVisualization(
      deps,
      req.user.id,
      {
        ...req.body,
        parentMessageId: req.body.parentMessageId ?? req.body.messageId,
      },
      {
        appConfig: req.config,
      },
    );
    res.status(201).json(visualization);
  } catch (error) {
    handleVisualizationError(res, error);
  }
});

router.post('/options', async (req, res) => {
  try {
    const suggestions = await suggestVisualizationOptions(deps, req.user.id, req.body);
    res.status(200).json(suggestions);
  } catch (error) {
    handleVisualizationError(res, error);
  }
});

router.get('/:visualizationId/render', async (req, res) => {
  try {
    const payload = await getVisualizationRenderPayload(
      deps,
      req.user.id,
      req.params.visualizationId,
      {
        appConfig: req.config,
      },
    );

    setRenderHeaders(res, payload.mimeType);
    res.type(payload.mimeType);

    if (payload.isBinary) {
      res.send(payload.body);
      return;
    }

    res.send(payload.body);
  } catch (error) {
    handleVisualizationError(res, error);
  }
});

router.get('/:visualizationId', async (req, res) => {
  try {
    const visualization = await getVisualization(deps, req.user.id, req.params.visualizationId);
    if (!visualization) {
      return res.status(404).json({ error: 'Visualization not found' });
    }

    res.status(200).json(visualization);
  } catch (error) {
    handleVisualizationError(res, error);
  }
});

router.patch('/:visualizationId', async (req, res) => {
  try {
    const visualization = await updateVisualization(
      deps,
      req.user.id,
      req.params.visualizationId,
      req.body,
      { appConfig: req.config },
    );

    if (!visualization) {
      return res.status(404).json({ error: 'Visualization not found' });
    }

    res.status(200).json(visualization);
  } catch (error) {
    handleVisualizationError(res, error);
  }
});

router.post('/:visualizationId/regenerate', async (req, res) => {
  try {
    const visualization = await regenerateVisualization(
      deps,
      req.user.id,
      {
        visualizationId: req.params.visualizationId,
        ...req.body,
      },
      { appConfig: req.config },
    );

    res.status(200).json(visualization);
  } catch (error) {
    handleVisualizationError(res, error);
  }
});

router.post('/:visualizationId/refine', async (req, res) => {
  try {
    const visualization = await refineVisualization(
      deps,
      req.user.id,
      {
        visualizationId: req.params.visualizationId,
        ...req.body,
      },
      { appConfig: req.config },
    );

    res.status(200).json(visualization);
  } catch (error) {
    handleVisualizationError(res, error);
  }
});

router.post('/:visualizationId/integrate', async (req, res) => {
  try {
    const visualization = await integrateVisualization(deps, req.user.id, {
      visualizationId: req.params.visualizationId,
      ...req.body,
    });

    if (!visualization) {
      return res.status(404).json({ error: 'Visualization not found' });
    }

    res.status(200).json(visualization);
  } catch (error) {
    handleVisualizationError(res, error);
  }
});

router.post('/:visualizationId/duplicate', async (req, res) => {
  try {
    const visualization = await duplicateVisualization(
      deps,
      req.user.id,
      { visualizationId: req.params.visualizationId },
      { appConfig: req.config },
    );

    res.status(201).json(visualization);
  } catch (error) {
    handleVisualizationError(res, error);
  }
});

router.delete('/:visualizationId', async (req, res) => {
  try {
    const visualization = await deleteVisualization(deps, req.user.id, req.params.visualizationId);
    if (!visualization) {
      return res.status(404).json({ error: 'Visualization not found' });
    }

    res.status(200).json(visualization);
  } catch (error) {
    handleVisualizationError(res, error);
  }
});

module.exports = router;
