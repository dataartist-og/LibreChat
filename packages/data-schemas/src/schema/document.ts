import { Schema } from 'mongoose';
import type {
  IDocumentClarification,
  IDocumentOverlay,
  IDocumentRenderVersion,
  IDocumentSpeechAudioArtifact,
  IDocumentSpeechPlan,
  IDocumentSpeechSegment,
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

const documentSpeechProfileSchema = new Schema(
  {
    provider: {
      type: String,
      required: true,
    },
    model: {
      type: String,
      required: true,
    },
    voice: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      default: null,
    },
    format: {
      type: String,
      required: true,
    },
    rate: {
      type: Number,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const documentSpeechSourceBlockSchema = new Schema(
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
    blockFingerprint: {
      type: String,
      required: true,
    },
  },
  {
    _id: false,
  },
);

const documentSpeechAlignmentSchema = new Schema(
  {
    char_start_times_ms: {
      type: [Number],
      default: [],
    },
    chars_durations_ms: {
      type: [Number],
      default: [],
    },
    chars: {
      type: [String],
      default: [],
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

export const documentSpeechPlanSchema: Schema<IDocumentSpeechPlan> = new Schema(
  {
    planId: {
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
    speechSurfaceFingerprint: {
      type: String,
      required: true,
      index: true,
    },
    narrationPolicyVersion: {
      type: String,
      required: true,
      index: true,
    },
    segmentIds: {
      type: [String],
      default: [],
    },
    sourceBlocksJson: {
      type: [documentSpeechSourceBlockSchema],
      default: [],
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

documentSpeechPlanSchema.index({ createdByUserId: 1, planId: 1, tenantId: 1 }, { unique: true });
documentSpeechPlanSchema.index(
  {
    documentId: 1,
    renderVersionId: 1,
    speechSurfaceFingerprint: 1,
    narrationPolicyVersion: 1,
    createdByUserId: 1,
  },
  { unique: true },
);

export const documentSpeechSegmentSchema: Schema<IDocumentSpeechSegment> = new Schema(
  {
    segmentId: {
      type: String,
      required: true,
      index: true,
    },
    planId: {
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
    blockId: {
      type: String,
      required: true,
      index: true,
    },
    charStart: {
      type: Number,
      default: null,
    },
    charEnd: {
      type: Number,
      default: null,
    },
    segmentIndex: {
      type: Number,
      required: true,
      index: true,
    },
    segmentKind: {
      type: String,
      required: true,
      enum: [
        'text',
        'heading',
        'caption',
        'table_summary',
        'figure_summary',
        'math_inline_rewrite',
        'math_block_narration',
        'pause_for_visual',
        'resume_after_pause',
      ],
    },
    sourceText: {
      type: String,
      required: true,
    },
    sourceContextBefore: {
      type: String,
      default: '',
    },
    sourceContextAfter: {
      type: String,
      default: '',
    },
    sourceFingerprint: {
      type: String,
      required: true,
      index: true,
    },
    spokenText: {
      type: String,
      default: '',
    },
    spokenFingerprint: {
      type: String,
      required: true,
      index: true,
    },
    playbackDirective: {
      type: String,
      required: true,
      enum: ['continue', 'pause_for_visual'],
      default: 'continue',
    },
    focusBlockId: {
      type: String,
      default: null,
    },
    resumeToken: {
      type: String,
      default: null,
    },
    warnings: {
      type: [String],
      default: [],
    },
    narrationModel: {
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

documentSpeechSegmentSchema.index(
  { createdByUserId: 1, segmentId: 1, tenantId: 1 },
  { unique: true },
);
documentSpeechSegmentSchema.index({ planId: 1, segmentIndex: 1 });
documentSpeechSegmentSchema.index({ documentId: 1, renderVersionId: 1, blockId: 1 });

export const documentSpeechAudioArtifactSchema: Schema<IDocumentSpeechAudioArtifact> = new Schema(
  {
    audioArtifactId: {
      type: String,
      required: true,
      index: true,
    },
    segmentId: {
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
    speechProfile: {
      type: documentSpeechProfileSchema,
      required: true,
    },
    audioCacheKey: {
      type: String,
      required: true,
      index: true,
    },
    fileId: {
      type: String,
      default: null,
    },
    mimeType: {
      type: String,
      required: true,
      default: 'audio/mpeg',
    },
    durationMs: {
      type: Number,
      default: null,
    },
    alignmentJson: {
      type: documentSpeechAlignmentSchema,
      default: null,
    },
    waveformJson: {
      type: Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'ready', 'failed', 'not_required'],
      default: 'pending',
    },
    errorMessage: {
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

documentSpeechAudioArtifactSchema.index(
  { createdByUserId: 1, audioArtifactId: 1, tenantId: 1 },
  { unique: true },
);
documentSpeechAudioArtifactSchema.index(
  { createdByUserId: 1, audioCacheKey: 1, tenantId: 1 },
  { unique: true },
);
documentSpeechAudioArtifactSchema.index({ segmentId: 1, status: 1, createdAt: -1 });
