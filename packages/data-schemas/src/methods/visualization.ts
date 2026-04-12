import type { Model } from 'mongoose';
import logger from '~/config/winston';
import type {
  IVisualizationArtifact,
  IVisualizationGenerationMetadata,
  VisualizationArtifactType,
  VisualizationIntegrationState,
  VisualizationStatus,
  VisualizationStorageMode,
} from '~/types';

type VisualizationCreate = {
  projectId?: string | null;
  conversationId: string;
  parentMessageId: string;
  anchorStart: number;
  anchorEnd: number;
  anchorText: string;
  anchorContextBefore: string;
  anchorContextAfter: string;
  anchorPath?: string | null;
  inlineThreadId?: string | null;
  parentVisualizationId?: string | null;
  rootVisualizationId?: string | null;
  title: string;
  description: string;
  artifactType: VisualizationArtifactType;
  status?: VisualizationStatus;
  storageMode: VisualizationStorageMode;
  canonicalSourceText: string;
  canonicalSourceMimeType?: string | null;
  compiledRenderText?: string | null;
  compiledRenderMimeType: string;
  compiledRenderStoragePath?: string | null;
  thumbnailUrl?: string | null;
  sourcePrompt: string;
  generationModel?: string | null;
  generationMetadata?: IVisualizationGenerationMetadata | null;
  integrationState?: VisualizationIntegrationState;
  isLatestVersion?: boolean;
  versionNumber?: number;
  integratedAt?: Date | null;
  deletedAt?: Date | null;
};

type VisualizationUpdate = Partial<
  Pick<
    IVisualizationArtifact,
    | 'title'
    | 'description'
    | 'status'
    | 'storageMode'
    | 'canonicalSourceText'
    | 'canonicalSourceMimeType'
    | 'compiledRenderText'
    | 'compiledRenderMimeType'
    | 'compiledRenderStoragePath'
    | 'thumbnailUrl'
    | 'sourcePrompt'
    | 'generationModel'
    | 'generationMetadata'
    | 'integrationState'
    | 'isLatestVersion'
    | 'versionNumber'
    | 'integratedAt'
    | 'deletedAt'
    | 'parentVisualizationId'
    | 'rootVisualizationId'
  >
>;

export interface VisualizationMethods {
  createVisualization(
    userId: string,
    data: Omit<VisualizationCreate, 'createdByUserId'>,
  ): Promise<IVisualizationArtifact>;
  listVisualizations(
    userId: string,
    params: {
      conversationId: string;
      parentMessageId?: string;
      includeArchived?: boolean;
      includeDeleted?: boolean;
      includeAllVersions?: boolean;
    },
  ): Promise<IVisualizationArtifact[]>;
  listVisualizationVersions(
    userId: string,
    rootVisualizationId: string,
    includeDeleted?: boolean,
  ): Promise<IVisualizationArtifact[]>;
  getVisualization(
    userId: string,
    visualizationId: string,
    includeDeleted?: boolean,
  ): Promise<IVisualizationArtifact | null>;
  updateVisualization(
    userId: string,
    visualizationId: string,
    data: VisualizationUpdate,
  ): Promise<IVisualizationArtifact | null>;
  setVisualizationLatestVersion(
    userId: string,
    rootVisualizationId: string,
    latestVisualizationId: string | null,
  ): Promise<void>;
  getLatestVisualizationVersion(
    userId: string,
    rootVisualizationId: string,
    excludeVisualizationId?: string,
  ): Promise<IVisualizationArtifact | null>;
}

export function createVisualizationMethods(
  mongoose: typeof import('mongoose'),
): VisualizationMethods {
  function getVisualizationModel(): Model<IVisualizationArtifact> {
    return mongoose.models.VisualizationArtifact as Model<IVisualizationArtifact>;
  }

  async function createVisualization(
    userId: string,
    data: Omit<VisualizationCreate, 'createdByUserId'>,
  ) {
    try {
      const Visualization = getVisualizationModel();
      const visualizationId = crypto.randomUUID();
      const rootVisualizationId = data.rootVisualizationId ?? visualizationId;
      const visualization = await Visualization.create({
        visualizationId,
        createdByUserId: userId,
        rootVisualizationId,
        ...data,
      });

      return visualization.toObject();
    } catch (error) {
      logger.error('[createVisualization] Error creating visualization', error);
      throw error;
    }
  }

  async function listVisualizations(
    userId: string,
    {
      conversationId,
      parentMessageId,
      includeArchived = false,
      includeDeleted = false,
      includeAllVersions = true,
    }: {
      conversationId: string;
      parentMessageId?: string;
      includeArchived?: boolean;
      includeDeleted?: boolean;
      includeAllVersions?: boolean;
    },
  ) {
    try {
      const Visualization = getVisualizationModel();
      const query = {
        createdByUserId: userId,
        conversationId,
        ...(parentMessageId ? { parentMessageId } : {}),
        ...(includeArchived ? {} : { status: { $ne: 'archived' } }),
        ...(includeDeleted ? {} : { deletedAt: null }),
        ...(includeAllVersions ? {} : { isLatestVersion: true }),
      };

      return await Visualization.find(query)
        .sort({ anchorStart: 1, createdAt: 1, versionNumber: 1 })
        .lean();
    } catch (error) {
      logger.error('[listVisualizations] Error listing visualizations', error);
      throw new Error('Error listing visualizations');
    }
  }

  async function listVisualizationVersions(
    userId: string,
    rootVisualizationId: string,
    includeDeleted = false,
  ) {
    try {
      const Visualization = getVisualizationModel();
      return await Visualization.find({
        createdByUserId: userId,
        rootVisualizationId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      })
        .sort({ versionNumber: 1, createdAt: 1 })
        .lean();
    } catch (error) {
      logger.error('[listVisualizationVersions] Error listing visualization versions', error);
      throw new Error('Error listing visualization versions');
    }
  }

  async function getVisualization(userId: string, visualizationId: string, includeDeleted = false) {
    try {
      const Visualization = getVisualizationModel();
      return await Visualization.findOne({
        visualizationId,
        createdByUserId: userId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      }).lean();
    } catch (error) {
      logger.error('[getVisualization] Error getting visualization', error);
      throw new Error('Error getting visualization');
    }
  }

  async function updateVisualization(
    userId: string,
    visualizationId: string,
    data: VisualizationUpdate,
  ) {
    try {
      const Visualization = getVisualizationModel();
      return await Visualization.findOneAndUpdate(
        {
          visualizationId,
          createdByUserId: userId,
        },
        {
          $set: data,
        },
        {
          new: true,
        },
      ).lean();
    } catch (error) {
      logger.error('[updateVisualization] Error updating visualization', error);
      throw error;
    }
  }

  async function setVisualizationLatestVersion(
    userId: string,
    rootVisualizationId: string,
    latestVisualizationId: string | null,
  ) {
    try {
      const Visualization = getVisualizationModel();
      await Visualization.updateMany(
        {
          createdByUserId: userId,
          rootVisualizationId,
        },
        { $set: { isLatestVersion: false } },
      );

      if (!latestVisualizationId) {
        return;
      }

      await Visualization.updateOne(
        {
          createdByUserId: userId,
          rootVisualizationId,
          visualizationId: latestVisualizationId,
        },
        { $set: { isLatestVersion: true } },
      );
    } catch (error) {
      logger.error('[setVisualizationLatestVersion] Error setting latest visualization version', error);
      throw error;
    }
  }

  async function getLatestVisualizationVersion(
    userId: string,
    rootVisualizationId: string,
    excludeVisualizationId?: string,
  ) {
    try {
      const Visualization = getVisualizationModel();
      return await Visualization.findOne({
        createdByUserId: userId,
        rootVisualizationId,
        deletedAt: null,
        ...(excludeVisualizationId ? { visualizationId: { $ne: excludeVisualizationId } } : {}),
      })
        .sort({ versionNumber: -1, createdAt: -1 })
        .lean();
    } catch (error) {
      logger.error('[getLatestVisualizationVersion] Error getting latest visualization version', error);
      throw new Error('Error getting latest visualization version');
    }
  }

  return {
    createVisualization,
    listVisualizations,
    listVisualizationVersions,
    getVisualization,
    updateVisualization,
    setVisualizationLatestVersion,
    getLatestVisualizationVersion,
  };
}
