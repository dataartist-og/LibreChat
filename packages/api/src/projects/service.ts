import type { AllMethods, IProject, IProjectSource } from '@librechat/data-schemas';

type ProjectPayload = {
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
};

type ProjectSourcePayload = {
  projectId: string;
  sourceType: 'file' | 'url' | 'note';
  title: string;
  description?: string | null;
  fileId?: string | null;
  url?: string | null;
  noteBody?: string | null;
};

type ProjectSourceUpdatePayload = {
  sourceType?: 'file' | 'url' | 'note';
  title?: string;
  description?: string | null;
  fileId?: string | null;
  url?: string | null;
  noteBody?: string | null;
};

export interface ProjectServiceDeps {
  ensureProjectAssociations: AllMethods['ensureProjectAssociations'];
  listProjects: AllMethods['listProjects'];
  getProject: AllMethods['getProject'];
  createProject: AllMethods['createProject'];
  updateProject: AllMethods['updateProject'];
  archiveProject: AllMethods['archiveProject'];
  createProjectSource: AllMethods['createProjectSource'];
  listProjectSources: AllMethods['listProjectSources'];
  getProjectSource: AllMethods['getProjectSource'];
  updateProjectSource: AllMethods['updateProjectSource'];
  deleteProjectSource: AllMethods['deleteProjectSource'];
  findFileById: AllMethods['findFileById'];
  updateFile: AllMethods['updateFile'];
}

async function requireProject(
  deps: ProjectServiceDeps,
  userId: string,
  projectId: string,
): Promise<IProject> {
  const project = await deps.getProject(userId, projectId);
  if (!project) {
    throw new Error('Project not found');
  }
  return project;
}

function validateProjectSource(data: ProjectSourcePayload | ProjectSourceUpdatePayload): void {
  if (data.sourceType === 'file' && !data.fileId) {
    throw new Error('A file source requires fileId');
  }

  if (data.sourceType === 'url' && !data.url) {
    throw new Error('A URL source requires url');
  }

  if (data.sourceType === 'note' && !data.noteBody) {
    throw new Error('A note source requires noteBody');
  }
}

async function syncProjectFile(
  deps: ProjectServiceDeps,
  userId: string,
  projectId: string,
  fileId: string,
): Promise<void> {
  const file = await deps.findFileById(fileId, { user: userId });
  if (!file) {
    throw new Error('File not found');
  }

  await deps.updateFile({ file_id: fileId, projectId });
}

export async function listProjects(
  deps: ProjectServiceDeps,
  userId: string,
): Promise<IProject[]> {
  await deps.ensureProjectAssociations(userId);
  return deps.listProjects(userId);
}

export async function getProject(
  deps: ProjectServiceDeps,
  userId: string,
  projectId: string,
): Promise<IProject | null> {
  await deps.ensureProjectAssociations(userId);
  return deps.getProject(userId, projectId);
}

export async function createProject(
  deps: ProjectServiceDeps,
  userId: string,
  data: ProjectPayload,
): Promise<IProject> {
  return deps.createProject(userId, data);
}

export async function updateProject(
  deps: ProjectServiceDeps,
  userId: string,
  projectId: string,
  data: ProjectPayload,
): Promise<IProject | null> {
  await requireProject(deps, userId, projectId);
  return deps.updateProject(userId, projectId, data);
}

export async function archiveProject(
  deps: ProjectServiceDeps,
  userId: string,
  projectId: string,
): Promise<IProject | null> {
  await requireProject(deps, userId, projectId);
  return deps.archiveProject(userId, projectId);
}

export async function listProjectSources(
  deps: ProjectServiceDeps,
  userId: string,
  projectId: string,
): Promise<IProjectSource[]> {
  await requireProject(deps, userId, projectId);
  return deps.listProjectSources(userId, projectId);
}

export async function createProjectSource(
  deps: ProjectServiceDeps,
  userId: string,
  data: ProjectSourcePayload,
): Promise<IProjectSource> {
  await requireProject(deps, userId, data.projectId);
  validateProjectSource(data);

  if (data.fileId) {
    await syncProjectFile(deps, userId, data.projectId, data.fileId);
  }

  return deps.createProjectSource(userId, data);
}

export async function ensureProjectSourceForFile(
  deps: ProjectServiceDeps,
  userId: string,
  params: {
    projectId?: string | null;
    fileId: string;
    title: string;
    description?: string | null;
  },
): Promise<IProjectSource | null> {
  const { projectId, fileId, title, description } = params;
  if (!projectId) {
    return null;
  }

  await requireProject(deps, userId, projectId);
  const existingSources = await deps.listProjectSources(userId, projectId);
  const existingSource = existingSources.find((source) => source.fileId === fileId);

  if (existingSource) {
    return existingSource;
  }

  await syncProjectFile(deps, userId, projectId, fileId);

  return deps.createProjectSource(userId, {
    projectId,
    sourceType: 'file',
    title,
    description,
    fileId,
  });
}

export async function updateProjectSource(
  deps: ProjectServiceDeps,
  userId: string,
  projectId: string,
  sourceId: string,
  data: ProjectSourceUpdatePayload,
): Promise<IProjectSource | null> {
  await requireProject(deps, userId, projectId);
  const source = await deps.getProjectSource(userId, sourceId);

  if (!source || source.projectId !== projectId) {
    throw new Error('Project source not found');
  }

  validateProjectSource({
    projectId,
    sourceType: data.sourceType ?? source.sourceType,
    title: data.title ?? source.title,
    description: data.description ?? source.description,
    fileId: data.fileId ?? source.fileId,
    url: data.url ?? source.url,
    noteBody: data.noteBody ?? source.noteBody,
  });

  if (data.fileId) {
    await syncProjectFile(deps, userId, projectId, data.fileId);
  }

  return deps.updateProjectSource(userId, sourceId, data);
}

export async function deleteProjectSource(
  deps: ProjectServiceDeps,
  userId: string,
  projectId: string,
  sourceId: string,
): Promise<IProjectSource | null> {
  await requireProject(deps, userId, projectId);
  const source = await deps.getProjectSource(userId, sourceId);

  if (!source || source.projectId !== projectId) {
    throw new Error('Project source not found');
  }

  return deps.deleteProjectSource(userId, sourceId);
}
