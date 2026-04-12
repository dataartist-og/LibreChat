import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useConversationClarificationsQuery = <TData = t.TClarification[]>(
  conversationId: string | null | undefined,
  config?: UseQueryOptions<t.TClarification[], unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TClarification[], unknown, TData>(
    [QueryKeys.clarifications, conversationId],
    () => dataService.listClarifications({ conversationId: conversationId ?? '' }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      enabled: !!conversationId && (config?.enabled ?? true),
      staleTime: 10 * 1000,
      ...config,
    },
  );

export const useMessageRevisionsQuery = <TData = t.TMessageRevision[]>(
  messageId: string | null | undefined,
  config?: UseQueryOptions<t.TMessageRevision[], unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TMessageRevision[], unknown, TData>(
    [QueryKeys.messageRevisions, messageId],
    () => dataService.listMessageRevisions(messageId ?? ''),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      enabled: !!messageId && (config?.enabled ?? true),
      ...config,
    },
  );

export const useClarificationSuggestionsQuery = <TData = t.TClarificationSuggestionSet>(
  payload: t.TClarificationSuggestionRequest | null | undefined,
  config?: UseQueryOptions<t.TClarificationSuggestionSet, unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TClarificationSuggestionSet, unknown, TData>(
    [
      QueryKeys.clarificationSuggestions,
      payload?.conversationId,
      payload?.parentMessageId,
      payload?.anchorStart,
      payload?.anchorEnd,
      payload?.anchorText,
      payload?.existingClarifications
        ?.map((clarification) => `${clarification.question}:${clarification.answer}`)
        .join('|'),
    ],
    () =>
      dataService.suggestClarifications(
        payload ?? {
          conversationId: '',
          parentMessageId: '',
          anchorStart: 0,
          anchorEnd: 0,
          anchorText: '',
          anchorContextBefore: '',
          anchorContextAfter: '',
        },
      ),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      staleTime: 60 * 1000,
      enabled: !!payload?.conversationId && !!payload?.parentMessageId && (config?.enabled ?? true),
      ...config,
    },
  );
