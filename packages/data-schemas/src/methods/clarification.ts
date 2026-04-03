import type { Model } from 'mongoose';
import logger from '~/config/winston';
import type { ClarificationStatus, IMessageClarification } from '~/types';

type ClarificationCreate = {
  projectId: string;
  conversationId: string;
  parentMessageId: string;
  anchorStart: number;
  anchorEnd: number;
  anchorText: string;
  anchorContextBefore: string;
  anchorContextAfter: string;
  clarificationQuestion: string;
  clarificationAnswer: string;
  status?: ClarificationStatus;
};

type ClarificationUpdate = Partial<
  Pick<
    IMessageClarification,
    | 'anchorStart'
    | 'anchorEnd'
    | 'anchorText'
    | 'anchorContextBefore'
    | 'anchorContextAfter'
    | 'clarificationQuestion'
    | 'clarificationAnswer'
    | 'status'
    | 'integratedAt'
    | 'integrationPatch'
  >
>;

export interface ClarificationMethods {
  createClarification(
    userId: string,
    data: Omit<ClarificationCreate, 'createdByUserId'>,
  ): Promise<IMessageClarification>;
  listClarifications(
    userId: string,
    params: { conversationId: string; parentMessageId?: string; includeArchived?: boolean },
  ): Promise<IMessageClarification[]>;
  getClarification(userId: string, clarificationId: string): Promise<IMessageClarification | null>;
  updateClarification(
    userId: string,
    clarificationId: string,
    data: ClarificationUpdate,
  ): Promise<IMessageClarification | null>;
  updateClarificationStatus(
    userId: string,
    clarificationId: string,
    status: ClarificationStatus,
  ): Promise<IMessageClarification | null>;
}

export function createClarificationMethods(
  mongoose: typeof import('mongoose'),
): ClarificationMethods {
  async function createClarification(
    userId: string,
    data: Omit<ClarificationCreate, 'createdByUserId'>,
  ) {
    try {
      const Clarification = mongoose.models.MessageClarification as Model<IMessageClarification>;
      const clarification = await Clarification.create({
        clarificationId: crypto.randomUUID(),
        ...data,
        createdByUserId: userId,
      });

      return clarification.toObject();
    } catch (error) {
      logger.error('[createClarification] Error creating clarification', error);
      throw error;
    }
  }

  async function listClarifications(
    userId: string,
    {
      conversationId,
      parentMessageId,
      includeArchived = false,
    }: { conversationId: string; parentMessageId?: string; includeArchived?: boolean },
  ) {
    try {
      const Clarification = mongoose.models.MessageClarification as Model<IMessageClarification>;
      const query = {
        createdByUserId: userId,
        conversationId,
        ...(parentMessageId ? { parentMessageId } : {}),
        ...(includeArchived ? {} : { status: { $ne: 'archived' } }),
      };

      return await Clarification.find(query).sort({ createdAt: 1 }).lean();
    } catch (error) {
      logger.error('[listClarifications] Error listing clarifications', error);
      throw new Error('Error listing clarifications');
    }
  }

  async function getClarification(userId: string, clarificationId: string) {
    try {
      const Clarification = mongoose.models.MessageClarification as Model<IMessageClarification>;
      return await Clarification.findOne({
        clarificationId,
        createdByUserId: userId,
      }).lean();
    } catch (error) {
      logger.error('[getClarification] Error getting clarification', error);
      throw new Error('Error getting clarification');
    }
  }

  async function updateClarification(
    userId: string,
    clarificationId: string,
    data: ClarificationUpdate,
  ) {
    try {
      const Clarification = mongoose.models.MessageClarification as Model<IMessageClarification>;
      return await Clarification.findOneAndUpdate(
        {
          clarificationId,
          createdByUserId: userId,
        },
        {
          $set: data,
        },
        {
          new: true,
        },
      ).lean();
    } catch (error) {
      logger.error('[updateClarification] Error updating clarification', error);
      throw error;
    }
  }

  async function updateClarificationStatus(
    userId: string,
    clarificationId: string,
    status: ClarificationStatus,
  ) {
    return await updateClarification(userId, clarificationId, { status });
  }

  return {
    createClarification,
    listClarifications,
    getClarification,
    updateClarification,
    updateClarificationStatus,
  };
}
