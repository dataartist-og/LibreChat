import {
  documentClarificationSchema,
  documentOverlaySchema,
  documentRenderVersionSchema,
  documentVisualizationSchema,
  studyDocumentSchema,
} from '~/schema/document';
import type {
  IDocumentClarification,
  IDocumentOverlay,
  IDocumentRenderVersion,
  IDocumentVisualization,
  IStudyDocument,
} from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createStudyDocumentModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(studyDocumentSchema);
  return (
    mongoose.models.StudyDocument ||
    mongoose.model<IStudyDocument>('StudyDocument', studyDocumentSchema)
  );
}

export function createDocumentRenderVersionModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(documentRenderVersionSchema);
  return (
    mongoose.models.DocumentRenderVersion ||
    mongoose.model<IDocumentRenderVersion>('DocumentRenderVersion', documentRenderVersionSchema)
  );
}

export function createDocumentOverlayModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(documentOverlaySchema);
  return (
    mongoose.models.DocumentOverlay ||
    mongoose.model<IDocumentOverlay>('DocumentOverlay', documentOverlaySchema)
  );
}

export function createDocumentClarificationModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(documentClarificationSchema);
  return (
    mongoose.models.DocumentClarification ||
    mongoose.model<IDocumentClarification>('DocumentClarification', documentClarificationSchema)
  );
}

export function createDocumentVisualizationModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(documentVisualizationSchema);
  return (
    mongoose.models.DocumentVisualization ||
    mongoose.model<IDocumentVisualization>('DocumentVisualization', documentVisualizationSchema)
  );
}
