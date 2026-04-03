import clarificationSchema from '~/schema/clarification';
import type { IMessageClarification } from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createClarificationModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(clarificationSchema);
  return (
    mongoose.models.MessageClarification ||
    mongoose.model<IMessageClarification>('MessageClarification', clarificationSchema)
  );
}
