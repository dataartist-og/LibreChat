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
