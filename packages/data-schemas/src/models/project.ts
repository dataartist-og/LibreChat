import projectSchema from '~/schema/project';
import type { IProject } from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createProjectModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(projectSchema);
  return mongoose.models.Project || mongoose.model<IProject>('Project', projectSchema);
}
