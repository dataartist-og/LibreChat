import type { Document } from 'mongoose';
import type {
  IVisualizationGenerationMetadata,
  VisualizationArtifactType,
  VisualizationIntegrationState,
  VisualizationStatus,
  VisualizationStorageMode,
} from './visualization';

export type DialogSourceType = 'paper' | 'repository' | 'document' | 'webpage';

export type DialogCellType = 'note' | 'code' | 'prompt' | 'output' | 'terminal';

export type DialogExecutionRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type DialogTeachingMode = 'teach_me' | 'hint_mode' | 'explain_then_do' | 'just_do_it';

export type DialogPlanNodeType =
  | 'concept'
  | 'implementation'
  | 'bridge'
  | 'verification'
  | 'synthesis';

export type DialogPlanNodeStatus =
  | 'not_started'
  | 'in_progress'
  | 'needs_breakdown'
  | 'mastered'
  | 'blocked'
  | 'skipped';

export type DialogTutorLastAction =
  | 'initialized'
  | 'advance'
  | 'understood'
  | 'break_down'
  | 'stuck'
  | 'skip'
  | 'evaluate';

export type DialogTutorCompletionState = 'active' | 'complete';

export type DialogCellAuthor = 'tutor' | 'user';

export type DialogCellRole =
  | 'instruction'
  | 'exercise'
  | 'checkpoint'
  | 'assistant_query'
  | 'output';

export interface IDialogPlanSourceAnchor {
  sourceType: DialogSourceType;
  sourceRef: string;
  label: string;
  detail?: string | null;
}

export interface IDialogCellMetadata {
  nodeId?: string | null;
  authoredBy?: DialogCellAuthor | null;
  cellRole?: DialogCellRole | null;
  stepIntent?: string | null;
  starterPrompt?: boolean | null;
  sourceCellId?: string | null;
  runId?: string | null;
  checkpointPrompt?: string | null;
  learnerResponse?: string | null;
}

export interface IDialogTrajectory {
  key: string;
  title: string;
  description: string;
  prompt: string;
  focus: string[];
}

export interface IDialogSourceManifestItem {
  importId: string;
  sourceType: DialogSourceType;
  sourceRef: string;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface IStudyDialog extends Document {
  dialogId: string;
  projectId?: string | null;
  title: string;
  description?: string | null;
  createdByUserId: string;
  kernelStateRef?: string | null;
  sourceManifestJson: IDialogSourceManifestItem[];
  metadataJson?: Record<string, unknown> | null;
  teachingMode: DialogTeachingMode;
  selectedTrajectoryKey?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface IDialogCell extends Document {
  cellId: string;
  dialogId: string;
  position: number;
  cellType: DialogCellType;
  title?: string | null;
  sourceMarkdown?: string | null;
  sourceCode?: string | null;
  renderHtml?: string | null;
  metadataJson?: IDialogCellMetadata | null;
  createdByUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface IDialogExecutionRun extends Document {
  runId: string;
  dialogId: string;
  cellId: string;
  kernelSessionId: string;
  status: DialogExecutionRunStatus;
  stdout: string;
  stderr: string;
  resultJson?: Record<string, unknown> | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdByUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface IDialogImport extends Document {
  importId: string;
  dialogId: string;
  sourceType: DialogSourceType;
  sourceRef: string;
  title: string;
  metadataJson?: Record<string, unknown> | null;
  createdByUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface IDialogSourceMap extends Document {
  mapId: string;
  dialogId: string;
  paperAnchor: string;
  repoPath: string;
  symbolName?: string | null;
  mappingType: string;
  confidence: number;
  notesMarkdown: string;
  createdByUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface IDialogPlanNode extends Document {
  nodeId: string;
  dialogId: string;
  parentNodeId?: string | null;
  dependencyNodeIds: string[];
  nodeType: DialogPlanNodeType;
  title: string;
  objective: string;
  sourceAnchors: IDialogPlanSourceAnchor[];
  status: DialogPlanNodeStatus;
  depth: number;
  priority: number;
  masteryEvidenceJson?: Record<string, unknown> | null;
  plannerNotes?: string | null;
  createdByUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface IDialogTutorState extends Document {
  dialogId: string;
  selectedTrajectoryKey?: string | null;
  activeNodeId?: string | null;
  rootNodeIds: string[];
  learnerModelJson?: Record<string, unknown> | null;
  planVersion: number;
  lastTutorAction: DialogTutorLastAction;
  completionState: DialogTutorCompletionState;
  createdByUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface IDialogCellAnchor {
  cellId: string;
  anchorText: string;
  anchorContextBefore: string;
  anchorContextAfter: string;
  startOffset: number;
  endOffset: number;
}

export type DialogClarificationStatus = 'active' | 'integrated' | 'archived';

export interface IDialogClarification extends Document {
  clarificationId: string;
  dialogId: string;
  cellId: string;
  anchor: IDialogCellAnchor;
  clarificationQuestion: string;
  clarificationAnswer: string;
  promptText?: string | null;
  modelProvider?: string | null;
  modelName?: string | null;
  status: DialogClarificationStatus;
  integratedAt?: Date | null;
  createdByUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface IDialogVisualization extends Document {
  visualizationId: string;
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
  generationMetadata?: IVisualizationGenerationMetadata | null;
  integrationState: VisualizationIntegrationState;
  isLatestVersion: boolean;
  versionNumber: number;
  integratedAt?: Date | null;
  deletedAt?: Date | null;
  createdByUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}
