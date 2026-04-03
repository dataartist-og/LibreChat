import { Schema } from 'mongoose';
import type { IMessageClarification } from '~/types';

const clarificationSchema: Schema<IMessageClarification> = new Schema(
  {
    clarificationId: {
      type: String,
      required: true,
      index: true,
    },
    projectId: {
      type: String,
      required: true,
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
    clarificationQuestion: {
      type: String,
      required: true,
    },
    clarificationAnswer: {
      type: String,
      required: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'collapsed', 'integrated', 'archived'],
      required: true,
      default: 'active',
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
    integrationPatch: {
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

clarificationSchema.index({ clarificationId: 1, createdByUserId: 1, tenantId: 1 }, { unique: true });
clarificationSchema.index({ parentMessageId: 1, status: 1, createdAt: 1 });
clarificationSchema.index({ conversationId: 1, parentMessageId: 1, createdAt: 1 });

export default clarificationSchema;
