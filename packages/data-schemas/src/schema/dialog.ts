import { Schema } from 'mongoose';
import type {
  IDialogCell,
  IDialogClarification,
  IDialogExecutionRun,
  IDialogImport,
  IDialogPlanNode,
  IDialogTutorState,
  IDialogSourceMap,
  IDialogVisualization,
  IStudyDialog,
} from '~/types';

const dialogCellAnchorSchema = new Schema(
  {
    cellId: {
      type: String,
      required: true,
    },
    anchorText: {
      type: String,
      required: true,
    },
    anchorContextBefore: {
      type: String,
      default: '',
    },
    anchorContextAfter: {
      type: String,
      default: '',
    },
    startOffset: {
      type: Number,
      required: true,
    },
    endOffset: {
      type: Number,
      required: true,
    },
  },
  {
    _id: false,
  },
);

const dialogPlanSourceAnchorSchema = new Schema(
  {
    sourceType: {
      type: String,
      enum: ['paper', 'repository', 'document', 'webpage'],
      required: true,
    },
    sourceRef: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
    detail: {
      type: String,
      default: null,
    },
  },
  {
    _id: false,
  },
);

export const studyDialogSchema: Schema<IStudyDialog> = new Schema(
  {
    dialogId: {
      type: String,
      required: true,
      index: true,
    },
    projectId: {
      type: String,
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: null,
    },
    createdByUserId: {
      type: String,
      required: true,
      index: true,
    },
    kernelStateRef: {
      type: String,
      default: null,
    },
    sourceManifestJson: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    metadataJson: {
      type: Schema.Types.Mixed,
      default: null,
    },
    teachingMode: {
      type: String,
      enum: ['teach_me', 'hint_mode', 'explain_then_do', 'just_do_it'],
      required: true,
      default: 'teach_me',
    },
    selectedTrajectoryKey: {
      type: String,
      default: null,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

studyDialogSchema.index({ createdByUserId: 1, dialogId: 1, tenantId: 1 }, { unique: true });
studyDialogSchema.index({ createdByUserId: 1, updatedAt: -1 });

export const dialogCellSchema: Schema<IDialogCell> = new Schema(
  {
    cellId: {
      type: String,
      required: true,
      index: true,
    },
    dialogId: {
      type: String,
      required: true,
      index: true,
    },
    position: {
      type: Number,
      required: true,
    },
    cellType: {
      type: String,
      enum: ['note', 'code', 'prompt', 'output', 'terminal'],
      required: true,
    },
    title: {
      type: String,
      default: null,
    },
    sourceMarkdown: {
      type: String,
      default: null,
    },
    sourceCode: {
      type: String,
      default: null,
    },
    renderHtml: {
      type: String,
      default: null,
    },
    metadataJson: {
      type: Schema.Types.Mixed,
      default: null,
    },
    createdByUserId: {
      type: String,
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

dialogCellSchema.index({ createdByUserId: 1, cellId: 1, tenantId: 1 }, { unique: true });
dialogCellSchema.index({ dialogId: 1, position: 1 });

export const dialogExecutionRunSchema: Schema<IDialogExecutionRun> = new Schema(
  {
    runId: {
      type: String,
      required: true,
      index: true,
    },
    dialogId: {
      type: String,
      required: true,
      index: true,
    },
    cellId: {
      type: String,
      required: true,
      index: true,
    },
    kernelSessionId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'succeeded', 'failed'],
      required: true,
      default: 'queued',
    },
    stdout: {
      type: String,
      default: '',
    },
    stderr: {
      type: String,
      default: '',
    },
    resultJson: {
      type: Schema.Types.Mixed,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    finishedAt: {
      type: Date,
      default: null,
    },
    createdByUserId: {
      type: String,
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

dialogExecutionRunSchema.index({ createdByUserId: 1, runId: 1, tenantId: 1 }, { unique: true });
dialogExecutionRunSchema.index({ dialogId: 1, cellId: 1, createdAt: -1 });

export const dialogPlanNodeSchema: Schema<IDialogPlanNode> = new Schema(
  {
    nodeId: {
      type: String,
      required: true,
      index: true,
    },
    dialogId: {
      type: String,
      required: true,
      index: true,
    },
    parentNodeId: {
      type: String,
      default: null,
      index: true,
    },
    dependencyNodeIds: {
      type: [String],
      default: [],
    },
    nodeType: {
      type: String,
      enum: ['concept', 'implementation', 'bridge', 'verification', 'synthesis'],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    objective: {
      type: String,
      required: true,
    },
    sourceAnchors: {
      type: [dialogPlanSourceAnchorSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'needs_breakdown', 'mastered', 'blocked', 'skipped'],
      required: true,
      default: 'not_started',
    },
    depth: {
      type: Number,
      required: true,
      default: 0,
    },
    priority: {
      type: Number,
      required: true,
      default: 0,
    },
    masteryEvidenceJson: {
      type: Schema.Types.Mixed,
      default: null,
    },
    plannerNotes: {
      type: String,
      default: null,
    },
    createdByUserId: {
      type: String,
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

dialogPlanNodeSchema.index({ createdByUserId: 1, nodeId: 1, tenantId: 1 }, { unique: true });
dialogPlanNodeSchema.index({ dialogId: 1, parentNodeId: 1, priority: 1, createdAt: 1 });

export const dialogTutorStateSchema: Schema<IDialogTutorState> = new Schema(
  {
    dialogId: {
      type: String,
      required: true,
      index: true,
    },
    selectedTrajectoryKey: {
      type: String,
      default: null,
    },
    activeNodeId: {
      type: String,
      default: null,
    },
    rootNodeIds: {
      type: [String],
      default: [],
    },
    learnerModelJson: {
      type: Schema.Types.Mixed,
      default: null,
    },
    planVersion: {
      type: Number,
      required: true,
      default: 1,
    },
    lastTutorAction: {
      type: String,
      enum: ['initialized', 'advance', 'understood', 'break_down', 'stuck', 'skip', 'evaluate'],
      required: true,
      default: 'initialized',
    },
    completionState: {
      type: String,
      enum: ['active', 'complete'],
      required: true,
      default: 'active',
    },
    createdByUserId: {
      type: String,
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

dialogTutorStateSchema.index({ createdByUserId: 1, dialogId: 1, tenantId: 1 }, { unique: true });

export const dialogImportSchema: Schema<IDialogImport> = new Schema(
  {
    importId: {
      type: String,
      required: true,
      index: true,
    },
    dialogId: {
      type: String,
      required: true,
      index: true,
    },
    sourceType: {
      type: String,
      enum: ['paper', 'repository', 'document', 'webpage'],
      required: true,
    },
    sourceRef: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    metadataJson: {
      type: Schema.Types.Mixed,
      default: null,
    },
    createdByUserId: {
      type: String,
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

dialogImportSchema.index({ createdByUserId: 1, importId: 1, tenantId: 1 }, { unique: true });
dialogImportSchema.index({ dialogId: 1, createdAt: 1 });

export const dialogSourceMapSchema: Schema<IDialogSourceMap> = new Schema(
  {
    mapId: {
      type: String,
      required: true,
      index: true,
    },
    dialogId: {
      type: String,
      required: true,
      index: true,
    },
    paperAnchor: {
      type: String,
      required: true,
    },
    repoPath: {
      type: String,
      required: true,
    },
    symbolName: {
      type: String,
      default: null,
    },
    mappingType: {
      type: String,
      required: true,
    },
    confidence: {
      type: Number,
      required: true,
    },
    notesMarkdown: {
      type: String,
      default: '',
    },
    createdByUserId: {
      type: String,
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

dialogSourceMapSchema.index({ createdByUserId: 1, mapId: 1, tenantId: 1 }, { unique: true });
dialogSourceMapSchema.index({ dialogId: 1, confidence: -1, createdAt: 1 });

export const dialogClarificationSchema: Schema<IDialogClarification> = new Schema(
  {
    clarificationId: {
      type: String,
      required: true,
      index: true,
    },
    dialogId: {
      type: String,
      required: true,
      index: true,
    },
    cellId: {
      type: String,
      required: true,
      index: true,
    },
    anchor: {
      type: dialogCellAnchorSchema,
      required: true,
    },
    clarificationQuestion: {
      type: String,
      required: true,
    },
    clarificationAnswer: {
      type: String,
      required: true,
      default: '',
    },
    promptText: {
      type: String,
      default: null,
    },
    modelProvider: {
      type: String,
      default: null,
    },
    modelName: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'integrated', 'archived'],
      required: true,
      default: 'active',
    },
    integratedAt: {
      type: Date,
      default: null,
    },
    createdByUserId: {
      type: String,
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

dialogClarificationSchema.index(
  { createdByUserId: 1, clarificationId: 1, tenantId: 1 },
  { unique: true },
);
dialogClarificationSchema.index({ dialogId: 1, cellId: 1, status: 1, createdAt: 1 });

export const dialogVisualizationSchema: Schema<IDialogVisualization> = new Schema(
  {
    visualizationId: {
      type: String,
      required: true,
      index: true,
    },
    dialogId: {
      type: String,
      required: true,
      index: true,
    },
    cellId: {
      type: String,
      required: true,
      index: true,
    },
    anchor: {
      type: dialogCellAnchorSchema,
      required: true,
    },
    parentVisualizationId: {
      type: String,
      default: null,
      index: true,
    },
    rootVisualizationId: {
      type: String,
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    artifactType: {
      type: String,
      enum: ['html_app', 'svg', 'image', 'mermaid', 'markdown_explainer_with_embeds', 'json_spec'],
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'ready', 'failed', 'archived'],
      required: true,
      default: 'draft',
    },
    storageMode: {
      type: String,
      enum: ['db_inline', 'file_store', 'hybrid'],
      required: true,
      default: 'db_inline',
    },
    canonicalSourceText: {
      type: String,
      default: '',
    },
    canonicalSourceMimeType: {
      type: String,
      default: null,
    },
    compiledRenderText: {
      type: String,
      default: null,
    },
    compiledRenderMimeType: {
      type: String,
      required: true,
    },
    compiledRenderStoragePath: {
      type: String,
      default: null,
    },
    sourcePrompt: {
      type: String,
      required: true,
    },
    generationModel: {
      type: String,
      default: null,
    },
    generationMetadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
    integrationState: {
      type: String,
      enum: ['nested_only', 'integrated', 'detached'],
      required: true,
      default: 'nested_only',
    },
    isLatestVersion: {
      type: Boolean,
      required: true,
      default: true,
    },
    versionNumber: {
      type: Number,
      required: true,
      default: 1,
    },
    integratedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    createdByUserId: {
      type: String,
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

dialogVisualizationSchema.index(
  { createdByUserId: 1, visualizationId: 1, tenantId: 1 },
  { unique: true },
);
dialogVisualizationSchema.index({
  dialogId: 1,
  cellId: 1,
  integrationState: 1,
  isLatestVersion: 1,
  deletedAt: 1,
  createdAt: 1,
});
dialogVisualizationSchema.index({
  rootVisualizationId: 1,
  isLatestVersion: 1,
  deletedAt: 1,
  versionNumber: -1,
});
