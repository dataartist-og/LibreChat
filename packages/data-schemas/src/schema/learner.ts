import { Schema } from 'mongoose';
import type {
  ILearnerEvent,
  ILearnerKnowledgeEdge,
  ILearnerKnowledgeNode,
  ILearnerProfile,
} from '~/types';

const learnerSourceRefSchema = new Schema(
  {
    surface: {
      type: String,
      enum: ['dialog', 'document', 'chat'],
      required: true,
    },
    sourceId: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      default: null,
    },
  },
  {
    _id: false,
  },
);

export const learnerProfileSchema: Schema<ILearnerProfile> = new Schema(
  {
    profileId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    profileSummaryMarkdown: {
      type: String,
      default: null,
    },
    knowledgeLevelSummary: {
      type: String,
      required: true,
      default: 'Knowledge state is still being established.',
    },
    learningPreferencesJson: {
      type: Schema.Types.Mixed,
      default: null,
    },
    currentFocusLabels: {
      type: [String],
      default: [],
    },
    lastUpdatedFromSurface: {
      type: String,
      enum: ['dialog', 'document', 'chat'],
      default: null,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

learnerProfileSchema.index({ userId: 1, tenantId: 1 }, { unique: true });
learnerProfileSchema.index({ updatedAt: -1 });

export const learnerKnowledgeNodeSchema: Schema<ILearnerKnowledgeNode> = new Schema(
  {
    learnerNodeId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    label: {
      type: String,
      required: true,
    },
    normalizedLabel: {
      type: String,
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ['concept', 'implementation', 'bridge', 'verification', 'tooling', 'math', 'workflow'],
      required: true,
    },
    mastery: {
      type: Number,
      required: true,
      default: 0.1,
    },
    confidence: {
      type: Number,
      required: true,
      default: 0.2,
    },
    status: {
      type: String,
      enum: ['emerging', 'practicing', 'solid', 'mastered'],
      required: true,
      default: 'emerging',
    },
    evidenceCount: {
      type: Number,
      required: true,
      default: 0,
    },
    evidenceSummary: {
      type: String,
      default: null,
    },
    aliases: {
      type: [String],
      default: [],
    },
    sourceRefs: {
      type: [learnerSourceRefSchema],
      default: [],
    },
    metadataJson: {
      type: Schema.Types.Mixed,
      default: null,
    },
    lastObservedAt: {
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

learnerKnowledgeNodeSchema.index({ userId: 1, learnerNodeId: 1, tenantId: 1 }, { unique: true });
learnerKnowledgeNodeSchema.index({ userId: 1, normalizedLabel: 1, tenantId: 1 }, { unique: true });
learnerKnowledgeNodeSchema.index({ userId: 1, mastery: -1, confidence: -1 });

export const learnerKnowledgeEdgeSchema: Schema<ILearnerKnowledgeEdge> = new Schema(
  {
    learnerEdgeId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    fromNodeId: {
      type: String,
      required: true,
      index: true,
    },
    toNodeId: {
      type: String,
      required: true,
      index: true,
    },
    relation: {
      type: String,
      required: true,
    },
    weight: {
      type: Number,
      required: true,
      default: 0.4,
    },
    evidenceCount: {
      type: Number,
      required: true,
      default: 0,
    },
    metadataJson: {
      type: Schema.Types.Mixed,
      default: null,
    },
    lastObservedAt: {
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

learnerKnowledgeEdgeSchema.index(
  { userId: 1, fromNodeId: 1, toNodeId: 1, relation: 1, tenantId: 1 },
  { unique: true },
);
learnerKnowledgeEdgeSchema.index({ userId: 1, learnerEdgeId: 1, tenantId: 1 }, { unique: true });

export const learnerEventSchema: Schema<ILearnerEvent> = new Schema(
  {
    eventId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    surface: {
      type: String,
      enum: ['dialog', 'document', 'chat'],
      required: true,
    },
    eventType: {
      type: String,
      required: true,
    },
    sourceId: {
      type: String,
      required: true,
      index: true,
    },
    sourceTitle: {
      type: String,
      default: null,
    },
    summary: {
      type: String,
      required: true,
    },
    payloadJson: {
      type: Schema.Types.Mixed,
      default: null,
    },
    appliedJson: {
      type: Schema.Types.Mixed,
      default: null,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

learnerEventSchema.index({ userId: 1, eventId: 1, tenantId: 1 }, { unique: true });
learnerEventSchema.index({ userId: 1, createdAt: -1 });
