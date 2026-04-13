import {
  learnerEventSchema,
  learnerKnowledgeEdgeSchema,
  learnerKnowledgeNodeSchema,
  learnerProfileSchema,
} from '~/schema/learner';
import type {
  ILearnerEvent,
  ILearnerKnowledgeEdge,
  ILearnerKnowledgeNode,
  ILearnerProfile,
} from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createLearnerProfileModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(learnerProfileSchema);
  return (
    mongoose.models.LearnerProfile ||
    mongoose.model<ILearnerProfile>('LearnerProfile', learnerProfileSchema)
  );
}

export function createLearnerKnowledgeNodeModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(learnerKnowledgeNodeSchema);
  return (
    mongoose.models.LearnerKnowledgeNode ||
    mongoose.model<ILearnerKnowledgeNode>('LearnerKnowledgeNode', learnerKnowledgeNodeSchema)
  );
}

export function createLearnerKnowledgeEdgeModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(learnerKnowledgeEdgeSchema);
  return (
    mongoose.models.LearnerKnowledgeEdge ||
    mongoose.model<ILearnerKnowledgeEdge>('LearnerKnowledgeEdge', learnerKnowledgeEdgeSchema)
  );
}

export function createLearnerEventModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(learnerEventSchema);
  return (
    mongoose.models.LearnerEvent ||
    mongoose.model<ILearnerEvent>('LearnerEvent', learnerEventSchema)
  );
}
