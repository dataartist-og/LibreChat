import type { Document } from 'mongoose';

export type VisualizationArtifactType =
  | 'html_app'
  | 'svg'
  | 'image'
  | 'mermaid'
  | 'markdown_explainer_with_embeds'
  | 'json_spec';

export type VisualizationStatus = 'draft' | 'ready' | 'failed' | 'archived';

export type VisualizationStorageMode = 'db_inline' | 'file_store' | 'hybrid';

export type VisualizationIntegrationState = 'nested_only' | 'integrated' | 'detached';

export interface IVisualizationGenerationMetadata {
  error?: string | null;
  rawResponse?: string | null;
  originalMimeType?: string | null;
  sanitizedMimeType?: string | null;
  storageByteSize?: number;
  warnings?: string[];
}

export interface IVisualizationArtifact extends Document {
  visualizationId: string;
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
  status: VisualizationStatus;
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
  integrationState: VisualizationIntegrationState;
  isLatestVersion: boolean;
  versionNumber: number;
  createdByUserId: string;
  integratedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}
