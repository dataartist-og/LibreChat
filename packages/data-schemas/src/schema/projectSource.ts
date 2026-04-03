import { Schema } from 'mongoose';
import type { IProjectSource } from '~/types';

const projectSourceSchema: Schema<IProjectSource> = new Schema(
  {
    sourceId: {
      type: String,
      required: true,
      index: true,
    },
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
    sourceType: {
      type: String,
      enum: ['file', 'url', 'note'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: null,
    },
    fileId: {
      type: String,
      default: null,
    },
    url: {
      type: String,
      default: null,
    },
    noteBody: {
      type: String,
      default: null,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

projectSourceSchema.index({ sourceId: 1, ownerUserId: 1, tenantId: 1 }, { unique: true });
projectSourceSchema.index({ projectId: 1, ownerUserId: 1, updatedAt: -1 });

export default projectSourceSchema;
