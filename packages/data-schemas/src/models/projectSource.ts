import projectSourceSchema from '~/schema/projectSource';
import type { IProjectSource } from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createProjectSourceModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(projectSourceSchema);
  return (
    mongoose.models.ProjectSource ||
    mongoose.model<IProjectSource>('ProjectSource', projectSourceSchema)
  );
}
