import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

type VisualizationMutationContext = {
  conversationId: string;
  parentMessageId: string;
};

function invalidateVisualizationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  parentMessageId: string,
) {
  queryClient.invalidateQueries([QueryKeys.visualizations, conversationId]);
  queryClient.invalidateQueries([QueryKeys.messages, conversationId]);
  queryClient.invalidateQueries([QueryKeys.messageRevisions, parentMessageId]);
  queryClient.invalidateQueries([QueryKeys.learner]);
}

export const useCreateVisualizationMutation = (): UseMutationResult<
  t.TVisualization,
  unknown,
  t.TVisualizationCreateRequest,
  VisualizationMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.createVisualization], {
    mutationFn: (payload: t.TVisualizationCreateRequest) =>
      dataService.createVisualization(payload),
    onMutate: (payload) => ({
      conversationId: payload.conversationId,
      parentMessageId: payload.parentMessageId,
    }),
    onSuccess: (_visualization, _payload, context) => {
      if (!context) {
        return;
      }

      invalidateVisualizationQueries(queryClient, context.conversationId, context.parentMessageId);
    },
  });
};

export const useUpdateVisualizationMutation = (): UseMutationResult<
  t.TVisualization,
  unknown,
  t.TVisualizationUpdateRequest & VisualizationMutationContext,
  VisualizationMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.updateVisualization], {
    mutationFn: ({
      conversationId: _conversationId,
      parentMessageId: _parentMessageId,
      ...payload
    }) => dataService.updateVisualization(payload),
    onMutate: ({ conversationId, parentMessageId }) => ({
      conversationId,
      parentMessageId,
    }),
    onSuccess: (_visualization, _payload, context) => {
      if (!context) {
        return;
      }

      invalidateVisualizationQueries(queryClient, context.conversationId, context.parentMessageId);
    },
  });
};

export const useRegenerateVisualizationMutation = (): UseMutationResult<
  t.TVisualization,
  unknown,
  t.TVisualizationRegenerateRequest & VisualizationMutationContext,
  VisualizationMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.regenerateVisualization], {
    mutationFn: ({
      conversationId: _conversationId,
      parentMessageId: _parentMessageId,
      ...payload
    }) => dataService.regenerateVisualization(payload),
    onMutate: ({ conversationId, parentMessageId }) => ({
      conversationId,
      parentMessageId,
    }),
    onSuccess: (_visualization, _payload, context) => {
      if (!context) {
        return;
      }

      invalidateVisualizationQueries(queryClient, context.conversationId, context.parentMessageId);
    },
  });
};

export const useRefineVisualizationMutation = (): UseMutationResult<
  t.TVisualization,
  unknown,
  t.TVisualizationRefineRequest & VisualizationMutationContext,
  VisualizationMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.refineVisualization], {
    mutationFn: ({
      conversationId: _conversationId,
      parentMessageId: _parentMessageId,
      ...payload
    }) => dataService.refineVisualization(payload),
    onMutate: ({ conversationId, parentMessageId }) => ({
      conversationId,
      parentMessageId,
    }),
    onSuccess: (_visualization, _payload, context) => {
      if (!context) {
        return;
      }

      invalidateVisualizationQueries(queryClient, context.conversationId, context.parentMessageId);
    },
  });
};

export const useIntegrateVisualizationMutation = (): UseMutationResult<
  t.TVisualization,
  unknown,
  t.TVisualizationIntegrateRequest & VisualizationMutationContext,
  VisualizationMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.integrateVisualization], {
    mutationFn: ({
      conversationId: _conversationId,
      parentMessageId: _parentMessageId,
      ...payload
    }) => dataService.integrateVisualization(payload),
    onMutate: ({ conversationId, parentMessageId }) => ({
      conversationId,
      parentMessageId,
    }),
    onSuccess: (_visualization, _payload, context) => {
      if (!context) {
        return;
      }

      invalidateVisualizationQueries(queryClient, context.conversationId, context.parentMessageId);
    },
  });
};

export const useDuplicateVisualizationMutation = (): UseMutationResult<
  t.TVisualization,
  unknown,
  t.TVisualizationDuplicateRequest & VisualizationMutationContext,
  VisualizationMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.duplicateVisualization], {
    mutationFn: ({
      conversationId: _conversationId,
      parentMessageId: _parentMessageId,
      ...payload
    }) => dataService.duplicateVisualization(payload),
    onMutate: ({ conversationId, parentMessageId }) => ({
      conversationId,
      parentMessageId,
    }),
    onSuccess: (_visualization, _payload, context) => {
      if (!context) {
        return;
      }

      invalidateVisualizationQueries(queryClient, context.conversationId, context.parentMessageId);
    },
  });
};

export const useDeleteVisualizationMutation = (): UseMutationResult<
  t.TVisualization,
  unknown,
  { visualizationId: string } & VisualizationMutationContext,
  VisualizationMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.deleteVisualization], {
    mutationFn: ({ visualizationId }) => dataService.deleteVisualization(visualizationId),
    onMutate: ({ conversationId, parentMessageId }) => ({
      conversationId,
      parentMessageId,
    }),
    onSuccess: (_visualization, _payload, context) => {
      if (!context) {
        return;
      }

      invalidateVisualizationQueries(queryClient, context.conversationId, context.parentMessageId);
    },
  });
};
