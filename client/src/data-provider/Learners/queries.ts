import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useLearnerWorkspaceQuery = <TData = t.TLearnerWorkspace>(
  config?: UseQueryOptions<t.TLearnerWorkspace, unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TLearnerWorkspace, unknown, TData>(
    [QueryKeys.learner],
    () => dataService.getLearnerWorkspace(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 10 * 1000,
      ...config,
    },
  );
