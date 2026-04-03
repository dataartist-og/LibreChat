import type { Model } from 'mongoose';
import logger from '~/config/winston';
import type { IProjectSource, ProjectSourceType } from '~/types';

type ProjectSourceCreate = {
  projectId: string;
  sourceType: ProjectSourceType;
  title: string;
  description?: string | null;
  fileId?: string | null;
  url?: string | null;
  noteBody?: string | null;
};

type ProjectSourceUpdate = Omit<ProjectSourceCreate, 'projectId' | 'sourceType'> & {
  sourceType?: ProjectSourceType;
};

type PartialProjectSourceUpdate = Partial<ProjectSourceUpdate>;

export interface ProjectSourceMethods {
  createProjectSource(userId: string, data: ProjectSourceCreate): Promise<IProjectSource>;
  listProjectSources(userId: string, projectId: string): Promise<IProjectSource[]>;
  updateProjectSource(
    userId: string,
    sourceId: string,
    data: PartialProjectSourceUpdate,
  ): Promise<IProjectSource | null>;
  deleteProjectSource(userId: string, sourceId: string): Promise<IProjectSource | null>;
  getProjectSource(userId: string, sourceId: string): Promise<IProjectSource | null>;
}

export function createProjectSourceMethods(
  mongoose: typeof import('mongoose'),
): ProjectSourceMethods {
  async function createProjectSource(userId: string, data: ProjectSourceCreate) {
    try {
      const ProjectSource = mongoose.models.ProjectSource as Model<IProjectSource>;
      const title = data.title.trim();

      if (!title) {
        throw new Error('Project source title is required');
      }

      const source = await ProjectSource.create({
        sourceId: crypto.randomUUID(),
        ownerUserId: userId,
        projectId: data.projectId,
        sourceType: data.sourceType,
        title,
        description: data.description ?? null,
        fileId: data.fileId ?? null,
        url: data.url ?? null,
        noteBody: data.noteBody ?? null,
      });

      return source.toObject();
    } catch (error) {
      logger.error('[createProjectSource] Error creating project source', error);
      throw error;
    }
  }

  async function listProjectSources(userId: string, projectId: string) {
    try {
      const ProjectSource = mongoose.models.ProjectSource as Model<IProjectSource>;
      return await ProjectSource.find({
        ownerUserId: userId,
        projectId,
      })
        .sort({ createdAt: 1 })
        .lean();
    } catch (error) {
      logger.error('[listProjectSources] Error listing project sources', error);
      throw new Error('Error listing project sources');
    }
  }

  async function updateProjectSource(
    userId: string,
    sourceId: string,
    data: PartialProjectSourceUpdate,
  ) {
    try {
      const ProjectSource = mongoose.models.ProjectSource as Model<IProjectSource>;
      const update: PartialProjectSourceUpdate = { ...data };

      if (update.title !== undefined) {
        const title = update.title.trim();
        if (!title) {
          throw new Error('Project source title is required');
        }
        update.title = title;
      }

      return await ProjectSource.findOneAndUpdate(
        {
          ownerUserId: userId,
          sourceId,
        },
        {
          $set: update,
        },
        {
          new: true,
        },
      ).lean();
    } catch (error) {
      logger.error('[updateProjectSource] Error updating project source', error);
      throw error;
    }
  }

  async function deleteProjectSource(userId: string, sourceId: string) {
    try {
      const ProjectSource = mongoose.models.ProjectSource as Model<IProjectSource>;
      return await ProjectSource.findOneAndDelete({
        ownerUserId: userId,
        sourceId,
      }).lean();
    } catch (error) {
      logger.error('[deleteProjectSource] Error deleting project source', error);
      throw new Error('Error deleting project source');
    }
  }

  async function getProjectSource(userId: string, sourceId: string) {
    try {
      const ProjectSource = mongoose.models.ProjectSource as Model<IProjectSource>;
      return await ProjectSource.findOne({
        ownerUserId: userId,
        sourceId,
      }).lean();
    } catch (error) {
      logger.error('[getProjectSource] Error getting project source', error);
      throw new Error('Error getting project source');
    }
  }

  return {
    createProjectSource,
    listProjectSources,
    updateProjectSource,
    deleteProjectSource,
    getProjectSource,
  };
}
