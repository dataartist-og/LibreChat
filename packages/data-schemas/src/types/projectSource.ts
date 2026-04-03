import type { Document } from 'mongoose';

export type ProjectSourceType = 'file' | 'url' | 'note';

export interface IProjectSource extends Document {
  sourceId: string;
  projectId: string;
  ownerUserId: string;
  sourceType: ProjectSourceType;
  title: string;
  description?: string | null;
  fileId?: string | null;
  url?: string | null;
  noteBody?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}
