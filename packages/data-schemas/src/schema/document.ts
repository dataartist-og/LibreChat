import { Schema } from 'mongoose';
import type {
  IDocumentClarification,
  IDocumentOverlay,
  IDocumentRenderVersion,
  IDocumentVisualization,
  IStudyDocument,
} from '~/types';

const documentAnchorSchema = new Schema(
  {
    blockId: {
      type: String,
      required: true,
    },
    blockType: {
      type: String,
      required: true,
      enum: [
        'heading',
        'paragraph',
        'list',
        'table',
        'blockquote',
        'code',
        'math_block',
        'figure',
        'caption',
        'page_break',
      ],
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
    headingPath: {
      type: [String],
      default: [],
    },
    pageStart: {
      type: Number,
      default: null,
    },
    pageEnd: {
      type: Number,
      default: null,
    },
  },
  {
    _id: false,
  },
);

export const studyDocumentSchema: Schema<IStudyDocument> = new Schema(
  {
    documentId: {
      type: String,
      required: true,
      index: true,
    },
    projectId: {
      type: String,
      default: null,
      index: true,
    },
    sourceFileId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    sourceMimeType: {
      type: String,
      required: true,
    },
    sourceKind: {
      type: String,
      required: true,
      enum: ['pdf', 'markdown', 'text', 'docx', 'epub', 'other'],
    },
    ingestionStatus: {
      type: String,
      required: true,
      enum: ['pending', 'processing', 'ready', 'failed'],
      default: 'pending',
    },
    ingestionStrategy: {
      type: String,
      required: true,
      enum: ['ocr_markdown', 'document_parser', 'markdown_direct', 'text_direct', 'plain_text'],
      default: 'plain_text',
    },
    activeRenderVersionId: {
      type: String,
      default: null,
    },
    activeOverlayId: {
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

studyDocumentSchema.index({ createdByUserId: 1, sourceFileId: 1, tenantId: 1 }, { unique: true });
studyDocumentSchema.index({ createdByUserId: 1, updatedAt: -1 });

export const documentRenderVersionSchema: Schema<IDocumentRenderVersion> = new Schema(
  {
    renderVersionId: {
      type: String,
      required: true,
      index: true,
    },
    documentId: {
      type: String,
      required: true,
      index: true,
    },
    versionNumber: {
      type: Number,
      required: true,
    },
    documentIrJson: {
      type: Schema.Types.Mixed,
      required: true,
    },
    renderHtml: {
      type: String,
      default: null,
    },
    outlineJson: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    assetsJson: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    createdByUserId: {
      type: String,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

documentRenderVersionSchema.index(
  { createdByUserId: 1, renderVersionId: 1, tenantId: 1 },
  { unique: true },
);
documentRenderVersionSchema.index({ documentId: 1, isActive: 1, versionNumber: -1 });

export const documentOverlaySchema: Schema<IDocumentOverlay> = new Schema(
  {
    overlayId: {
      type: String,
      required: true,
      index: true,
    },
    documentId: {
      type: String,
      required: true,
      index: true,
    },
    renderVersionId: {
      type: String,
      required: true,
      index: true,
    },
    overlayVersionNumber: {
      type: Number,
      required: true,
    },
    overlayJson: {
      type: Schema.Types.Mixed,
      required: true,
    },
    createdByUserId: {
      type: String,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

documentOverlaySchema.index({ createdByUserId: 1, overlayId: 1, tenantId: 1 }, { unique: true });
documentOverlaySchema.index({
  documentId: 1,
  renderVersionId: 1,
  isActive: 1,
  overlayVersionNumber: -1,
});

export const documentClarificationSchema: Schema<IDocumentClarification> = new Schema(
  {
    clarificationId: {
      type: String,
      required: true,
      index: true,
    },
    documentId: {
      type: String,
      required: true,
      index: true,
    },
    renderVersionId: {
      type: String,
      required: true,
      index: true,
    },
    overlayId: {
      type: String,
      default: null,
    },
    anchor: {
      type: documentAnchorSchema,
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
      required: true,
      enum: ['active', 'integrated', 'archived'],
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

documentClarificationSchema.index(
  { createdByUserId: 1, clarificationId: 1, tenantId: 1 },
  { unique: true },
);
documentClarificationSchema.index({ documentId: 1, renderVersionId: 1, status: 1, createdAt: 1 });

export const documentVisualizationSchema: Schema<IDocumentVisualization> = new Schema(
  {
    visualizationId: {
      type: String,
      required: true,
      index: true,
    },
    documentId: {
      type: String,
      required: true,
      index: true,
    },
    renderVersionId: {
      type: String,
      required: true,
      index: true,
    },
    overlayId: {
      type: String,
      default: null,
    },
    anchor: {
      type: documentAnchorSchema,
      required: true,
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

documentVisualizationSchema.index(
  { createdByUserId: 1, visualizationId: 1, tenantId: 1 },
  { unique: true },
);
documentVisualizationSchema.index({
  documentId: 1,
  renderVersionId: 1,
  integrationState: 1,
  isLatestVersion: 1,
  deletedAt: 1,
  createdAt: 1,
});
documentVisualizationSchema.index({
  rootVisualizationId: 1,
  isLatestVersion: 1,
  deletedAt: 1,
  versionNumber: -1,
});
