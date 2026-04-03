import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useProjectsQuery = <TData = t.TProject[]>(
  config?: UseQueryOptions<t.TProject[], unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TProject[], unknown, TData>(
    [QueryKeys.projects],
    () => dataService.listProjects(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 30 * 1000,
      ...config,
    },
  );

export const useProjectQuery = <TData = t.TProject>(
  projectId: string | null | undefined,
  config?: UseQueryOptions<t.TProject, unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TProject, unknown, TData>(
    [QueryKeys.project, projectId],
    () => dataService.getProjectById(projectId ?? ''),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      enabled: !!projectId && (config?.enabled ?? true),
      ...config,
    },
  );

export const useProjectSourcesQuery = <TData = t.TProjectSource[]>(
  projectId: string | null | undefined,
  config?: UseQueryOptions<t.TProjectSource[], unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TProjectSource[], unknown, TData>(
    [QueryKeys.projectSources, projectId],
    () => dataService.listProjectSources(projectId ?? ''),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      enabled: !!projectId && (config?.enabled ?? true),
      staleTime: 15 * 1000,
      ...config,
    },
  );
