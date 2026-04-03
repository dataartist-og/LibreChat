import messageRevisionSchema from '~/schema/messageRevision';
import type { IMessageRevision } from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createMessageRevisionModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(messageRevisionSchema);
  return (
    mongoose.models.MessageRevision ||
    mongoose.model<IMessageRevision>('MessageRevision', messageRevisionSchema)
  );
}
