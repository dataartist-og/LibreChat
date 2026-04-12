import type { Document } from 'mongoose';
import type {
  IVisualizationGenerationMetadata,
  VisualizationArtifactType,
  VisualizationIntegrationState,
  VisualizationStatus,
  VisualizationStorageMode,
} from './visualization';

export type DocumentSourceKind = 'pdf' | 'markdown' | 'text' | 'docx' | 'epub' | 'other';

export type DocumentIngestionStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type DocumentIngestionStrategy =
  | 'ocr_markdown'
  | 'document_parser'
  | 'markdown_direct'
  | 'text_direct'
  | 'plain_text';

export type DocumentBlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'blockquote'
  | 'code'
  | 'math_block'
  | 'figure'
  | 'caption'
  | 'page_break';

export interface IDocumentAnchor {
  blockId: string;
  blockType: DocumentBlockType;
  anchorText: string;
  anchorContextBefore: string;
  anchorContextAfter: string;
  startOffset: number;
  endOffset: number;
  headingPath: string[];
  pageStart?: number | null;
  pageEnd?: number | null;
}

export interface IDocumentBlock {
  blockId: string;
  type: DocumentBlockType;
  assetId?: string | null;
  level?: number | null;
  title?: string | null;
  sourcePageStart?: number | null;
  sourcePageEnd?: number | null;
  contentMarkdown: string;
  contentHtml?: string | null;
  plainText: string;
  anchorPath: string;
}

export interface IDocumentOutlineItem {
  id: string;
  blockId: string;
  depth: number;
  title: string;
  anchorPath: string;
}

export interface IDocumentIR {
  documentId: string;
  projectId?: string | null;
  sourceFileId: string;
  sourceType: string;
  title: string;
  blocks: IDocumentBlock[];
  outline: IDocumentOutlineItem[];
  citations?: unknown[];
  assets?: unknown[];
  mathSpans?: unknown[];
  anchorIndex: Record<string, { blockId: string; type: DocumentBlockType }>;
  renderVersion: number;
}

export interface IStudyDocument extends Document {
  documentId: string;
  projectId?: string | null;
  sourceFileId: string;
  title: string;
  sourceMimeType: string;
  sourceKind: DocumentSourceKind;
  ingestionStatus: DocumentIngestionStatus;
  ingestionStrategy: DocumentIngestionStrategy;
  activeRenderVersionId?: string | null;
  activeOverlayId?: string | null;
  createdByUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface IDocumentRenderVersion extends Document {
  renderVersionId: string;
  documentId: string;
  versionNumber: number;
  documentIrJson: IDocumentIR;
  renderHtml?: string | null;
  outlineJson: IDocumentOutlineItem[];
  assetsJson?: unknown[];
  createdByUserId: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface IDocumentOverlayData {
  integratedClarificationIds: string[];
  integratedVisualizationIds: string[];
}

export interface IDocumentOverlay extends Document {
  overlayId: string;
  documentId: string;
  renderVersionId: string;
  overlayVersionNumber: number;
  overlayJson: IDocumentOverlayData;
  createdByUserId: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export type DocumentClarificationStatus = 'active' | 'integrated' | 'archived';

export interface IDocumentClarification extends Document {
  clarificationId: string;
  documentId: string;
  renderVersionId: string;
  overlayId?: string | null;
  anchor: IDocumentAnchor;
  clarificationQuestion: string;
  clarificationAnswer: string;
  promptText?: string | null;
  modelProvider?: string | null;
  modelName?: string | null;
  status: DocumentClarificationStatus;
  integratedAt?: Date | null;
  createdByUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface IDocumentVisualization extends Document {
  visualizationId: string;
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
  generationMetadata?: IVisualizationGenerationMetadata | null;
  integrationState: VisualizationIntegrationState;
  isLatestVersion: boolean;
  versionNumber: number;
  parentVisualizationId?: string | null;
  rootVisualizationId?: string | null;
  integratedAt?: Date | null;
  deletedAt?: Date | null;
  createdByUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}
