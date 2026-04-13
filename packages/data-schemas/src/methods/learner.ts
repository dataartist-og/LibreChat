import crypto from 'node:crypto';
import type { Model } from 'mongoose';
import logger from '~/config/winston';
import type {
  ILearnerEvent,
  ILearnerKnowledgeEdge,
  ILearnerKnowledgeNode,
  ILearnerProfile,
  ILearnerSourceRef,
  LearnerKnowledgeCategory,
  LearnerKnowledgeStatus,
  LearnerSurface,
} from '~/types';

type LearnerProfileCreate = {
  profileId?: string;
  profileSummaryMarkdown?: string | null;
  knowledgeLevelSummary?: string;
  learningPreferencesJson?: Record<string, unknown> | null;
  currentFocusLabels?: string[];
  lastUpdatedFromSurface?: LearnerSurface | null;
};

type LearnerProfileUpdate = Partial<
  Pick<
    ILearnerProfile,
    | 'profileSummaryMarkdown'
    | 'knowledgeLevelSummary'
    | 'learningPreferencesJson'
    | 'currentFocusLabels'
    | 'lastUpdatedFromSurface'
  >
>;

type LearnerKnowledgeNodeUpsert = {
  learnerNodeId?: string;
  label: string;
  normalizedLabel: string;
  category: LearnerKnowledgeCategory;
  mastery: number;
  confidence: number;
  status: LearnerKnowledgeStatus;
  evidenceCount?: number;
  evidenceSummary?: string | null;
  aliases?: string[];
  sourceRefs?: ILearnerSourceRef[];
  metadataJson?: Record<string, unknown> | null;
  lastObservedAt?: Date | null;
};

type LearnerKnowledgeEdgeUpsert = {
  learnerEdgeId?: string;
  fromNodeId: string;
  toNodeId: string;
  relation: string;
  weight: number;
  evidenceCount?: number;
  metadataJson?: Record<string, unknown> | null;
  lastObservedAt?: Date | null;
};

type LearnerEventCreate = {
  eventId?: string;
  surface: LearnerSurface;
  eventType: string;
  sourceId: string;
  sourceTitle?: string | null;
  summary: string;
  payloadJson?: Record<string, unknown> | null;
  appliedJson?: Record<string, unknown> | null;
};

export interface LearnerMethods {
  createLearnerProfile(userId: string, data?: LearnerProfileCreate): Promise<ILearnerProfile>;
  getLearnerProfile(userId: string): Promise<ILearnerProfile | null>;
  updateLearnerProfile(
    userId: string,
    data: LearnerProfileUpdate,
  ): Promise<ILearnerProfile | null>;
  listLearnerKnowledgeNodes(
    userId: string,
    params?: { limit?: number; categories?: LearnerKnowledgeCategory[] },
  ): Promise<ILearnerKnowledgeNode[]>;
  getLearnerKnowledgeNodeByLabel(
    userId: string,
    normalizedLabel: string,
  ): Promise<ILearnerKnowledgeNode | null>;
  upsertLearnerKnowledgeNode(
    userId: string,
    data: LearnerKnowledgeNodeUpsert,
  ): Promise<ILearnerKnowledgeNode>;
  listLearnerKnowledgeEdges(userId: string): Promise<ILearnerKnowledgeEdge[]>;
  upsertLearnerKnowledgeEdge(
    userId: string,
    data: LearnerKnowledgeEdgeUpsert,
  ): Promise<ILearnerKnowledgeEdge>;
  createLearnerEvent(userId: string, data: LearnerEventCreate): Promise<ILearnerEvent>;
  listLearnerEvents(
    userId: string,
    params?: { limit?: number; surface?: LearnerSurface },
  ): Promise<ILearnerEvent[]>;
}

export function createLearnerMethods(mongoose: typeof import('mongoose')) {
  async function createLearnerProfile(userId: string, data: LearnerProfileCreate = {}) {
    try {
      const LearnerProfile = mongoose.models.LearnerProfile as Model<ILearnerProfile>;
      return await LearnerProfile.create({
        profileId: data.profileId ?? crypto.randomUUID(),
        userId,
        profileSummaryMarkdown: data.profileSummaryMarkdown ?? null,
        knowledgeLevelSummary:
          data.knowledgeLevelSummary ?? 'Knowledge state is still being established.',
        learningPreferencesJson: data.learningPreferencesJson ?? null,
        currentFocusLabels: data.currentFocusLabels ?? [],
        lastUpdatedFromSurface: data.lastUpdatedFromSurface ?? null,
      });
    } catch (error) {
      logger.error('[createLearnerProfile] Error creating learner profile', error);
      throw new Error('Error creating learner profile');
    }
  }

  async function getLearnerProfile(userId: string) {
    try {
      const LearnerProfile = mongoose.models.LearnerProfile as Model<ILearnerProfile>;
      return await LearnerProfile.findOne({ userId }).lean();
    } catch (error) {
      logger.error('[getLearnerProfile] Error getting learner profile', error);
      throw new Error('Error getting learner profile');
    }
  }

  async function updateLearnerProfile(userId: string, data: LearnerProfileUpdate) {
    try {
      const LearnerProfile = mongoose.models.LearnerProfile as Model<ILearnerProfile>;
      return await LearnerProfile.findOneAndUpdate({ userId }, { $set: data }, { new: true }).lean();
    } catch (error) {
      logger.error('[updateLearnerProfile] Error updating learner profile', error);
      throw new Error('Error updating learner profile');
    }
  }

  async function listLearnerKnowledgeNodes(
    userId: string,
    params?: { limit?: number; categories?: LearnerKnowledgeCategory[] },
  ) {
    try {
      const LearnerKnowledgeNode = mongoose.models.LearnerKnowledgeNode as Model<ILearnerKnowledgeNode>;
      const query = {
        userId,
        ...(params?.categories?.length ? { category: { $in: params.categories } } : {}),
      };
      return await LearnerKnowledgeNode.find(query)
        .sort({ mastery: -1, confidence: -1, updatedAt: -1 })
        .limit(params?.limit ?? 200)
        .lean();
    } catch (error) {
      logger.error('[listLearnerKnowledgeNodes] Error listing learner knowledge nodes', error);
      throw new Error('Error listing learner knowledge nodes');
    }
  }

  async function getLearnerKnowledgeNodeByLabel(userId: string, normalizedLabel: string) {
    try {
      const LearnerKnowledgeNode = mongoose.models.LearnerKnowledgeNode as Model<ILearnerKnowledgeNode>;
      return await LearnerKnowledgeNode.findOne({ userId, normalizedLabel }).lean();
    } catch (error) {
      logger.error(
        '[getLearnerKnowledgeNodeByLabel] Error getting learner knowledge node',
        error,
      );
      throw new Error('Error getting learner knowledge node');
    }
  }

  async function upsertLearnerKnowledgeNode(userId: string, data: LearnerKnowledgeNodeUpsert) {
    try {
      const LearnerKnowledgeNode = mongoose.models
        .LearnerKnowledgeNode as Model<ILearnerKnowledgeNode>;
      const node = await LearnerKnowledgeNode.findOneAndUpdate(
        { userId, normalizedLabel: data.normalizedLabel },
        {
          $set: {
            label: data.label,
            category: data.category,
            mastery: data.mastery,
            confidence: data.confidence,
            status: data.status,
            evidenceSummary: data.evidenceSummary ?? null,
            aliases: data.aliases ?? [],
            sourceRefs: data.sourceRefs ?? [],
            metadataJson: data.metadataJson ?? null,
            lastObservedAt: data.lastObservedAt ?? null,
          },
          $setOnInsert: {
            learnerNodeId: data.learnerNodeId ?? crypto.randomUUID(),
            userId,
          },
          $inc: {
            evidenceCount: data.evidenceCount ?? 1,
          },
        },
        {
          new: true,
          upsert: true,
        },
      ).lean();

      if (!node) {
        throw new Error('Learner knowledge node upsert returned no document');
      }

      return node;
    } catch (error) {
      logger.error('[upsertLearnerKnowledgeNode] Error upserting learner knowledge node', error);
      throw new Error('Error upserting learner knowledge node');
    }
  }

  async function listLearnerKnowledgeEdges(userId: string) {
    try {
      const LearnerKnowledgeEdge = mongoose.models.LearnerKnowledgeEdge as Model<ILearnerKnowledgeEdge>;
      return await LearnerKnowledgeEdge.find({ userId }).sort({ weight: -1, updatedAt: -1 }).lean();
    } catch (error) {
      logger.error('[listLearnerKnowledgeEdges] Error listing learner knowledge edges', error);
      throw new Error('Error listing learner knowledge edges');
    }
  }

  async function upsertLearnerKnowledgeEdge(userId: string, data: LearnerKnowledgeEdgeUpsert) {
    try {
      const LearnerKnowledgeEdge = mongoose.models.LearnerKnowledgeEdge as Model<ILearnerKnowledgeEdge>;
      const edge = await LearnerKnowledgeEdge.findOneAndUpdate(
        {
          userId,
          fromNodeId: data.fromNodeId,
          toNodeId: data.toNodeId,
          relation: data.relation,
        },
        {
          $set: {
            weight: data.weight,
            metadataJson: data.metadataJson ?? null,
            lastObservedAt: data.lastObservedAt ?? null,
          },
          $setOnInsert: {
            learnerEdgeId: data.learnerEdgeId ?? crypto.randomUUID(),
            userId,
          },
          $inc: {
            evidenceCount: data.evidenceCount ?? 1,
          },
        },
        {
          new: true,
          upsert: true,
        },
      ).lean();

      if (!edge) {
        throw new Error('Learner knowledge edge upsert returned no document');
      }

      return edge;
    } catch (error) {
      logger.error('[upsertLearnerKnowledgeEdge] Error upserting learner knowledge edge', error);
      throw new Error('Error upserting learner knowledge edge');
    }
  }

  async function createLearnerEvent(userId: string, data: LearnerEventCreate) {
    try {
      const LearnerEvent = mongoose.models.LearnerEvent as Model<ILearnerEvent>;
      return await LearnerEvent.create({
        eventId: data.eventId ?? crypto.randomUUID(),
        userId,
        surface: data.surface,
        eventType: data.eventType,
        sourceId: data.sourceId,
        sourceTitle: data.sourceTitle ?? null,
        summary: data.summary,
        payloadJson: data.payloadJson ?? null,
        appliedJson: data.appliedJson ?? null,
      });
    } catch (error) {
      logger.error('[createLearnerEvent] Error creating learner event', error);
      throw new Error('Error creating learner event');
    }
  }

  async function listLearnerEvents(
    userId: string,
    params?: { limit?: number; surface?: LearnerSurface },
  ) {
    try {
      const LearnerEvent = mongoose.models.LearnerEvent as Model<ILearnerEvent>;
      const query = {
        userId,
        ...(params?.surface ? { surface: params.surface } : {}),
      };
      return await LearnerEvent.find(query)
        .sort({ createdAt: -1 })
        .limit(params?.limit ?? 50)
        .lean();
    } catch (error) {
      logger.error('[listLearnerEvents] Error listing learner events', error);
      throw new Error('Error listing learner events');
    }
  }

  return {
    createLearnerProfile,
    getLearnerProfile,
    updateLearnerProfile,
    listLearnerKnowledgeNodes,
    getLearnerKnowledgeNodeByLabel,
    upsertLearnerKnowledgeNode,
    listLearnerKnowledgeEdges,
    upsertLearnerKnowledgeEdge,
    createLearnerEvent,
    listLearnerEvents,
  };
}
