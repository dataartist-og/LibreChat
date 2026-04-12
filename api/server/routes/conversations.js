const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  createClarification,
  listClarifications,
  suggestClarificationOptions,
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
  logger.error('[conversations clarifications route] request failed', error);

  if (error.message === 'Conversation not found' || error.message === 'Parent message not found') {
    return res.status(404).json({ error: error.message });
  }

  return res.status(400).json({ error: error.message || 'Clarification request failed' });
}

router.use(requireJwtAuth);

router.get('/:conversationId/clarifications', async (req, res) => {
  try {
    const clarifications = await listClarifications(deps, req.user.id, {
      conversationId: req.params.conversationId,
      parentMessageId: req.query.parentMessageId,
      includeArchived: req.query.includeArchived === 'true',
    });
    res.status(200).json(clarifications);
  } catch (error) {
    handleClarificationError(res, error);
  }
});

router.post('/:conversationId/clarifications', async (req, res) => {
  try {
    const clarification = await createClarification(deps, req.user.id, {
      ...req.body,
      conversationId: req.params.conversationId,
    });
    res.status(201).json(clarification);
  } catch (error) {
    handleClarificationError(res, error);
  }
});

router.post('/:conversationId/clarifications/options', async (req, res) => {
  try {
    const suggestions = await suggestClarificationOptions(deps, req.user.id, {
      ...req.body,
      conversationId: req.params.conversationId,
    });
    res.status(200).json(suggestions);
  } catch (error) {
    handleClarificationError(res, error);
  }
});

module.exports = router;
