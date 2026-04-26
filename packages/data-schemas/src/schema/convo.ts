import { Schema } from 'mongoose';
import { conversationPreset } from './defaults';
import type { IConversation } from '~/types';

const convoSchema: Schema<IConversation> = new Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
      meiliIndex: true,
    },
    projectId: {
      type: String,
      index: true,
      required: false,
    },
    title: {
      type: String,
      default: 'New Chat',
      meiliIndex: true,
    },
    user: {
      type: String,
      index: true,
      meiliIndex: true,
    },
    messages: [{ type: Schema.Types.ObjectId, ref: 'Message' }],
    ...conversationPreset,
    agent_id: {
      type: String,
    },
    tags: {
      type: [String],
      default: [],
      meiliIndex: true,
    },
    files: {
      type: [String],
    },
    importMetadata: {
      type: {
        source: {
          type: String,
        },
        externalConversationId: {
          type: String,
        },
        sourceCreatedAt: {
          type: Date,
        },
        sourceUpdatedAt: {
          type: Date,
        },
        importedAt: {
          type: Date,
        },
      },
      _id: false,
      default: undefined,
    },
    expiredAt: {
      type: Date,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

convoSchema.index({ expiredAt: 1 }, { expireAfterSeconds: 0 });
convoSchema.index({ createdAt: 1, updatedAt: 1 });
convoSchema.index({ conversationId: 1, user: 1, tenantId: 1 }, { unique: true });
convoSchema.index({ user: 1, projectId: 1, updatedAt: -1 });
convoSchema.index({
  user: 1,
  'importMetadata.source': 1,
  'importMetadata.externalConversationId': 1,
  tenantId: 1,
});

// index for MeiliSearch sync operations
convoSchema.index({ _meiliIndex: 1, expiredAt: 1 });

export default convoSchema;
