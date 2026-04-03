import type { Model } from 'mongoose';
import logger from '~/config/winston';
import type { IMessageRevision } from '~/types';

type MessageRevisionCreate = {
  messageId: string;
  conversationId: string;
  projectId?: string;
  reason: string;
  previousText: string;
  updatedText: string;
  metadata?: Record<string, unknown>;
};

export interface MessageRevisionMethods {
  createMessageRevision(
    userId: string,
    data: Omit<MessageRevisionCreate, 'createdByUserId'>,
  ): Promise<IMessageRevision>;
  listMessageRevisions(userId: string, messageId: string): Promise<IMessageRevision[]>;
}

export function createMessageRevisionMethods(
  mongoose: typeof import('mongoose'),
): MessageRevisionMethods {
  async function createMessageRevision(
    userId: string,
    data: Omit<MessageRevisionCreate, 'createdByUserId'>,
  ) {
    try {
      const MessageRevision = mongoose.models.MessageRevision as Model<IMessageRevision>;
      const revision = await MessageRevision.create({
        revisionId: crypto.randomUUID(),
        createdByUserId: userId,
        ...data,
      });

      return revision.toObject();
    } catch (error) {
      logger.error('[createMessageRevision] Error creating message revision', error);
      throw error;
    }
  }

  async function listMessageRevisions(userId: string, messageId: string) {
    try {
      const MessageRevision = mongoose.models.MessageRevision as Model<IMessageRevision>;
      return await MessageRevision.find({
        createdByUserId: userId,
        messageId,
      })
        .sort({ createdAt: -1 })
        .lean();
    } catch (error) {
      logger.error('[listMessageRevisions] Error listing message revisions', error);
      throw new Error('Error listing message revisions');
    }
  }

  return {
    createMessageRevision,
    listMessageRevisions,
  };
}
