const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  getProject,
  listProjects,
  createProject,
  updateProject,
  archiveProject,
  listProjectSources,
  createProjectSource,
  updateProjectSource,
  deleteProjectSource,
} = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const db = require('~/models');

const router = express.Router();

const deps = {
  ensureProjectAssociations: db.ensureProjectAssociations,
  listProjects: db.listProjects,
  getProject: db.getProject,
  createProject: db.createProject,
  updateProject: db.updateProject,
  archiveProject: db.archiveProject,
  createProjectSource: db.createProjectSource,
  listProjectSources: db.listProjectSources,
  getProjectSource: db.getProjectSource,
  updateProjectSource: db.updateProjectSource,
  deleteProjectSource: db.deleteProjectSource,
  findFileById: db.findFileById,
  updateFile: db.updateFile,
};

function handleProjectError(res, error) {
  logger.error('[projects route] request failed', error);

  if (error.message === 'Project not found' || error.message === 'Project source not found') {
    return res.status(404).json({ error: error.message });
  }

  return res.status(400).json({ error: error.message || 'Project request failed' });
}

router.use(requireJwtAuth);

router.get('/', async (req, res) => {
  try {
    const projects = await listProjects(deps, req.user.id);
    res.status(200).json(projects);
  } catch (error) {
    handleProjectError(res, error);
  }
});

router.post('/', async (req, res) => {
  try {
    const project = await createProject(deps, req.user.id, req.body);
    res.status(201).json(project);
  } catch (error) {
    handleProjectError(res, error);
  }
});

router.get('/:projectId', async (req, res) => {
  try {
    const project = await getProject(deps, req.user.id, req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.status(200).json(project);
  } catch (error) {
    handleProjectError(res, error);
  }
});

router.patch('/:projectId', async (req, res) => {
  try {
    const project = await updateProject(deps, req.user.id, req.params.projectId, req.body);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.status(200).json(project);
  } catch (error) {
    handleProjectError(res, error);
  }
});

router.delete('/:projectId', async (req, res) => {
  try {
    const project = await archiveProject(deps, req.user.id, req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.status(200).json(project);
  } catch (error) {
    handleProjectError(res, error);
  }
});

router.get('/:projectId/sources', async (req, res) => {
  try {
    const sources = await listProjectSources(deps, req.user.id, req.params.projectId);
    res.status(200).json(sources);
  } catch (error) {
    handleProjectError(res, error);
  }
});

router.post('/:projectId/sources', async (req, res) => {
  try {
    const source = await createProjectSource(deps, req.user.id, {
      projectId: req.params.projectId,
      ...req.body,
    });
    res.status(201).json(source);
  } catch (error) {
    handleProjectError(res, error);
  }
});

router.patch('/:projectId/sources/:sourceId', async (req, res) => {
  try {
    const source = await updateProjectSource(
      deps,
      req.user.id,
      req.params.projectId,
      req.params.sourceId,
      req.body,
    );

    if (!source) {
      return res.status(404).json({ error: 'Project source not found' });
    }

    res.status(200).json(source);
  } catch (error) {
    handleProjectError(res, error);
  }
});

router.delete('/:projectId/sources/:sourceId', async (req, res) => {
  try {
    const source = await deleteProjectSource(
      deps,
      req.user.id,
      req.params.projectId,
      req.params.sourceId,
    );

    if (!source) {
      return res.status(404).json({ error: 'Project source not found' });
    }

    res.status(200).json(source);
  } catch (error) {
    handleProjectError(res, error);
  }
});

module.exports = router;
