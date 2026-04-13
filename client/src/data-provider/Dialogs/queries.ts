import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useDialogsQuery = <TData = t.TStudyDialog[]>(
  projectId?: string | null,
  config?: UseQueryOptions<t.TStudyDialog[], unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TStudyDialog[], unknown, TData>(
    [QueryKeys.dialogs, projectId ?? 'all'],
    () => dataService.listDialogs({ projectId }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      enabled: config?.enabled ?? true,
      staleTime: 10 * 1000,
      ...config,
    },
  );

export const useDialogWorkspaceQuery = <TData = t.TDialogWorkspace>(
  dialogId: string | null | undefined,
  config?: UseQueryOptions<t.TDialogWorkspace, unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TDialogWorkspace, unknown, TData>(
    [QueryKeys.dialogWorkspace, dialogId],
    () => dataService.getDialogWorkspace(dialogId ?? ''),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      enabled: !!dialogId && (config?.enabled ?? true),
      staleTime: 10 * 1000,
      ...config,
    },
  );

export const useDialogTutorQuery = <TData = t.TDialogTutorWorkspace>(
  dialogId: string | null | undefined,
  config?: UseQueryOptions<t.TDialogTutorWorkspace, unknown, TData>,
): QueryObserverResult<TData, unknown> =>
  useQuery<t.TDialogTutorWorkspace, unknown, TData>(
    [QueryKeys.dialogTutor, dialogId],
    () => dataService.getDialogTutorWorkspace(dialogId ?? ''),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      enabled: !!dialogId && (config?.enabled ?? true),
      staleTime: 10 * 1000,
      ...config,
    },
  );
