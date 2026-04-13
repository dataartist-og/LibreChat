import {
  dialogCellSchema,
  dialogClarificationSchema,
  dialogExecutionRunSchema,
  dialogImportSchema,
  dialogPlanNodeSchema,
  dialogSourceMapSchema,
  dialogTutorStateSchema,
  dialogVisualizationSchema,
  studyDialogSchema,
} from '~/schema/dialog';
import type {
  IDialogCell,
  IDialogClarification,
  IDialogExecutionRun,
  IDialogImport,
  IDialogPlanNode,
  IDialogTutorState,
  IDialogSourceMap,
  IDialogVisualization,
  IStudyDialog,
} from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createStudyDialogModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(studyDialogSchema);
  return (
    mongoose.models.StudyDialog || mongoose.model<IStudyDialog>('StudyDialog', studyDialogSchema)
  );
}

export function createDialogCellModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(dialogCellSchema);
  return mongoose.models.DialogCell || mongoose.model<IDialogCell>('DialogCell', dialogCellSchema);
}

export function createDialogExecutionRunModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(dialogExecutionRunSchema);
  return (
    mongoose.models.DialogExecutionRun ||
    mongoose.model<IDialogExecutionRun>('DialogExecutionRun', dialogExecutionRunSchema)
  );
}

export function createDialogPlanNodeModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(dialogPlanNodeSchema);
  return (
    mongoose.models.DialogPlanNode ||
    mongoose.model<IDialogPlanNode>('DialogPlanNode', dialogPlanNodeSchema)
  );
}

export function createDialogTutorStateModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(dialogTutorStateSchema);
  return (
    mongoose.models.DialogTutorState ||
    mongoose.model<IDialogTutorState>('DialogTutorState', dialogTutorStateSchema)
  );
}

export function createDialogImportModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(dialogImportSchema);
  return (
    mongoose.models.DialogImport ||
    mongoose.model<IDialogImport>('DialogImport', dialogImportSchema)
  );
}

export function createDialogSourceMapModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(dialogSourceMapSchema);
  return (
    mongoose.models.DialogSourceMap ||
    mongoose.model<IDialogSourceMap>('DialogSourceMap', dialogSourceMapSchema)
  );
}

export function createDialogClarificationModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(dialogClarificationSchema);
  return (
    mongoose.models.DialogClarification ||
    mongoose.model<IDialogClarification>('DialogClarification', dialogClarificationSchema)
  );
}

export function createDialogVisualizationModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(dialogVisualizationSchema);
  return (
    mongoose.models.DialogVisualization ||
    mongoose.model<IDialogVisualization>('DialogVisualization', dialogVisualizationSchema)
  );
}
