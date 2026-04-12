import { Schema } from 'mongoose';
import type { IVisualizationArtifact } from '~/types';

const visualizationSchema: Schema<IVisualizationArtifact> = new Schema(
  {
    visualizationId: {
      type: String,
      required: true,
      index: true,
    },
    projectId: {
      type: String,
      default: null,
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    parentMessageId: {
      type: String,
      required: true,
      index: true,
    },
    anchorStart: {
      type: Number,
      required: true,
    },
    anchorEnd: {
      type: Number,
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
    anchorPath: {
      type: String,
      default: null,
    },
    inlineThreadId: {
      type: String,
      default: null,
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
    thumbnailUrl: {
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
    createdByUserId: {
      type: String,
      required: true,
      index: true,
    },
    integratedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

visualizationSchema.index(
  { visualizationId: 1, createdByUserId: 1, tenantId: 1 },
  { unique: true },
);
visualizationSchema.index({ conversationId: 1, parentMessageId: 1, createdAt: 1 });
visualizationSchema.index({
  parentMessageId: 1,
  integrationState: 1,
  isLatestVersion: 1,
  deletedAt: 1,
  createdAt: 1,
});
visualizationSchema.index({
  rootVisualizationId: 1,
  isLatestVersion: 1,
  deletedAt: 1,
  versionNumber: -1,
});

export default visualizationSchema;
