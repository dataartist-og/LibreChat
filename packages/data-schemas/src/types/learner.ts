import type { Document } from 'mongoose';

export type LearnerSurface = 'dialog' | 'document' | 'chat';

export type LearnerKnowledgeCategory =
  | 'concept'
  | 'implementation'
  | 'bridge'
  | 'verification'
  | 'tooling'
  | 'math'
  | 'workflow';

export type LearnerKnowledgeStatus = 'emerging' | 'practicing' | 'solid' | 'mastered';

export interface ILearnerSourceRef {
  surface: LearnerSurface;
  sourceId: string;
  label?: string | null;
}

export interface ILearnerProfile extends Document {
  profileId: string;
  userId: string;
  profileSummaryMarkdown?: string | null;
  knowledgeLevelSummary: string;
  learningPreferencesJson?: Record<string, unknown> | null;
  currentFocusLabels: string[];
  lastUpdatedFromSurface?: LearnerSurface | null;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface ILearnerKnowledgeNode extends Document {
  learnerNodeId: string;
  userId: string;
  label: string;
  normalizedLabel: string;
  category: LearnerKnowledgeCategory;
  mastery: number;
  confidence: number;
  status: LearnerKnowledgeStatus;
  evidenceCount: number;
  evidenceSummary?: string | null;
  aliases: string[];
  sourceRefs: ILearnerSourceRef[];
  metadataJson?: Record<string, unknown> | null;
  lastObservedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface ILearnerKnowledgeEdge extends Document {
  learnerEdgeId: string;
  userId: string;
  fromNodeId: string;
  toNodeId: string;
  relation: string;
  weight: number;
  evidenceCount: number;
  metadataJson?: Record<string, unknown> | null;
  lastObservedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface ILearnerEvent extends Document {
  eventId: string;
  userId: string;
  surface: LearnerSurface;
  eventType: string;
  sourceId: string;
  sourceTitle?: string | null;
  summary: string;
  payloadJson?: Record<string, unknown> | null;
  appliedJson?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}
