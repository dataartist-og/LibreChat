import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

type ClarificationMutationContext = {
  conversationId: string;
  parentMessageId: string;
};

function invalidateClarificationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  parentMessageId: string,
) {
  queryClient.invalidateQueries([QueryKeys.clarifications, conversationId]);
  queryClient.invalidateQueries([QueryKeys.messages, conversationId]);
  queryClient.invalidateQueries([QueryKeys.messageRevisions, parentMessageId]);
  queryClient.invalidateQueries([QueryKeys.learner]);
}

export const useCreateClarificationMutation = (): UseMutationResult<
  t.TClarification,
  unknown,
  t.TClarificationCreateRequest,
  ClarificationMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.createClarification], {
    mutationFn: (payload: t.TClarificationCreateRequest) =>
      dataService.createClarification(payload),
    onMutate: (payload) => ({
      conversationId: payload.conversationId,
      parentMessageId: payload.parentMessageId,
    }),
    onSuccess: (_clarification, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateClarificationQueries(queryClient, context.conversationId, context.parentMessageId);
    },
  });
};

export const useUpdateClarificationMutation = (): UseMutationResult<
  t.TClarification,
  unknown,
  (t.TClarificationUpdateRequest & { regenerate?: boolean }) & ClarificationMutationContext,
  ClarificationMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.updateClarification], {
    mutationFn: ({
      conversationId: _conversationId,
      parentMessageId: _parentMessageId,
      ...payload
    }) => dataService.updateClarification(payload),
    onMutate: ({ conversationId, parentMessageId }) => ({
      conversationId,
      parentMessageId,
    }),
    onSuccess: (_clarification, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateClarificationQueries(queryClient, context.conversationId, context.parentMessageId);
    },
  });
};

export const useIntegrateClarificationMutation = (): UseMutationResult<
  t.TClarification,
  unknown,
  t.TClarificationIntegrateRequest & ClarificationMutationContext,
  ClarificationMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.integrateClarification], {
    mutationFn: ({
      conversationId: _conversationId,
      parentMessageId: _parentMessageId,
      ...payload
    }) => dataService.integrateClarification(payload),
    onMutate: ({ conversationId, parentMessageId }) => ({
      conversationId,
      parentMessageId,
    }),
    onSuccess: (_clarification, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateClarificationQueries(queryClient, context.conversationId, context.parentMessageId);
    },
  });
};

export const useReanchorClarificationMutation = (): UseMutationResult<
  t.TClarification,
  unknown,
  t.TClarificationReanchorRequest & ClarificationMutationContext,
  ClarificationMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.reanchorClarification], {
    mutationFn: ({
      conversationId: _conversationId,
      parentMessageId: _parentMessageId,
      ...payload
    }) => dataService.reanchorClarification(payload),
    onMutate: ({ conversationId, parentMessageId }) => ({
      conversationId,
      parentMessageId,
    }),
    onSuccess: (_clarification, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateClarificationQueries(queryClient, context.conversationId, context.parentMessageId);
    },
  });
};
