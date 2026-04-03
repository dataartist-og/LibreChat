import { Schema } from 'mongoose';
import type { IProject } from '~/types';

const projectSchema: Schema<IProject> = new Schema(
  {
    projectId: {
      type: String,
      required: true,
      index: true,
    },
    ownerUserId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: null,
    },
    icon: {
      type: String,
      default: null,
    },
    color: {
      type: String,
      default: null,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

projectSchema.index({ ownerUserId: 1, archivedAt: 1, updatedAt: -1 });
projectSchema.index({ projectId: 1, ownerUserId: 1, tenantId: 1 }, { unique: true });

export default projectSchema;
