import crypto from 'node:crypto';
import type { Model } from 'mongoose';
import logger from '~/config/winston';
import type {
  DialogCellType,
  DialogClarificationStatus,
  DialogExecutionRunStatus,
  DialogPlanNodeStatus,
  DialogPlanNodeType,
  DialogSourceType,
  DialogTeachingMode,
  DialogTutorCompletionState,
  DialogTutorLastAction,
  IDialogCell,
  IDialogCellAnchor,
  IDialogCellMetadata,
  IDialogClarification,
  IDialogExecutionRun,
  IDialogImport,
  IDialogPlanNode,
  IDialogPlanSourceAnchor,
  IDialogSourceMap,
  IDialogTutorState,
  IDialogVisualization,
  IStudyDialog,
  VisualizationArtifactType,
  VisualizationIntegrationState,
  VisualizationStatus,
  VisualizationStorageMode,
} from '~/types';

type DialogCreate = {
  projectId?: string | null;
  title: string;
  description?: string | null;
  kernelStateRef?: string | null;
  sourceManifestJson?: IStudyDialog['sourceManifestJson'];
  metadataJson?: Record<string, unknown> | null;
  teachingMode?: DialogTeachingMode;
  selectedTrajectoryKey?: string | null;
};

type DialogUpdate = Partial<
  Pick<
    IStudyDialog,
    | 'projectId'
    | 'title'
    | 'description'
    | 'kernelStateRef'
    | 'sourceManifestJson'
    | 'metadataJson'
    | 'teachingMode'
    | 'selectedTrajectoryKey'
  >
>;

type DialogCellCreate = {
  dialogId: string;
  position: number;
  cellType: DialogCellType;
  title?: string | null;
  sourceMarkdown?: string | null;
  sourceCode?: string | null;
  renderHtml?: string | null;
  metadataJson?: IDialogCellMetadata | null;
};

type DialogCellUpdate = Partial<
  Pick<
    IDialogCell,
    'position' | 'cellType' | 'title' | 'sourceMarkdown' | 'sourceCode' | 'renderHtml'
  > & {
    metadataJson: IDialogCellMetadata | null;
  }
>;

type DialogExecutionRunCreate = {
  dialogId: string;
  cellId: string;
  kernelSessionId: string;
  status: DialogExecutionRunStatus;
  stdout?: string;
  stderr?: string;
  resultJson?: Record<string, unknown> | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

type DialogExecutionRunUpdate = Partial<
  Pick<
    IDialogExecutionRun,
    'kernelSessionId' | 'status' | 'stdout' | 'stderr' | 'startedAt' | 'finishedAt'
  > & {
    resultJson: Record<string, unknown> | null;
  }
>;

type DialogImportCreate = {
  dialogId: string;
  sourceType: DialogSourceType;
  sourceRef: string;
  title: string;
  metadataJson?: Record<string, unknown> | null;
};

type DialogPlanNodeCreate = {
  dialogId: string;
  parentNodeId?: string | null;
  dependencyNodeIds?: string[];
  nodeType: DialogPlanNodeType;
  title: string;
  objective: string;
  sourceAnchors?: IDialogPlanSourceAnchor[];
  status?: DialogPlanNodeStatus;
  depth: number;
  priority: number;
  masteryEvidenceJson?: Record<string, unknown> | null;
  plannerNotes?: string | null;
};

type DialogPlanNodeUpdate = Partial<
  Pick<
    IDialogPlanNode,
    | 'parentNodeId'
    | 'dependencyNodeIds'
    | 'nodeType'
    | 'title'
    | 'objective'
    | 'sourceAnchors'
    | 'status'
    | 'depth'
    | 'priority'
    | 'masteryEvidenceJson'
    | 'plannerNotes'
  >
>;

type DialogTutorStateCreate = {
  dialogId: string;
  selectedTrajectoryKey?: string | null;
  activeNodeId?: string | null;
  rootNodeIds?: string[];
  learnerModelJson?: Record<string, unknown> | null;
  planVersion?: number;
  lastTutorAction?: DialogTutorLastAction;
  completionState?: DialogTutorCompletionState;
};

type DialogTutorStateUpdate = Partial<
  Pick<
    IDialogTutorState,
    | 'selectedTrajectoryKey'
    | 'activeNodeId'
    | 'rootNodeIds'
    | 'learnerModelJson'
    | 'planVersion'
    | 'lastTutorAction'
    | 'completionState'
  >
>;

type DialogSourceMapCreate = {
  dialogId: string;
  paperAnchor: string;
  repoPath: string;
  symbolName?: string | null;
  mappingType: string;
  confidence: number;
  notesMarkdown: string;
};

type DialogClarificationCreate = {
  dialogId: string;
  cellId: string;
  anchor: IDialogCellAnchor;
  clarificationQuestion: string;
  clarificationAnswer: string;
  promptText?: string | null;
  modelProvider?: string | null;
  modelName?: string | null;
  status?: DialogClarificationStatus;
  integratedAt?: Date | null;
};

type DialogClarificationUpdate = Partial<
  Pick<
    IDialogClarification,
    | 'anchor'
    | 'clarificationQuestion'
    | 'clarificationAnswer'
    | 'promptText'
    | 'modelProvider'
    | 'modelName'
    | 'status'
    | 'integratedAt'
  >
>;

type DialogVisualizationCreate = {
  visualizationId?: string | null;
  dialogId: string;
  cellId: string;
  anchor: IDialogCellAnchor;
  parentVisualizationId?: string | null;
  rootVisualizationId?: string | null;
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
  generationMetadata?: IDialogVisualization['generationMetadata'];
  integrationState?: VisualizationIntegrationState;
  isLatestVersion?: boolean;
  versionNumber?: number;
  integratedAt?: Date | null;
  deletedAt?: Date | null;
};

type DialogVisualizationUpdate = Partial<
  Pick<
    IDialogVisualization,
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

export interface DialogMethods {
  createDialog(userId: string, data: DialogCreate): Promise<IStudyDialog>;
  listDialogs(userId: string, params?: { projectId?: string | null }): Promise<IStudyDialog[]>;
  getDialog(userId: string, dialogId: string): Promise<IStudyDialog | null>;
  updateDialog(userId: string, dialogId: string, data: DialogUpdate): Promise<IStudyDialog | null>;
  deleteDialog(userId: string, dialogId: string): Promise<IStudyDialog | null>;
  createDialogCell(userId: string, data: DialogCellCreate): Promise<IDialogCell>;
  listDialogCells(userId: string, dialogId: string): Promise<IDialogCell[]>;
  getDialogCell(userId: string, cellId: string): Promise<IDialogCell | null>;
  updateDialogCell(
    userId: string,
    cellId: string,
    data: DialogCellUpdate,
  ): Promise<IDialogCell | null>;
  deleteDialogCell(userId: string, cellId: string): Promise<IDialogCell | null>;
  createDialogExecutionRun(
    userId: string,
    data: DialogExecutionRunCreate,
  ): Promise<IDialogExecutionRun>;
  listDialogExecutionRuns(
    userId: string,
    params: { dialogId: string; cellId?: string },
  ): Promise<IDialogExecutionRun[]>;
  getDialogExecutionRun(userId: string, runId: string): Promise<IDialogExecutionRun | null>;
  updateDialogExecutionRun(
    userId: string,
    runId: string,
    data: DialogExecutionRunUpdate,
  ): Promise<IDialogExecutionRun | null>;
  createDialogPlanNode(userId: string, data: DialogPlanNodeCreate): Promise<IDialogPlanNode>;
  listDialogPlanNodes(
    userId: string,
    dialogId: string,
    params?: { includeStatuses?: DialogPlanNodeStatus[] },
  ): Promise<IDialogPlanNode[]>;
  getDialogPlanNode(userId: string, nodeId: string): Promise<IDialogPlanNode | null>;
  updateDialogPlanNode(
    userId: string,
    nodeId: string,
    data: DialogPlanNodeUpdate,
  ): Promise<IDialogPlanNode | null>;
  createDialogTutorState(
    userId: string,
    data: DialogTutorStateCreate,
  ): Promise<IDialogTutorState>;
  getDialogTutorState(userId: string, dialogId: string): Promise<IDialogTutorState | null>;
  updateDialogTutorState(
    userId: string,
    dialogId: string,
    data: DialogTutorStateUpdate,
  ): Promise<IDialogTutorState | null>;
  createDialogImport(userId: string, data: DialogImportCreate): Promise<IDialogImport>;
  listDialogImports(userId: string, dialogId: string): Promise<IDialogImport[]>;
  createDialogSourceMap(userId: string, data: DialogSourceMapCreate): Promise<IDialogSourceMap>;
  listDialogSourceMaps(userId: string, dialogId: string): Promise<IDialogSourceMap[]>;
  createDialogClarification(
    userId: string,
    data: DialogClarificationCreate,
  ): Promise<IDialogClarification>;
  listDialogClarifications(
    userId: string,
    params: { dialogId: string; cellId?: string; includeArchived?: boolean },
  ): Promise<IDialogClarification[]>;
  getDialogClarification(
    userId: string,
    clarificationId: string,
  ): Promise<IDialogClarification | null>;
  updateDialogClarification(
    userId: string,
    clarificationId: string,
    data: DialogClarificationUpdate,
  ): Promise<IDialogClarification | null>;
  createDialogVisualization(
    userId: string,
    data: DialogVisualizationCreate,
  ): Promise<IDialogVisualization>;
  listDialogVisualizations(
    userId: string,
    params: {
      dialogId: string;
      cellId?: string;
      includeDeleted?: boolean;
      includeArchived?: boolean;
      includeAllVersions?: boolean;
    },
  ): Promise<IDialogVisualization[]>;
  listDialogVisualizationVersions(
    userId: string,
    rootVisualizationId: string,
  ): Promise<IDialogVisualization[]>;
  getDialogVisualization(
    userId: string,
    visualizationId: string,
    includeDeleted?: boolean,
  ): Promise<IDialogVisualization | null>;
  updateDialogVisualization(
    userId: string,
    visualizationId: string,
    data: DialogVisualizationUpdate,
  ): Promise<IDialogVisualization | null>;
  setDialogVisualizationLatestVersion(
    userId: string,
    rootVisualizationId: string,
    latestVisualizationId: string | null,
  ): Promise<void>;
  getLatestDialogVisualizationVersion(
    userId: string,
    rootVisualizationId: string,
    excludeVisualizationId?: string,
  ): Promise<IDialogVisualization | null>;
}

export function createDialogMethods(mongoose: typeof import('mongoose')): DialogMethods {
  async function createDialog(userId: string, data: DialogCreate) {
    try {
      const StudyDialog = mongoose.models.StudyDialog as Model<IStudyDialog>;
      const dialogId = crypto.randomUUID();
      const dialog = await StudyDialog.create({
        dialogId,
        createdByUserId: userId,
        sourceManifestJson: data.sourceManifestJson ?? [],
        teachingMode: data.teachingMode ?? 'teach_me',
        ...data,
      });

      return dialog.toObject();
    } catch (error) {
      logger.error('[createDialog] Error creating dialog', error);
      throw new Error('Error creating dialog');
    }
  }

  async function listDialogs(userId: string, params?: { projectId?: string | null }) {
    try {
      const StudyDialog = mongoose.models.StudyDialog as Model<IStudyDialog>;
      return await StudyDialog.find({
        createdByUserId: userId,
        ...(params?.projectId !== undefined ? { projectId: params.projectId ?? null } : {}),
      })
        .sort({ updatedAt: -1 })
        .lean();
    } catch (error) {
      logger.error('[listDialogs] Error listing dialogs', error);
      throw new Error('Error listing dialogs');
    }
  }

  async function getDialog(userId: string, dialogId: string) {
    try {
      const StudyDialog = mongoose.models.StudyDialog as Model<IStudyDialog>;
      return await StudyDialog.findOne({ createdByUserId: userId, dialogId }).lean();
    } catch (error) {
      logger.error('[getDialog] Error getting dialog', error);
      throw new Error('Error getting dialog');
    }
  }

  async function updateDialog(userId: string, dialogId: string, data: DialogUpdate) {
    try {
      const StudyDialog = mongoose.models.StudyDialog as Model<IStudyDialog>;
      return await StudyDialog.findOneAndUpdate(
        { createdByUserId: userId, dialogId },
        { $set: data },
        { new: true },
      ).lean();
    } catch (error) {
      logger.error('[updateDialog] Error updating dialog', error);
      throw new Error('Error updating dialog');
    }
  }

  async function deleteDialog(userId: string, dialogId: string) {
    try {
      const StudyDialog = mongoose.models.StudyDialog as Model<IStudyDialog>;
      return await StudyDialog.findOneAndDelete({ createdByUserId: userId, dialogId }).lean();
    } catch (error) {
      logger.error('[deleteDialog] Error deleting dialog', error);
      throw new Error('Error deleting dialog');
    }
  }

  async function createDialogCell(userId: string, data: DialogCellCreate) {
    try {
      const DialogCell = mongoose.models.DialogCell as Model<IDialogCell>;
      const cell = await DialogCell.create({
        cellId: crypto.randomUUID(),
        createdByUserId: userId,
        metadataJson: data.metadataJson ?? null,
        ...data,
      });

      return cell.toObject();
    } catch (error) {
      logger.error('[createDialogCell] Error creating dialog cell', error);
      throw new Error('Error creating dialog cell');
    }
  }

  async function listDialogCells(userId: string, dialogId: string) {
    try {
      const DialogCell = mongoose.models.DialogCell as Model<IDialogCell>;
      return await DialogCell.find({ createdByUserId: userId, dialogId })
        .sort({ position: 1 })
        .lean();
    } catch (error) {
      logger.error('[listDialogCells] Error listing dialog cells', error);
      throw new Error('Error listing dialog cells');
    }
  }

  async function getDialogCell(userId: string, cellId: string) {
    try {
      const DialogCell = mongoose.models.DialogCell as Model<IDialogCell>;
      return await DialogCell.findOne({ createdByUserId: userId, cellId }).lean();
    } catch (error) {
      logger.error('[getDialogCell] Error getting dialog cell', error);
      throw new Error('Error getting dialog cell');
    }
  }

  async function updateDialogCell(userId: string, cellId: string, data: DialogCellUpdate) {
    try {
      const DialogCell = mongoose.models.DialogCell as Model<IDialogCell>;
      return await DialogCell.findOneAndUpdate(
        { createdByUserId: userId, cellId },
        { $set: data },
        { new: true },
      ).lean();
    } catch (error) {
      logger.error('[updateDialogCell] Error updating dialog cell', error);
      throw new Error('Error updating dialog cell');
    }
  }

  async function deleteDialogCell(userId: string, cellId: string) {
    try {
      const DialogCell = mongoose.models.DialogCell as Model<IDialogCell>;
      return await DialogCell.findOneAndDelete({ createdByUserId: userId, cellId }).lean();
    } catch (error) {
      logger.error('[deleteDialogCell] Error deleting dialog cell', error);
      throw new Error('Error deleting dialog cell');
    }
  }

  async function createDialogExecutionRun(userId: string, data: DialogExecutionRunCreate) {
    try {
      const DialogExecutionRun = mongoose.models.DialogExecutionRun as Model<IDialogExecutionRun>;
      const run = await DialogExecutionRun.create({
        runId: crypto.randomUUID(),
        createdByUserId: userId,
        stdout: data.stdout ?? '',
        stderr: data.stderr ?? '',
        resultJson: data.resultJson ?? null,
        startedAt: data.startedAt ?? null,
        finishedAt: data.finishedAt ?? null,
        ...data,
      });

      return run.toObject();
    } catch (error) {
      logger.error('[createDialogExecutionRun] Error creating dialog execution run', error);
      throw new Error('Error creating dialog execution run');
    }
  }

  async function listDialogExecutionRuns(
    userId: string,
    params: { dialogId: string; cellId?: string },
  ) {
    try {
      const DialogExecutionRun = mongoose.models.DialogExecutionRun as Model<IDialogExecutionRun>;
      return await DialogExecutionRun.find({
        createdByUserId: userId,
        dialogId: params.dialogId,
        ...(params.cellId ? { cellId: params.cellId } : {}),
      })
        .sort({ createdAt: -1 })
        .lean();
    } catch (error) {
      logger.error('[listDialogExecutionRuns] Error listing dialog execution runs', error);
      throw new Error('Error listing dialog execution runs');
    }
  }

  async function getDialogExecutionRun(userId: string, runId: string) {
    try {
      const DialogExecutionRun = mongoose.models.DialogExecutionRun as Model<IDialogExecutionRun>;
      return await DialogExecutionRun.findOne({ createdByUserId: userId, runId }).lean();
    } catch (error) {
      logger.error('[getDialogExecutionRun] Error getting dialog execution run', error);
      throw new Error('Error getting dialog execution run');
    }
  }

  async function updateDialogExecutionRun(
    userId: string,
    runId: string,
    data: DialogExecutionRunUpdate,
  ) {
    try {
      const DialogExecutionRun = mongoose.models.DialogExecutionRun as Model<IDialogExecutionRun>;
      return await DialogExecutionRun.findOneAndUpdate(
        { createdByUserId: userId, runId },
        { $set: data },
        { new: true },
      ).lean();
    } catch (error) {
      logger.error('[updateDialogExecutionRun] Error updating dialog execution run', error);
      throw new Error('Error updating dialog execution run');
    }
  }

  async function createDialogPlanNode(userId: string, data: DialogPlanNodeCreate) {
    try {
      const DialogPlanNode = mongoose.models.DialogPlanNode as Model<IDialogPlanNode>;
      const node = await DialogPlanNode.create({
        nodeId: crypto.randomUUID(),
        createdByUserId: userId,
        parentNodeId: data.parentNodeId ?? null,
        dependencyNodeIds: data.dependencyNodeIds ?? [],
        sourceAnchors: data.sourceAnchors ?? [],
        status: data.status ?? 'not_started',
        masteryEvidenceJson: data.masteryEvidenceJson ?? null,
        plannerNotes: data.plannerNotes ?? null,
        ...data,
      });

      return node.toObject();
    } catch (error) {
      logger.error('[createDialogPlanNode] Error creating dialog plan node', error);
      throw new Error('Error creating dialog plan node');
    }
  }

  async function listDialogPlanNodes(
    userId: string,
    dialogId: string,
    params?: { includeStatuses?: DialogPlanNodeStatus[] },
  ) {
    try {
      const DialogPlanNode = mongoose.models.DialogPlanNode as Model<IDialogPlanNode>;
      return await DialogPlanNode.find({
        createdByUserId: userId,
        dialogId,
        ...(params?.includeStatuses?.length
          ? { status: { $in: params.includeStatuses } }
          : {}),
      })
        .sort({ priority: 1, createdAt: 1 })
        .lean();
    } catch (error) {
      logger.error('[listDialogPlanNodes] Error listing dialog plan nodes', error);
      throw new Error('Error listing dialog plan nodes');
    }
  }

  async function getDialogPlanNode(userId: string, nodeId: string) {
    try {
      const DialogPlanNode = mongoose.models.DialogPlanNode as Model<IDialogPlanNode>;
      return await DialogPlanNode.findOne({ createdByUserId: userId, nodeId }).lean();
    } catch (error) {
      logger.error('[getDialogPlanNode] Error getting dialog plan node', error);
      throw new Error('Error getting dialog plan node');
    }
  }

  async function updateDialogPlanNode(userId: string, nodeId: string, data: DialogPlanNodeUpdate) {
    try {
      const DialogPlanNode = mongoose.models.DialogPlanNode as Model<IDialogPlanNode>;
      return await DialogPlanNode.findOneAndUpdate(
        { createdByUserId: userId, nodeId },
        { $set: data },
        { new: true },
      ).lean();
    } catch (error) {
      logger.error('[updateDialogPlanNode] Error updating dialog plan node', error);
      throw new Error('Error updating dialog plan node');
    }
  }

  async function createDialogTutorState(userId: string, data: DialogTutorStateCreate) {
    try {
      const DialogTutorState = mongoose.models.DialogTutorState as Model<IDialogTutorState>;
      const tutorState = await DialogTutorState.create({
        createdByUserId: userId,
        selectedTrajectoryKey: data.selectedTrajectoryKey ?? null,
        activeNodeId: data.activeNodeId ?? null,
        rootNodeIds: data.rootNodeIds ?? [],
        learnerModelJson: data.learnerModelJson ?? null,
        planVersion: data.planVersion ?? 1,
        lastTutorAction: data.lastTutorAction ?? 'initialized',
        completionState: data.completionState ?? 'active',
        ...data,
      });

      return tutorState.toObject();
    } catch (error) {
      logger.error('[createDialogTutorState] Error creating dialog tutor state', error);
      throw new Error('Error creating dialog tutor state');
    }
  }

  async function getDialogTutorState(userId: string, dialogId: string) {
    try {
      const DialogTutorState = mongoose.models.DialogTutorState as Model<IDialogTutorState>;
      return await DialogTutorState.findOne({ createdByUserId: userId, dialogId }).lean();
    } catch (error) {
      logger.error('[getDialogTutorState] Error getting dialog tutor state', error);
      throw new Error('Error getting dialog tutor state');
    }
  }

  async function updateDialogTutorState(
    userId: string,
    dialogId: string,
    data: DialogTutorStateUpdate,
  ) {
    try {
      const DialogTutorState = mongoose.models.DialogTutorState as Model<IDialogTutorState>;
      return await DialogTutorState.findOneAndUpdate(
        { createdByUserId: userId, dialogId },
        { $set: data },
        { new: true },
      ).lean();
    } catch (error) {
      logger.error('[updateDialogTutorState] Error updating dialog tutor state', error);
      throw new Error('Error updating dialog tutor state');
    }
  }

  async function createDialogImport(userId: string, data: DialogImportCreate) {
    try {
      const DialogImport = mongoose.models.DialogImport as Model<IDialogImport>;
      const dialogImport = await DialogImport.create({
        importId: crypto.randomUUID(),
        createdByUserId: userId,
        metadataJson: data.metadataJson ?? null,
        ...data,
      });

      return dialogImport.toObject();
    } catch (error) {
      logger.error('[createDialogImport] Error creating dialog import', error);
      throw new Error('Error creating dialog import');
    }
  }

  async function listDialogImports(userId: string, dialogId: string) {
    try {
      const DialogImport = mongoose.models.DialogImport as Model<IDialogImport>;
      return await DialogImport.find({ createdByUserId: userId, dialogId })
        .sort({ createdAt: 1 })
        .lean();
    } catch (error) {
      logger.error('[listDialogImports] Error listing dialog imports', error);
      throw new Error('Error listing dialog imports');
    }
  }

  async function createDialogSourceMap(userId: string, data: DialogSourceMapCreate) {
    try {
      const DialogSourceMap = mongoose.models.DialogSourceMap as Model<IDialogSourceMap>;
      const sourceMap = await DialogSourceMap.create({
        mapId: crypto.randomUUID(),
        createdByUserId: userId,
        symbolName: data.symbolName ?? null,
        ...data,
      });

      return sourceMap.toObject();
    } catch (error) {
      logger.error('[createDialogSourceMap] Error creating dialog source map', error);
      throw new Error('Error creating dialog source map');
    }
  }

  async function listDialogSourceMaps(userId: string, dialogId: string) {
    try {
      const DialogSourceMap = mongoose.models.DialogSourceMap as Model<IDialogSourceMap>;
      return await DialogSourceMap.find({ createdByUserId: userId, dialogId })
        .sort({ confidence: -1, createdAt: 1 })
        .lean();
    } catch (error) {
      logger.error('[listDialogSourceMaps] Error listing dialog source maps', error);
      throw new Error('Error listing dialog source maps');
    }
  }

  async function createDialogClarification(userId: string, data: DialogClarificationCreate) {
    try {
      const DialogClarification = mongoose.models
        .DialogClarification as Model<IDialogClarification>;
      const clarification = await DialogClarification.create({
        clarificationId: crypto.randomUUID(),
        createdByUserId: userId,
        promptText: data.promptText ?? null,
        modelProvider: data.modelProvider ?? null,
        modelName: data.modelName ?? null,
        status: data.status ?? 'active',
        integratedAt: data.integratedAt ?? null,
        ...data,
      });

      return clarification.toObject();
    } catch (error) {
      logger.error('[createDialogClarification] Error creating dialog clarification', error);
      throw new Error('Error creating dialog clarification');
    }
  }

  async function listDialogClarifications(
    userId: string,
    params: { dialogId: string; cellId?: string; includeArchived?: boolean },
  ) {
    try {
      const DialogClarification = mongoose.models
        .DialogClarification as Model<IDialogClarification>;
      return await DialogClarification.find({
        createdByUserId: userId,
        dialogId: params.dialogId,
        ...(params.cellId ? { cellId: params.cellId } : {}),
        ...(params.includeArchived ? {} : { status: { $ne: 'archived' } }),
      })
        .sort({ createdAt: 1 })
        .lean();
    } catch (error) {
      logger.error('[listDialogClarifications] Error listing dialog clarifications', error);
      throw new Error('Error listing dialog clarifications');
    }
  }

  async function getDialogClarification(userId: string, clarificationId: string) {
    try {
      const DialogClarification = mongoose.models
        .DialogClarification as Model<IDialogClarification>;
      return await DialogClarification.findOne({ createdByUserId: userId, clarificationId }).lean();
    } catch (error) {
      logger.error('[getDialogClarification] Error getting dialog clarification', error);
      throw new Error('Error getting dialog clarification');
    }
  }

  async function updateDialogClarification(
    userId: string,
    clarificationId: string,
    data: DialogClarificationUpdate,
  ) {
    try {
      const DialogClarification = mongoose.models
        .DialogClarification as Model<IDialogClarification>;
      return await DialogClarification.findOneAndUpdate(
        { createdByUserId: userId, clarificationId },
        { $set: data },
        { new: true },
      ).lean();
    } catch (error) {
      logger.error('[updateDialogClarification] Error updating dialog clarification', error);
      throw new Error('Error updating dialog clarification');
    }
  }

  async function createDialogVisualization(userId: string, data: DialogVisualizationCreate) {
    try {
      const DialogVisualization = mongoose.models
        .DialogVisualization as Model<IDialogVisualization>;
      const visualizationId = data.visualizationId ?? crypto.randomUUID();
      const rootVisualizationId = data.rootVisualizationId ?? visualizationId;
      const visualization = await DialogVisualization.create({
        visualizationId,
        rootVisualizationId,
        versionNumber: data.versionNumber ?? 1,
        isLatestVersion: data.isLatestVersion ?? true,
        integrationState: data.integrationState ?? 'nested_only',
        parentVisualizationId: data.parentVisualizationId ?? null,
        canonicalSourceMimeType: data.canonicalSourceMimeType ?? null,
        compiledRenderText: data.compiledRenderText ?? null,
        compiledRenderStoragePath: data.compiledRenderStoragePath ?? null,
        generationModel: data.generationModel ?? null,
        generationMetadata: data.generationMetadata ?? null,
        integratedAt: data.integratedAt ?? null,
        deletedAt: data.deletedAt ?? null,
        createdByUserId: userId,
        ...data,
      });

      return visualization.toObject();
    } catch (error) {
      logger.error('[createDialogVisualization] Error creating dialog visualization', error);
      throw new Error('Error creating dialog visualization');
    }
  }

  async function listDialogVisualizations(
    userId: string,
    params: {
      dialogId: string;
      cellId?: string;
      includeDeleted?: boolean;
      includeArchived?: boolean;
      includeAllVersions?: boolean;
    },
  ) {
    try {
      const DialogVisualization = mongoose.models
        .DialogVisualization as Model<IDialogVisualization>;
      return await DialogVisualization.find({
        createdByUserId: userId,
        dialogId: params.dialogId,
        ...(params.cellId ? { cellId: params.cellId } : {}),
        ...(params.includeDeleted ? {} : { deletedAt: null }),
        ...(params.includeArchived ? {} : { status: { $ne: 'archived' } }),
        ...(params.includeAllVersions ? {} : { isLatestVersion: true }),
      })
        .sort({ createdAt: 1 })
        .lean();
    } catch (error) {
      logger.error('[listDialogVisualizations] Error listing dialog visualizations', error);
      throw new Error('Error listing dialog visualizations');
    }
  }

  async function listDialogVisualizationVersions(userId: string, rootVisualizationId: string) {
    try {
      const DialogVisualization = mongoose.models
        .DialogVisualization as Model<IDialogVisualization>;
      return await DialogVisualization.find({
        createdByUserId: userId,
        rootVisualizationId,
        deletedAt: null,
      })
        .sort({ versionNumber: 1 })
        .lean();
    } catch (error) {
      logger.error(
        '[listDialogVisualizationVersions] Error listing dialog visualization versions',
        error,
      );
      throw new Error('Error listing dialog visualization versions');
    }
  }

  async function getDialogVisualization(
    userId: string,
    visualizationId: string,
    includeDeleted = false,
  ) {
    try {
      const DialogVisualization = mongoose.models
        .DialogVisualization as Model<IDialogVisualization>;
      return await DialogVisualization.findOne({
        createdByUserId: userId,
        visualizationId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      }).lean();
    } catch (error) {
      logger.error('[getDialogVisualization] Error getting dialog visualization', error);
      throw new Error('Error getting dialog visualization');
    }
  }

  async function updateDialogVisualization(
    userId: string,
    visualizationId: string,
    data: DialogVisualizationUpdate,
  ) {
    try {
      const DialogVisualization = mongoose.models
        .DialogVisualization as Model<IDialogVisualization>;
      return await DialogVisualization.findOneAndUpdate(
        { createdByUserId: userId, visualizationId },
        { $set: data },
        { new: true },
      ).lean();
    } catch (error) {
      logger.error('[updateDialogVisualization] Error updating dialog visualization', error);
      throw new Error('Error updating dialog visualization');
    }
  }

  async function setDialogVisualizationLatestVersion(
    userId: string,
    rootVisualizationId: string,
    latestVisualizationId: string | null,
  ) {
    try {
      const DialogVisualization = mongoose.models
        .DialogVisualization as Model<IDialogVisualization>;
      await DialogVisualization.updateMany(
        { createdByUserId: userId, rootVisualizationId },
        { $set: { isLatestVersion: false } },
      );

      if (latestVisualizationId) {
        await DialogVisualization.findOneAndUpdate(
          { createdByUserId: userId, visualizationId: latestVisualizationId },
          { $set: { isLatestVersion: true } },
          { new: true },
        );
      }
    } catch (error) {
      logger.error(
        '[setDialogVisualizationLatestVersion] Error setting dialog visualization latest version',
        error,
      );
      throw new Error('Error setting dialog visualization latest version');
    }
  }

  async function getLatestDialogVisualizationVersion(
    userId: string,
    rootVisualizationId: string,
    excludeVisualizationId?: string,
  ) {
    try {
      const DialogVisualization = mongoose.models
        .DialogVisualization as Model<IDialogVisualization>;
      return await DialogVisualization.findOne({
        createdByUserId: userId,
        rootVisualizationId,
        deletedAt: null,
        ...(excludeVisualizationId ? { visualizationId: { $ne: excludeVisualizationId } } : {}),
      })
        .sort({ versionNumber: -1 })
        .lean();
    } catch (error) {
      logger.error(
        '[getLatestDialogVisualizationVersion] Error getting dialog visualization latest version',
        error,
      );
      throw new Error('Error getting dialog visualization latest version');
    }
  }

  return {
    createDialog,
    listDialogs,
    getDialog,
    updateDialog,
    deleteDialog,
    createDialogCell,
    listDialogCells,
    getDialogCell,
    updateDialogCell,
    deleteDialogCell,
    createDialogExecutionRun,
    listDialogExecutionRuns,
    getDialogExecutionRun,
    updateDialogExecutionRun,
    createDialogPlanNode,
    listDialogPlanNodes,
    getDialogPlanNode,
    updateDialogPlanNode,
    createDialogTutorState,
    getDialogTutorState,
    updateDialogTutorState,
    createDialogImport,
    listDialogImports,
    createDialogSourceMap,
    listDialogSourceMaps,
    createDialogClarification,
    listDialogClarifications,
    getDialogClarification,
    updateDialogClarification,
    createDialogVisualization,
    listDialogVisualizations,
    listDialogVisualizationVersions,
    getDialogVisualization,
    updateDialogVisualization,
    setDialogVisualizationLatestVersion,
    getLatestDialogVisualizationVersion,
  };
}
