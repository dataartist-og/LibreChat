import type { Document } from 'mongoose';

export interface IProject extends Document {
  projectId: string;
  ownerUserId: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  archivedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}
