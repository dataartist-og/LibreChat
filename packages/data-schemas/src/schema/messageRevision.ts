import { Schema } from 'mongoose';
import type { IMessageRevision } from '~/types';

const messageRevisionSchema: Schema<IMessageRevision> = new Schema(
  {
    revisionId: {
      type: String,
      required: true,
      index: true,
    },
    messageId: {
      type: String,
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    projectId: {
      type: String,
      default: null,
    },
    createdByUserId: {
      type: String,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
    },
    previousText: {
      type: String,
      required: true,
      default: '',
    },
    updatedText: {
      type: String,
      required: true,
      default: '',
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

messageRevisionSchema.index({ revisionId: 1, createdByUserId: 1, tenantId: 1 }, { unique: true });
messageRevisionSchema.index({ messageId: 1, createdAt: -1 });

export default messageRevisionSchema;
