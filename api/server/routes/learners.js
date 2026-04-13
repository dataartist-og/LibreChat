const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { getLearnerWorkspace } = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const db = require('~/models');

const router = express.Router();

const deps = {
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

function handleLearnerError(res, error) {
  logger.error('[learners route] request failed', error);
  return res.status(400).json({ error: error.message || 'Learner request failed' });
}

router.use(requireJwtAuth);

router.get('/me', async (req, res) => {
  try {
    const learner = await getLearnerWorkspace(deps, req.user.id);
    res.status(200).json(learner);
  } catch (error) {
    handleLearnerError(res, error);
  }
});

module.exports = router;
