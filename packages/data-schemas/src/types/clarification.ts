import type { Document } from 'mongoose';

export type ClarificationStatus = 'active' | 'collapsed' | 'integrated' | 'archived';

export interface IMessageClarification extends Document {
  clarificationId: string;
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
  status: ClarificationStatus;
  createdByUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
  integratedAt?: Date | null;
  integrationPatch?: Record<string, unknown> | null;
  tenantId?: string;
}
