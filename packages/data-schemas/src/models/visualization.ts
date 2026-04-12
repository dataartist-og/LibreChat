import visualizationSchema from '~/schema/visualization';
import type { IVisualizationArtifact } from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createVisualizationModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(visualizationSchema);
  return (
    mongoose.models.VisualizationArtifact ||
    mongoose.model<IVisualizationArtifact>('VisualizationArtifact', visualizationSchema)
  );
}
