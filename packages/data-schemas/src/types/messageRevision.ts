import type { Document } from 'mongoose';

export interface IMessageRevision extends Document {
  revisionId: string;
  messageId: string;
  conversationId: string;
  projectId?: string;
  createdByUserId: string;
  reason: string;
  previousText: string;
  updatedText: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}
