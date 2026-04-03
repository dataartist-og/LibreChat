import type { FilterQuery, Model } from 'mongoose';
import logger from '~/config/winston';
import type { IConversation, IMessage, IProject } from '~/types';

const DEFAULT_PROJECT_NAME = 'General';

type ProjectUpdate = {
  name?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
};

export interface ProjectMethods {
  ensureDefaultProject(userId: string): Promise<IProject>;
  ensureProjectAssociations(userId: string): Promise<IProject>;
  listProjects(userId: string): Promise<IProject[]>;
  getProject(userId: string, projectId: string): Promise<IProject | null>;
  createProject(userId: string, data: ProjectUpdate): Promise<IProject>;
  updateProject(userId: string, projectId: string, data: ProjectUpdate): Promise<IProject | null>;
  archiveProject(userId: string, projectId: string): Promise<IProject | null>;
}

export function createProjectMethods(mongoose: typeof import('mongoose')): ProjectMethods {
  async function ensureDefaultProject(userId: string) {
    const Project = mongoose.models.Project as Model<IProject>;
    const projectId = crypto.randomUUID();

    const project = await Project.findOneAndUpdate(
      {
        ownerUserId: userId,
        archivedAt: null,
        name: DEFAULT_PROJECT_NAME,
      },
      {
        $setOnInsert: {
          projectId,
          ownerUserId: userId,
          name: DEFAULT_PROJECT_NAME,
          description: null,
          icon: null,
          color: '#64748b',
          archivedAt: null,
        },
      },
      {
        new: true,
        upsert: true,
      },
    ).lean();

    if (!project) {
      throw new Error('Failed to ensure default project');
    }

    return project;
  }

  async function ensureProjectAssociations(userId: string) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const Message = mongoose.models.Message as Model<IMessage>;
      const defaultProject = await ensureDefaultProject(userId);

      const filter: FilterQuery<IConversation> = {
        user: userId,
        $or: [{ projectId: null }, { projectId: { $exists: false } }],
      };

      const conversationsNeedingProject = await Conversation.find(filter)
        .select('conversationId')
        .lean();

      if (conversationsNeedingProject.length === 0) {
        return defaultProject;
      }

      const conversationIds = conversationsNeedingProject.map((conversation) => conversation.conversationId);

      await Conversation.updateMany(filter, {
        $set: {
          projectId: defaultProject.projectId,
        },
      });

      await Message.updateMany(
        {
          user: userId,
          conversationId: { $in: conversationIds },
          $or: [{ projectId: null }, { projectId: { $exists: false } }],
        },
        {
          $set: {
            projectId: defaultProject.projectId,
          },
        },
      );

      return defaultProject;
    } catch (error) {
      logger.error('[ensureProjectAssociations] Error ensuring project associations', error);
      throw new Error('Error ensuring project associations');
    }
  }

  async function listProjects(userId: string) {
    try {
      const Project = mongoose.models.Project as Model<IProject>;
      await ensureProjectAssociations(userId);

      return await Project.find({
        ownerUserId: userId,
        archivedAt: null,
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();
    } catch (error) {
      logger.error('[listProjects] Error listing projects', error);
      throw new Error('Error listing projects');
    }
  }

  async function getProject(userId: string, projectId: string) {
    try {
      const Project = mongoose.models.Project as Model<IProject>;
      await ensureProjectAssociations(userId);

      return await Project.findOne({
        ownerUserId: userId,
        projectId,
        archivedAt: null,
      }).lean();
    } catch (error) {
      logger.error('[getProject] Error getting project', error);
      throw new Error('Error getting project');
    }
  }

  async function createProject(userId: string, data: ProjectUpdate) {
    try {
      const Project = mongoose.models.Project as Model<IProject>;
      await ensureProjectAssociations(userId);

      const name = data.name?.trim();
      if (!name) {
        throw new Error('Project name is required');
      }

      const project = await Project.create({
        projectId: crypto.randomUUID(),
        ownerUserId: userId,
        name,
        description: data.description ?? null,
        icon: data.icon ?? null,
        color: data.color ?? null,
        archivedAt: null,
      });

      return project.toObject();
    } catch (error) {
      logger.error('[createProject] Error creating project', error);
      throw error;
    }
  }

  async function updateProject(userId: string, projectId: string, data: ProjectUpdate) {
    try {
      const Project = mongoose.models.Project as Model<IProject>;
      const update: ProjectUpdate = {};

      if (data.name !== undefined) {
        const name = data.name.trim();
        if (!name) {
          throw new Error('Project name is required');
        }
        update.name = name;
      }

      if (data.description !== undefined) {
        update.description = data.description;
      }

      if (data.icon !== undefined) {
        update.icon = data.icon;
      }

      if (data.color !== undefined) {
        update.color = data.color;
      }

      return await Project.findOneAndUpdate(
        {
          ownerUserId: userId,
          projectId,
          archivedAt: null,
        },
        {
          $set: update,
        },
        {
          new: true,
        },
      ).lean();
    } catch (error) {
      logger.error('[updateProject] Error updating project', error);
      throw error;
    }
  }

  async function archiveProject(userId: string, projectId: string) {
    try {
      const Project = mongoose.models.Project as Model<IProject>;
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const Message = mongoose.models.Message as Model<IMessage>;

      await ensureProjectAssociations(userId);

      const project = await Project.findOne({
        ownerUserId: userId,
        projectId,
        archivedAt: null,
      }).lean();

      if (!project) {
        return null;
      }

      if (project.name === DEFAULT_PROJECT_NAME) {
        throw new Error('The default project cannot be archived');
      }

      const defaultProject = await ensureDefaultProject(userId);

      await Conversation.updateMany(
        {
          user: userId,
          projectId,
        },
        {
          $set: {
            projectId: defaultProject.projectId,
          },
        },
      );

      await Message.updateMany(
        {
          user: userId,
          projectId,
        },
        {
          $set: {
            projectId: defaultProject.projectId,
          },
        },
      );

      return await Project.findOneAndUpdate(
        {
          ownerUserId: userId,
          projectId,
          archivedAt: null,
        },
        {
          $set: {
            archivedAt: new Date(),
          },
        },
        {
          new: true,
        },
      ).lean();
    } catch (error) {
      logger.error('[archiveProject] Error archiving project', error);
      throw error;
    }
  }

  return {
    ensureDefaultProject,
    ensureProjectAssociations,
    listProjects,
    getProject,
    createProject,
    updateProject,
    archiveProject,
  };
}
