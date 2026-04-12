import crypto from 'node:crypto';
import type { Model } from 'mongoose';
import logger from '~/config/winston';
import type {
  DocumentClarificationStatus,
  IDocumentAnchor,
  IDocumentClarification,
  IDocumentIR,
  IDocumentOverlay,
  IDocumentOverlayData,
  IDocumentRenderVersion,
  IDocumentVisualization,
  IStudyDocument,
  VisualizationArtifactType,
  VisualizationIntegrationState,
  VisualizationStatus,
  VisualizationStorageMode,
} from '~/types';

type StudyDocumentCreate = {
  projectId?: string | null;
  sourceFileId: string;
  title: string;
  sourceMimeType: string;
  sourceKind: IStudyDocument['sourceKind'];
  ingestionStatus: IStudyDocument['ingestionStatus'];
  ingestionStrategy: IStudyDocument['ingestionStrategy'];
  activeRenderVersionId?: string | null;
  activeOverlayId?: string | null;
};

type StudyDocumentUpdate = Partial<
  Pick<
    IStudyDocument,
    | 'projectId'
    | 'title'
    | 'sourceMimeType'
    | 'sourceKind'
    | 'ingestionStatus'
    | 'ingestionStrategy'
    | 'activeRenderVersionId'
    | 'activeOverlayId'
  >
>;

type DocumentRenderVersionCreate = {
  documentId: string;
  versionNumber: number;
  documentIrJson: IDocumentIR;
  renderHtml?: string | null;
  outlineJson: IDocumentRenderVersion['outlineJson'];
  assetsJson?: IDocumentRenderVersion['assetsJson'];
  isActive?: boolean;
};

type DocumentRenderVersionUpdate = Partial<
  Pick<
    IDocumentRenderVersion,
    'documentIrJson' | 'renderHtml' | 'outlineJson' | 'assetsJson' | 'isActive'
  >
>;

type DocumentOverlayCreate = {
  documentId: string;
  renderVersionId: string;
  overlayVersionNumber: number;
  overlayJson: IDocumentOverlayData;
  isActive?: boolean;
};

type DocumentClarificationCreate = {
  documentId: string;
  renderVersionId: string;
  overlayId?: string | null;
  anchor: IDocumentAnchor;
  clarificationQuestion: string;
  clarificationAnswer: string;
  promptText?: string | null;
  modelProvider?: string | null;
  modelName?: string | null;
  status?: DocumentClarificationStatus;
  integratedAt?: Date | null;
};

type DocumentClarificationUpdate = Partial<
  Pick<
    IDocumentClarification,
    | 'anchor'
    | 'clarificationQuestion'
    | 'clarificationAnswer'
    | 'promptText'
    | 'modelProvider'
    | 'modelName'
    | 'overlayId'
    | 'status'
    | 'integratedAt'
  >
>;

type DocumentVisualizationCreate = {
  visualizationId?: string | null;
  documentId: string;
  renderVersionId: string;
  overlayId?: string | null;
  anchor: IDocumentAnchor;
  title: string;
  description: string;
  artifactType: VisualizationArtifactType;
  status: VisualizationStatus;
  storageMode: VisualizationStorageMode;
  canonicalSourceText: string;
  canonicalSourceMimeType?: string | null;
  compiledRenderText?: string | null;
  compiledRenderMimeType: string;
  compiledRenderStoragePath?: string | null;
  sourcePrompt: string;
  generationModel?: string | null;
  generationMetadata?: IDocumentVisualization['generationMetadata'];
  integrationState?: VisualizationIntegrationState;
  isLatestVersion?: boolean;
  versionNumber?: number;
  parentVisualizationId?: string | null;
  rootVisualizationId?: string | null;
  integratedAt?: Date | null;
  deletedAt?: Date | null;
};

type DocumentVisualizationUpdate = Partial<
  Pick<
    IDocumentVisualization,
    | 'overlayId'
    | 'title'
    | 'description'
    | 'artifactType'
    | 'status'
    | 'storageMode'
    | 'canonicalSourceText'
    | 'canonicalSourceMimeType'
    | 'compiledRenderText'
    | 'compiledRenderMimeType'
    | 'compiledRenderStoragePath'
    | 'sourcePrompt'
    | 'generationModel'
    | 'generationMetadata'
    | 'integrationState'
    | 'isLatestVersion'
    | 'versionNumber'
    | 'parentVisualizationId'
    | 'rootVisualizationId'
    | 'integratedAt'
    | 'deletedAt'
  >
>;

export interface DocumentMethods {
  createStudyDocument(userId: string, data: StudyDocumentCreate): Promise<IStudyDocument>;
  listStudyDocuments(
    userId: string,
    params?: { projectId?: string | null },
  ): Promise<IStudyDocument[]>;
  getStudyDocument(userId: string, documentId: string): Promise<IStudyDocument | null>;
  getStudyDocumentBySourceFile(
    userId: string,
    sourceFileId: string,
  ): Promise<IStudyDocument | null>;
  updateStudyDocument(
    userId: string,
    documentId: string,
    data: StudyDocumentUpdate,
  ): Promise<IStudyDocument | null>;
  createDocumentRenderVersion(
    userId: string,
    data: DocumentRenderVersionCreate,
  ): Promise<IDocumentRenderVersion>;
  listDocumentRenderVersions(userId: string, documentId: string): Promise<IDocumentRenderVersion[]>;
  getDocumentRenderVersion(
    userId: string,
    renderVersionId: string,
  ): Promise<IDocumentRenderVersion | null>;
  getActiveDocumentRenderVersion(
    userId: string,
    documentId: string,
  ): Promise<IDocumentRenderVersion | null>;
  updateDocumentRenderVersion(
    userId: string,
    renderVersionId: string,
    data: DocumentRenderVersionUpdate,
  ): Promise<IDocumentRenderVersion | null>;
  setActiveDocumentRenderVersion(
    userId: string,
    documentId: string,
    renderVersionId: string,
  ): Promise<void>;
  createDocumentOverlay(userId: string, data: DocumentOverlayCreate): Promise<IDocumentOverlay>;
  listDocumentOverlays(userId: string, documentId: string): Promise<IDocumentOverlay[]>;
  getActiveDocumentOverlay(userId: string, documentId: string): Promise<IDocumentOverlay | null>;
  setActiveDocumentOverlay(userId: string, documentId: string, overlayId: string): Promise<void>;
  createDocumentClarification(
    userId: string,
    data: DocumentClarificationCreate,
  ): Promise<IDocumentClarification>;
  listDocumentClarifications(
    userId: string,
    params: {
      documentId: string;
      renderVersionId?: string;
      includeArchived?: boolean;
    },
  ): Promise<IDocumentClarification[]>;
  getDocumentClarification(
    userId: string,
    clarificationId: string,
  ): Promise<IDocumentClarification | null>;
  updateDocumentClarification(
    userId: string,
    clarificationId: string,
    data: DocumentClarificationUpdate,
  ): Promise<IDocumentClarification | null>;
  createDocumentVisualization(
    userId: string,
    data: DocumentVisualizationCreate,
  ): Promise<IDocumentVisualization>;
  listDocumentVisualizations(
    userId: string,
    params: {
      documentId: string;
      renderVersionId?: string;
      includeDeleted?: boolean;
      includeArchived?: boolean;
      includeAllVersions?: boolean;
    },
  ): Promise<IDocumentVisualization[]>;
  listDocumentVisualizationVersions(
    userId: string,
    rootVisualizationId: string,
  ): Promise<IDocumentVisualization[]>;
  getDocumentVisualization(
    userId: string,
    visualizationId: string,
    includeDeleted?: boolean,
  ): Promise<IDocumentVisualization | null>;
  updateDocumentVisualization(
    userId: string,
    visualizationId: string,
    data: DocumentVisualizationUpdate,
  ): Promise<IDocumentVisualization | null>;
  setDocumentVisualizationLatestVersion(
    userId: string,
    rootVisualizationId: string,
    latestVisualizationId: string | null,
  ): Promise<void>;
  getLatestDocumentVisualizationVersion(
    userId: string,
    rootVisualizationId: string,
    excludeVisualizationId?: string,
  ): Promise<IDocumentVisualization | null>;
}

export function createDocumentMethods(mongoose: typeof import('mongoose')): DocumentMethods {
  async function createStudyDocument(userId: string, data: StudyDocumentCreate) {
    try {
      const StudyDocument = mongoose.models.StudyDocument as Model<IStudyDocument>;
      const document = await StudyDocument.create({
        documentId: crypto.randomUUID(),
        ...data,
        createdByUserId: userId,
      });

      return document.toObject();
    } catch (error) {
      logger.error('[createStudyDocument] Error creating study document', error);
      throw error;
    }
  }

  async function listStudyDocuments(userId: string, params?: { projectId?: string | null }) {
    try {
      const StudyDocument = mongoose.models.StudyDocument as Model<IStudyDocument>;
      return await StudyDocument.find({
        createdByUserId: userId,
        ...(params?.projectId ? { projectId: params.projectId } : {}),
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();
    } catch (error) {
      logger.error('[listStudyDocuments] Error listing study documents', error);
      throw new Error('Error listing study documents');
    }
  }

  async function getStudyDocument(userId: string, documentId: string) {
    try {
      const StudyDocument = mongoose.models.StudyDocument as Model<IStudyDocument>;
      return await StudyDocument.findOne({
        documentId,
        createdByUserId: userId,
      }).lean();
    } catch (error) {
      logger.error('[getStudyDocument] Error getting study document', error);
      throw new Error('Error getting study document');
    }
  }

  async function getStudyDocumentBySourceFile(userId: string, sourceFileId: string) {
    try {
      const StudyDocument = mongoose.models.StudyDocument as Model<IStudyDocument>;
      return await StudyDocument.findOne({
        sourceFileId,
        createdByUserId: userId,
      }).lean();
    } catch (error) {
      logger.error('[getStudyDocumentBySourceFile] Error getting study document', error);
      throw new Error('Error getting study document');
    }
  }

  async function updateStudyDocument(
    userId: string,
    documentId: string,
    data: StudyDocumentUpdate,
  ) {
    try {
      const StudyDocument = mongoose.models.StudyDocument as Model<IStudyDocument>;
      return await StudyDocument.findOneAndUpdate(
        {
          documentId,
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
      logger.error('[updateStudyDocument] Error updating study document', error);
      throw error;
    }
  }

  async function createDocumentRenderVersion(userId: string, data: DocumentRenderVersionCreate) {
    try {
      const DocumentRenderVersion = mongoose.models
        .DocumentRenderVersion as Model<IDocumentRenderVersion>;
      const renderVersion = await DocumentRenderVersion.create({
        renderVersionId: crypto.randomUUID(),
        ...data,
        createdByUserId: userId,
      });

      return renderVersion.toObject();
    } catch (error) {
      logger.error('[createDocumentRenderVersion] Error creating document render version', error);
      throw error;
    }
  }

  async function listDocumentRenderVersions(userId: string, documentId: string) {
    try {
      const DocumentRenderVersion = mongoose.models
        .DocumentRenderVersion as Model<IDocumentRenderVersion>;
      return await DocumentRenderVersion.find({
        documentId,
        createdByUserId: userId,
      })
        .sort({ versionNumber: -1, createdAt: -1 })
        .lean();
    } catch (error) {
      logger.error('[listDocumentRenderVersions] Error listing document render versions', error);
      throw new Error('Error listing document render versions');
    }
  }

  async function getDocumentRenderVersion(userId: string, renderVersionId: string) {
    try {
      const DocumentRenderVersion = mongoose.models
        .DocumentRenderVersion as Model<IDocumentRenderVersion>;
      return await DocumentRenderVersion.findOne({
        renderVersionId,
        createdByUserId: userId,
      }).lean();
    } catch (error) {
      logger.error('[getDocumentRenderVersion] Error getting document render version', error);
      throw new Error('Error getting document render version');
    }
  }

  async function getActiveDocumentRenderVersion(userId: string, documentId: string) {
    try {
      const DocumentRenderVersion = mongoose.models
        .DocumentRenderVersion as Model<IDocumentRenderVersion>;
      return await DocumentRenderVersion.findOne({
        documentId,
        createdByUserId: userId,
        isActive: true,
      })
        .sort({ versionNumber: -1 })
        .lean();
    } catch (error) {
      logger.error('[getActiveDocumentRenderVersion] Error getting active render version', error);
      throw new Error('Error getting active document render version');
    }
  }

  async function updateDocumentRenderVersion(
    userId: string,
    renderVersionId: string,
    data: DocumentRenderVersionUpdate,
  ) {
    try {
      const DocumentRenderVersion = mongoose.models
        .DocumentRenderVersion as Model<IDocumentRenderVersion>;
      return await DocumentRenderVersion.findOneAndUpdate(
        {
          renderVersionId,
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
      logger.error('[updateDocumentRenderVersion] Error updating document render version', error);
      throw error;
    }
  }

  async function setActiveDocumentRenderVersion(
    userId: string,
    documentId: string,
    renderVersionId: string,
  ) {
    try {
      const DocumentRenderVersion = mongoose.models
        .DocumentRenderVersion as Model<IDocumentRenderVersion>;
      await DocumentRenderVersion.updateMany(
        {
          documentId,
          createdByUserId: userId,
        },
        {
          $set: { isActive: false },
        },
      );

      await DocumentRenderVersion.findOneAndUpdate(
        {
          renderVersionId,
          documentId,
          createdByUserId: userId,
        },
        {
          $set: { isActive: true },
        },
      );
    } catch (error) {
      logger.error('[setActiveDocumentRenderVersion] Error setting active render version', error);
      throw new Error('Error setting active document render version');
    }
  }

  async function createDocumentOverlay(userId: string, data: DocumentOverlayCreate) {
    try {
      const DocumentOverlay = mongoose.models.DocumentOverlay as Model<IDocumentOverlay>;
      const overlay = await DocumentOverlay.create({
        overlayId: crypto.randomUUID(),
        ...data,
        createdByUserId: userId,
      });

      return overlay.toObject();
    } catch (error) {
      logger.error('[createDocumentOverlay] Error creating document overlay', error);
      throw error;
    }
  }

  async function listDocumentOverlays(userId: string, documentId: string) {
    try {
      const DocumentOverlay = mongoose.models.DocumentOverlay as Model<IDocumentOverlay>;
      return await DocumentOverlay.find({
        documentId,
        createdByUserId: userId,
      })
        .sort({ overlayVersionNumber: -1, createdAt: -1 })
        .lean();
    } catch (error) {
      logger.error('[listDocumentOverlays] Error listing document overlays', error);
      throw new Error('Error listing document overlays');
    }
  }

  async function getActiveDocumentOverlay(userId: string, documentId: string) {
    try {
      const DocumentOverlay = mongoose.models.DocumentOverlay as Model<IDocumentOverlay>;
      return await DocumentOverlay.findOne({
        documentId,
        createdByUserId: userId,
        isActive: true,
      })
        .sort({ overlayVersionNumber: -1 })
        .lean();
    } catch (error) {
      logger.error('[getActiveDocumentOverlay] Error getting active document overlay', error);
      throw new Error('Error getting active document overlay');
    }
  }

  async function setActiveDocumentOverlay(userId: string, documentId: string, overlayId: string) {
    try {
      const DocumentOverlay = mongoose.models.DocumentOverlay as Model<IDocumentOverlay>;
      await DocumentOverlay.updateMany(
        {
          documentId,
          createdByUserId: userId,
        },
        {
          $set: { isActive: false },
        },
      );

      await DocumentOverlay.findOneAndUpdate(
        {
          overlayId,
          documentId,
          createdByUserId: userId,
        },
        {
          $set: { isActive: true },
        },
      );
    } catch (error) {
      logger.error('[setActiveDocumentOverlay] Error setting active document overlay', error);
      throw new Error('Error setting active document overlay');
    }
  }

  async function createDocumentClarification(userId: string, data: DocumentClarificationCreate) {
    try {
      const DocumentClarification = mongoose.models
        .DocumentClarification as Model<IDocumentClarification>;
      const clarification = await DocumentClarification.create({
        clarificationId: crypto.randomUUID(),
        ...data,
        createdByUserId: userId,
      });

      return clarification.toObject();
    } catch (error) {
      logger.error('[createDocumentClarification] Error creating document clarification', error);
      throw error;
    }
  }

  async function listDocumentClarifications(
    userId: string,
    params: {
      documentId: string;
      renderVersionId?: string;
      includeArchived?: boolean;
    },
  ) {
    try {
      const DocumentClarification = mongoose.models
        .DocumentClarification as Model<IDocumentClarification>;
      return await DocumentClarification.find({
        createdByUserId: userId,
        documentId: params.documentId,
        ...(params.renderVersionId ? { renderVersionId: params.renderVersionId } : {}),
        ...(params.includeArchived ? {} : { status: { $ne: 'archived' } }),
      })
        .sort({ createdAt: 1 })
        .lean();
    } catch (error) {
      logger.error('[listDocumentClarifications] Error listing document clarifications', error);
      throw new Error('Error listing document clarifications');
    }
  }

  async function getDocumentClarification(userId: string, clarificationId: string) {
    try {
      const DocumentClarification = mongoose.models
        .DocumentClarification as Model<IDocumentClarification>;
      return await DocumentClarification.findOne({
        clarificationId,
        createdByUserId: userId,
      }).lean();
    } catch (error) {
      logger.error('[getDocumentClarification] Error getting document clarification', error);
      throw new Error('Error getting document clarification');
    }
  }

  async function updateDocumentClarification(
    userId: string,
    clarificationId: string,
    data: DocumentClarificationUpdate,
  ) {
    try {
      const DocumentClarification = mongoose.models
        .DocumentClarification as Model<IDocumentClarification>;
      return await DocumentClarification.findOneAndUpdate(
        {
          clarificationId,
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
      logger.error('[updateDocumentClarification] Error updating document clarification', error);
      throw error;
    }
  }

  async function createDocumentVisualization(userId: string, data: DocumentVisualizationCreate) {
    try {
      const DocumentVisualization = mongoose.models
        .DocumentVisualization as Model<IDocumentVisualization>;
      const visualizationId = data.visualizationId ?? crypto.randomUUID();
      const rootVisualizationId = data.rootVisualizationId ?? visualizationId;
      const visualization = await DocumentVisualization.create({
        visualizationId,
        ...data,
        rootVisualizationId,
        createdByUserId: userId,
      });

      return visualization.toObject();
    } catch (error) {
      logger.error('[createDocumentVisualization] Error creating document visualization', error);
      throw error;
    }
  }

  async function listDocumentVisualizations(
    userId: string,
    params: {
      documentId: string;
      renderVersionId?: string;
      includeDeleted?: boolean;
      includeArchived?: boolean;
      includeAllVersions?: boolean;
    },
  ) {
    try {
      const DocumentVisualization = mongoose.models
        .DocumentVisualization as Model<IDocumentVisualization>;
      return await DocumentVisualization.find({
        createdByUserId: userId,
        documentId: params.documentId,
        ...(params.renderVersionId ? { renderVersionId: params.renderVersionId } : {}),
        ...(params.includeDeleted ? {} : { deletedAt: null }),
        ...(params.includeArchived ? {} : { status: { $ne: 'archived' } }),
        ...(params.includeAllVersions ? {} : { isLatestVersion: true }),
      })
        .sort({ createdAt: 1, versionNumber: 1 })
        .lean();
    } catch (error) {
      logger.error('[listDocumentVisualizations] Error listing document visualizations', error);
      throw new Error('Error listing document visualizations');
    }
  }

  async function listDocumentVisualizationVersions(userId: string, rootVisualizationId: string) {
    try {
      const DocumentVisualization = mongoose.models
        .DocumentVisualization as Model<IDocumentVisualization>;
      return await DocumentVisualization.find({
        createdByUserId: userId,
        rootVisualizationId,
        deletedAt: null,
      })
        .sort({ versionNumber: -1, createdAt: -1 })
        .lean();
    } catch (error) {
      logger.error(
        '[listDocumentVisualizationVersions] Error listing document visualization versions',
        error,
      );
      throw new Error('Error listing document visualization versions');
    }
  }

  async function getDocumentVisualization(
    userId: string,
    visualizationId: string,
    includeDeleted = false,
  ) {
    try {
      const DocumentVisualization = mongoose.models
        .DocumentVisualization as Model<IDocumentVisualization>;
      return await DocumentVisualization.findOne({
        visualizationId,
        createdByUserId: userId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      }).lean();
    } catch (error) {
      logger.error('[getDocumentVisualization] Error getting document visualization', error);
      throw new Error('Error getting document visualization');
    }
  }

  async function updateDocumentVisualization(
    userId: string,
    visualizationId: string,
    data: DocumentVisualizationUpdate,
  ) {
    try {
      const DocumentVisualization = mongoose.models
        .DocumentVisualization as Model<IDocumentVisualization>;
      return await DocumentVisualization.findOneAndUpdate(
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
      logger.error('[updateDocumentVisualization] Error updating document visualization', error);
      throw error;
    }
  }

  async function setDocumentVisualizationLatestVersion(
    userId: string,
    rootVisualizationId: string,
    latestVisualizationId: string | null,
  ) {
    try {
      const DocumentVisualization = mongoose.models
        .DocumentVisualization as Model<IDocumentVisualization>;
      await DocumentVisualization.updateMany(
        {
          rootVisualizationId,
          createdByUserId: userId,
        },
        {
          $set: { isLatestVersion: false },
        },
      );

      if (!latestVisualizationId) {
        return;
      }

      await DocumentVisualization.findOneAndUpdate(
        {
          visualizationId: latestVisualizationId,
          createdByUserId: userId,
        },
        {
          $set: { isLatestVersion: true },
        },
      );
    } catch (error) {
      logger.error(
        '[setDocumentVisualizationLatestVersion] Error setting latest document visualization version',
        error,
      );
      throw new Error('Error setting latest document visualization version');
    }
  }

  async function getLatestDocumentVisualizationVersion(
    userId: string,
    rootVisualizationId: string,
    excludeVisualizationId?: string,
  ) {
    try {
      const DocumentVisualization = mongoose.models
        .DocumentVisualization as Model<IDocumentVisualization>;
      return await DocumentVisualization.findOne({
        createdByUserId: userId,
        rootVisualizationId,
        deletedAt: null,
        ...(excludeVisualizationId ? { visualizationId: { $ne: excludeVisualizationId } } : {}),
      })
        .sort({ versionNumber: -1, createdAt: -1 })
        .lean();
    } catch (error) {
      logger.error(
        '[getLatestDocumentVisualizationVersion] Error getting latest document visualization version',
        error,
      );
      throw new Error('Error getting latest document visualization version');
    }
  }

  return {
    createStudyDocument,
    listStudyDocuments,
    getStudyDocument,
    getStudyDocumentBySourceFile,
    updateStudyDocument,
    createDocumentRenderVersion,
    listDocumentRenderVersions,
    getDocumentRenderVersion,
    getActiveDocumentRenderVersion,
    updateDocumentRenderVersion,
    setActiveDocumentRenderVersion,
    createDocumentOverlay,
    listDocumentOverlays,
    getActiveDocumentOverlay,
    setActiveDocumentOverlay,
    createDocumentClarification,
    listDocumentClarifications,
    getDocumentClarification,
    updateDocumentClarification,
    createDocumentVisualization,
    listDocumentVisualizations,
    listDocumentVisualizationVersions,
    getDocumentVisualization,
    updateDocumentVisualization,
    setDocumentVisualizationLatestVersion,
    getLatestDocumentVisualizationVersion,
  };
}
