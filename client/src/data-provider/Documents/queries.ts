import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useStudyDocumentsQuery = <TData = t.TStudyDocument[]>(
  projectId?: string | null,
  config?: UseQueryOptions<t.TStudyDocument[], unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TStudyDocument[], unknown, TData>(
    [QueryKeys.documents, projectId ?? 'all'],
    () => dataService.listStudyDocuments({ projectId }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      enabled: config?.enabled ?? true,
      staleTime: 10 * 1000,
      ...config,
    },
  );

export const useExploreStudyDocumentsQuery = <TData = t.TStudyDocument[]>(
  projectId?: string | null,
  config?: UseQueryOptions<t.TStudyDocument[], unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TStudyDocument[], unknown, TData>(
    [QueryKeys.exploreDocuments, projectId ?? 'all'],
    () => dataService.listExploreStudyDocuments({ projectId }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      enabled: config?.enabled ?? true,
      staleTime: 10 * 1000,
      ...config,
    },
  );

export const useStudyDocumentWorkspaceQuery = <TData = t.TDocumentWorkspace>(
  documentId: string | null | undefined,
  accessMode: 'library' | 'explore' = 'library',
  config?: UseQueryOptions<t.TDocumentWorkspace, unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TDocumentWorkspace, unknown, TData>(
    [QueryKeys.documentWorkspace, accessMode, documentId],
    () =>
      accessMode === 'explore'
        ? dataService.getExploreStudyDocumentWorkspace(documentId ?? '')
        : dataService.getStudyDocumentWorkspace(documentId ?? ''),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      enabled: !!documentId && (config?.enabled ?? true),
      staleTime: 10 * 1000,
      ...config,
    },
  );
