import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useConversationVisualizationsQuery = <TData = t.TVisualization[]>(
  conversationId: string | null | undefined,
  config?: UseQueryOptions<t.TVisualization[], unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TVisualization[], unknown, TData>(
    [QueryKeys.visualizations, conversationId],
    () => dataService.listVisualizations({ conversationId: conversationId ?? '' }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      enabled: !!conversationId && (config?.enabled ?? true),
      staleTime: 10 * 1000,
      ...config,
    },
  );

export const useVisualizationQuery = <TData = t.TVisualization>(
  visualizationId: string | null | undefined,
  config?: UseQueryOptions<t.TVisualization, unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TVisualization, unknown, TData>(
    [QueryKeys.visualizations, visualizationId],
    () => dataService.getVisualization(visualizationId ?? ''),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      enabled: !!visualizationId && (config?.enabled ?? true),
      ...config,
    },
  );

export const useVisualizationSuggestionsQuery = <TData = t.TVisualizationSuggestionSet>(
  payload: t.TVisualizationSuggestionRequest | null | undefined,
  config?: UseQueryOptions<t.TVisualizationSuggestionSet, unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TVisualizationSuggestionSet, unknown, TData>(
    [
      QueryKeys.visualizationSuggestions,
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
      dataService.suggestVisualizations(
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
