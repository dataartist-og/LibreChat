const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  updateClarification,
  integrateClarification,
  reanchorClarification,
} = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const db = require('~/models');

const router = express.Router();

const deps = {
  getConvo: db.getConvo,
  getMessages: db.getMessages,
  getMessage: db.getMessage,
  createClarification: db.createClarification,
  listClarifications: db.listClarifications,
  getClarification: db.getClarification,
  updateClarification: db.updateClarification,
  createMessageRevision: db.createMessageRevision,
  listMessageRevisions: db.listMessageRevisions,
  saveMessage: db.saveMessage,
  listProjectSources: db.listProjectSources,
  getFiles: db.getFiles,
};

function handleClarificationError(res, error) {
  logger.error('[clarifications route] request failed', error);

  if (
    error.message === 'Clarification not found' ||
    error.message === 'Parent message not found'
  ) {
    return res.status(404).json({ error: error.message });
  }

  return res.status(400).json({ error: error.message || 'Clarification request failed' });
}

router.use(requireJwtAuth);

router.patch('/:clarificationId', async (req, res) => {
  try {
    const clarification = await updateClarification(
      deps,
      req.user.id,
      req.params.clarificationId,
      req.body,
    );

    if (!clarification) {
      return res.status(404).json({ error: 'Clarification not found' });
    }

    res.status(200).json(clarification);
  } catch (error) {
    handleClarificationError(res, error);
  }
});

router.post('/:clarificationId/integrate', async (req, res) => {
  try {
    const clarification = await integrateClarification(
      deps,
      {
        userId: req.user.id,
        isTemporary: req.body.isTemporary,
        interfaceConfig: req.config?.interfaceConfig,
      },
      {
        clarificationId: req.params.clarificationId,
        ...req.body,
      },
    );

    if (!clarification) {
      return res.status(404).json({ error: 'Clarification not found' });
    }

    res.status(200).json(clarification);
  } catch (error) {
    handleClarificationError(res, error);
  }
});

router.post('/:clarificationId/reanchor', async (req, res) => {
  try {
    const clarification = await reanchorClarification(deps, req.user.id, {
      clarificationId: req.params.clarificationId,
      ...req.body,
    });

    if (!clarification) {
      return res.status(404).json({ error: 'Clarification not found' });
    }

    res.status(200).json(clarification);
  } catch (error) {
    handleClarificationError(res, error);
  }
});

module.exports = router;
