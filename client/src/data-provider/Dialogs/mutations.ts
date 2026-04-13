import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

type DialogMutationContext = {
  dialogId: string;
};

function invalidateDialogQueries(queryClient: ReturnType<typeof useQueryClient>, dialogId: string) {
  queryClient.invalidateQueries([QueryKeys.dialogs]);
  queryClient.invalidateQueries([QueryKeys.dialogWorkspace, dialogId]);
  queryClient.invalidateQueries([QueryKeys.dialogTutor, dialogId]);
  queryClient.invalidateQueries([QueryKeys.learner]);
}

export const useCreateDialogMutation = (): UseMutationResult<
  t.TDialogWorkspace,
  unknown,
  t.TStudyDialogCreateRequest,
  DialogMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.createDialog], {
    mutationFn: (payload) => dataService.createDialog(payload),
    onMutate: () => ({ dialogId: '' }),
    onSuccess: (workspace) => {
      queryClient.invalidateQueries([QueryKeys.dialogs]);
      queryClient.setQueryData([QueryKeys.dialogWorkspace, workspace.dialog.dialogId], workspace);
    },
  });
};

export const useCreateStarterDialogMutation = (): UseMutationResult<
  t.TDialogWorkspace,
  unknown,
  t.TStudyDialogStarterRequest,
  DialogMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.createStarterDialog], {
    mutationFn: (payload) => dataService.createStarterDialog(payload),
    onMutate: () => ({ dialogId: '' }),
    onSuccess: (workspace) => {
      queryClient.invalidateQueries([QueryKeys.dialogs]);
      queryClient.setQueryData([QueryKeys.dialogWorkspace, workspace.dialog.dialogId], workspace);
    },
  });
};

export const useUpdateDialogMutation = (): UseMutationResult<
  t.TDialogWorkspace,
  unknown,
  t.TStudyDialogUpdateRequest,
  DialogMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.updateDialog], {
    mutationFn: (payload) => dataService.updateDialog(payload),
    onMutate: ({ dialogId }) => ({ dialogId }),
    onSuccess: (workspace, _payload, context) => {
      const dialogId = context?.dialogId ?? workspace.dialog.dialogId;
      queryClient.setQueryData([QueryKeys.dialogWorkspace, dialogId], workspace);
      invalidateDialogQueries(queryClient, dialogId);
    },
  });
};

export const useCreateDialogCellMutation = (): UseMutationResult<
  t.TDialogWorkspace,
  unknown,
  t.TDialogCellCreateRequest,
  DialogMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.createDialogCell], {
    mutationFn: (payload) => dataService.createDialogCell(payload),
    onMutate: ({ dialogId }) => ({ dialogId }),
    onSuccess: (workspace, _payload, context) => {
      const dialogId = context?.dialogId ?? workspace.dialog.dialogId;
      queryClient.setQueryData([QueryKeys.dialogWorkspace, dialogId], workspace);
      invalidateDialogQueries(queryClient, dialogId);
    },
  });
};

export const useUpdateDialogCellMutation = (): UseMutationResult<
  t.TDialogWorkspace,
  unknown,
  t.TDialogCellUpdateRequest,
  DialogMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.updateDialogCell], {
    mutationFn: (payload) => dataService.updateDialogCell(payload),
    onMutate: ({ dialogId }) => ({ dialogId }),
    onSuccess: (workspace, _payload, context) => {
      const dialogId = context?.dialogId ?? workspace.dialog.dialogId;
      queryClient.setQueryData([QueryKeys.dialogWorkspace, dialogId], workspace);
      invalidateDialogQueries(queryClient, dialogId);
    },
  });
};

export const useExecuteDialogCellMutation = (): UseMutationResult<
  t.TDialogWorkspace,
  unknown,
  t.TDialogCellExecuteRequest,
  DialogMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.executeDialogCell], {
    mutationFn: (payload) => dataService.executeDialogCell(payload),
    onMutate: ({ dialogId }) => ({ dialogId }),
    onSuccess: (workspace, _payload, context) => {
      const dialogId = context?.dialogId ?? workspace.dialog.dialogId;
      queryClient.setQueryData([QueryKeys.dialogWorkspace, dialogId], workspace);
      invalidateDialogQueries(queryClient, dialogId);
    },
  });
};

export const useSelectDialogTrajectoryMutation = (): UseMutationResult<
  t.TDialogWorkspace,
  unknown,
  t.TDialogTrajectorySelectRequest,
  DialogMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.selectDialogTrajectory], {
    mutationFn: (payload) => dataService.selectDialogTrajectory(payload),
    onMutate: ({ dialogId }) => ({ dialogId }),
    onSuccess: (workspace, _payload, context) => {
      const dialogId = context?.dialogId ?? workspace.dialog.dialogId;
      queryClient.setQueryData([QueryKeys.dialogWorkspace, dialogId], workspace);
      invalidateDialogQueries(queryClient, dialogId);
    },
  });
};

export const useRunDialogTutorActionMutation = (): UseMutationResult<
  t.TDialogTutorActionResponse,
  unknown,
  t.TDialogTutorActionRequest,
  DialogMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.runDialogTutorAction], {
    mutationFn: (payload) => dataService.runDialogTutorAction(payload),
    onMutate: ({ dialogId }) => ({ dialogId }),
    onSuccess: (response, _payload, context) => {
      const dialogId = context?.dialogId ?? response.workspace.dialog.dialogId;
      queryClient.setQueryData([QueryKeys.dialogWorkspace, dialogId], response.workspace);
      queryClient.setQueryData([QueryKeys.dialogTutor, dialogId], response.tutor);
      invalidateDialogQueries(queryClient, dialogId);
    },
  });
};

export const useCreateDialogClarificationMutation = (): UseMutationResult<
  t.TDialogClarification,
  unknown,
  t.TDialogClarificationCreateRequest,
  DialogMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.createDialogClarification], {
    mutationFn: (payload) => dataService.createDialogClarification(payload),
    onMutate: ({ dialogId }) => ({ dialogId }),
    onSuccess: (_clarification, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateDialogQueries(queryClient, context.dialogId);
    },
  });
};

export const useIntegrateDialogClarificationMutation = (): UseMutationResult<
  t.TDialogClarification,
  unknown,
  t.TDialogClarificationIntegrateRequest & DialogMutationContext,
  DialogMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.integrateDialogClarification], {
    mutationFn: ({ dialogId: _dialogId, ...payload }) =>
      dataService.integrateDialogClarification(payload),
    onMutate: ({ dialogId }) => ({ dialogId }),
    onSuccess: (_clarification, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateDialogQueries(queryClient, context.dialogId);
    },
  });
};

export const useCreateDialogVisualizationMutation = (): UseMutationResult<
  t.TDialogVisualization,
  unknown,
  t.TDialogVisualizationCreateRequest,
  DialogMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.createDialogVisualization], {
    mutationFn: (payload) => dataService.createDialogVisualization(payload),
    onMutate: ({ dialogId }) => ({ dialogId }),
    onSuccess: (_visualization, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateDialogQueries(queryClient, context.dialogId);
    },
  });
};

export const useIntegrateDialogVisualizationMutation = (): UseMutationResult<
  t.TDialogVisualization,
  unknown,
  t.TDialogVisualizationIntegrateRequest & DialogMutationContext,
  DialogMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.integrateDialogVisualization], {
    mutationFn: ({ dialogId: _dialogId, ...payload }) =>
      dataService.integrateDialogVisualization(payload),
    onMutate: ({ dialogId }) => ({ dialogId }),
    onSuccess: (_visualization, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateDialogQueries(queryClient, context.dialogId);
    },
  });
};

export const useDeleteDialogVisualizationMutation = (): UseMutationResult<
  t.TDialogVisualization,
  unknown,
  { dialogId: string; visualizationId: string },
  DialogMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.deleteDialogVisualization], {
    mutationFn: ({ visualizationId }) => dataService.deleteDialogVisualization(visualizationId),
    onMutate: ({ dialogId }) => ({ dialogId }),
    onSuccess: (_visualization, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateDialogQueries(queryClient, context.dialogId);
    },
  });
};
