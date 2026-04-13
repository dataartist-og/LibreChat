const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  listDialogs,
  createDialog,
  createStarterDialog,
  getDialogWorkspace,
  getDialogTutorWorkspace,
  updateDialog,
  createDialogCell,
  updateDialogCell,
  executeDialogCell,
  runDialogTutorAction,
  selectDialogTrajectory,
  createDialogClarification,
  integrateDialogClarification,
  createDialogVisualization,
  integrateDialogVisualization,
  deleteDialogVisualization,
  getDialogVisualizationRenderPayload,
} = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const db = require('~/models');

const router = express.Router();

const deps = {
  createDialog: db.createDialog,
  listDialogs: db.listDialogs,
  getDialog: db.getDialog,
  updateDialog: db.updateDialog,
  createDialogCell: db.createDialogCell,
  listDialogCells: db.listDialogCells,
  getDialogCell: db.getDialogCell,
  updateDialogCell: db.updateDialogCell,
  createDialogExecutionRun: db.createDialogExecutionRun,
  listDialogExecutionRuns: db.listDialogExecutionRuns,
  updateDialogExecutionRun: db.updateDialogExecutionRun,
  createDialogPlanNode: db.createDialogPlanNode,
  listDialogPlanNodes: db.listDialogPlanNodes,
  getDialogPlanNode: db.getDialogPlanNode,
  updateDialogPlanNode: db.updateDialogPlanNode,
  createDialogTutorState: db.createDialogTutorState,
  getDialogTutorState: db.getDialogTutorState,
  updateDialogTutorState: db.updateDialogTutorState,
  createDialogImport: db.createDialogImport,
  listDialogImports: db.listDialogImports,
  createDialogSourceMap: db.createDialogSourceMap,
  listDialogSourceMaps: db.listDialogSourceMaps,
  createDialogClarification: db.createDialogClarification,
  listDialogClarifications: db.listDialogClarifications,
  getDialogClarification: db.getDialogClarification,
  updateDialogClarification: db.updateDialogClarification,
  createDialogVisualization: db.createDialogVisualization,
  listDialogVisualizations: db.listDialogVisualizations,
  getDialogVisualization: db.getDialogVisualization,
  updateDialogVisualization: db.updateDialogVisualization,
  getStudyDocument: db.getStudyDocument,
  getActiveDocumentRenderVersion: db.getActiveDocumentRenderVersion,
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

function handleDialogError(res, error) {
  logger.error('[dialogs route] request failed', error);

  if (
    error.message === 'Dialog not found' ||
    error.message === 'Dialog cell not found' ||
    error.message === 'Dialog plan node not found' ||
    error.message === 'Dialog tutor state not found' ||
    error.message === 'Dialog clarification not found' ||
    error.message === 'Dialog visualization not found' ||
    error.message === 'Document not found' ||
    error.message === 'Document render version not found'
  ) {
    return res.status(404).json({ error: error.message });
  }

  return res.status(400).json({ error: error.message || 'Dialog request failed' });
}

router.use(requireJwtAuth);

router.get('/', async (req, res) => {
  try {
    const dialogs = await listDialogs(deps, req.user.id, {
      projectId: req.query.projectId ?? undefined,
    });
    res.status(200).json(dialogs);
  } catch (error) {
    handleDialogError(res, error);
  }
});

router.post('/', async (req, res) => {
  try {
    const workspace = await createDialog(deps, req.user.id, req.body);
    res.status(201).json(workspace);
  } catch (error) {
    handleDialogError(res, error);
  }
});

router.post('/starter', async (req, res) => {
  try {
    const workspace = await createStarterDialog(deps, req.user.id, req.body);
    res.status(201).json(workspace);
  } catch (error) {
    handleDialogError(res, error);
  }
});

router.post('/clarifications/:clarificationId/integrate', async (req, res) => {
  try {
    const clarification = await integrateDialogClarification(deps, req.user.id, {
      clarificationId: req.params.clarificationId,
      ...req.body,
    });
    res.status(200).json(clarification);
  } catch (error) {
    handleDialogError(res, error);
  }
});

router.get('/visualizations/:visualizationId/render', async (req, res) => {
  try {
    const payload = await getDialogVisualizationRenderPayload(
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
    handleDialogError(res, error);
  }
});

router.post('/visualizations/:visualizationId/integrate', async (req, res) => {
  try {
    const visualization = await integrateDialogVisualization(deps, req.user.id, {
      visualizationId: req.params.visualizationId,
      ...req.body,
    });
    res.status(200).json(visualization);
  } catch (error) {
    handleDialogError(res, error);
  }
});

router.delete('/visualizations/:visualizationId', async (req, res) => {
  try {
    const visualization = await deleteDialogVisualization(
      deps,
      req.user.id,
      req.params.visualizationId,
    );
    res.status(200).json(visualization);
  } catch (error) {
    handleDialogError(res, error);
  }
});

router.get('/:dialogId', async (req, res) => {
  try {
    const workspace = await getDialogWorkspace(deps, req.user.id, req.params.dialogId);
    res.status(200).json(workspace);
  } catch (error) {
    handleDialogError(res, error);
  }
});

router.get('/:dialogId/tutor', async (req, res) => {
  try {
    const tutor = await getDialogTutorWorkspace(deps, req.user.id, req.params.dialogId);
    res.status(200).json(tutor);
  } catch (error) {
    handleDialogError(res, error);
  }
});

router.post('/:dialogId/tutor/action', async (req, res) => {
  try {
    const response = await runDialogTutorAction(deps, req.user.id, req.params.dialogId, req.body);
    res.status(200).json(response);
  } catch (error) {
    handleDialogError(res, error);
  }
});

router.patch('/:dialogId', async (req, res) => {
  try {
    const workspace = await updateDialog(deps, req.user.id, req.params.dialogId, req.body);
    res.status(200).json(workspace);
  } catch (error) {
    handleDialogError(res, error);
  }
});

router.post('/:dialogId/cells', async (req, res) => {
  try {
    const workspace = await createDialogCell(deps, req.user.id, req.params.dialogId, req.body);
    res.status(201).json(workspace);
  } catch (error) {
    handleDialogError(res, error);
  }
});

router.patch('/:dialogId/cells/:cellId', async (req, res) => {
  try {
    const workspace = await updateDialogCell(
      deps,
      req.user.id,
      req.params.dialogId,
      req.params.cellId,
      req.body,
    );
    res.status(200).json(workspace);
  } catch (error) {
    handleDialogError(res, error);
  }
});

router.post('/:dialogId/cells/:cellId/execute', async (req, res) => {
  try {
    const workspace = await executeDialogCell(
      deps,
      req.user.id,
      req.params.dialogId,
      req.params.cellId,
    );
    res.status(200).json(workspace);
  } catch (error) {
    handleDialogError(res, error);
  }
});

router.post('/:dialogId/trajectory', async (req, res) => {
  try {
    const workspace = await selectDialogTrajectory(
      deps,
      req.user.id,
      req.params.dialogId,
      req.body,
    );
    res.status(200).json(workspace);
  } catch (error) {
    handleDialogError(res, error);
  }
});

router.post('/:dialogId/cells/:cellId/clarifications', async (req, res) => {
  try {
    const clarification = await createDialogClarification(deps, req.user.id, {
      dialogId: req.params.dialogId,
      cellId: req.params.cellId,
      ...req.body,
    });
    res.status(201).json(clarification);
  } catch (error) {
    handleDialogError(res, error);
  }
});

router.post('/:dialogId/cells/:cellId/visualizations', async (req, res) => {
  try {
    const visualization = await createDialogVisualization(
      deps,
      req.user.id,
      {
        dialogId: req.params.dialogId,
        cellId: req.params.cellId,
        ...req.body,
      },
      {
        appConfig: req.config,
      },
    );
    res.status(201).json(visualization);
  } catch (error) {
    handleDialogError(res, error);
  }
});

module.exports = router;
