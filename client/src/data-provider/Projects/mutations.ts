import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useCreateProjectMutation = (): UseMutationResult<
  t.TProject,
  unknown,
  t.TProjectCreateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.createProject], {
    mutationFn: (payload: t.TProjectCreateRequest) => dataService.createProject(payload),
    onSuccess: (project) => {
      queryClient.invalidateQueries([QueryKeys.projects]);
      queryClient.setQueryData([QueryKeys.project, project.projectId], project);
    },
  });
};

export const useUpdateProjectMutation = (): UseMutationResult<
  t.TProject,
  unknown,
  t.TProjectUpdateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.updateProject], {
    mutationFn: (payload: t.TProjectUpdateRequest) => dataService.updateProject(payload),
    onSuccess: (project) => {
      queryClient.invalidateQueries([QueryKeys.projects]);
      queryClient.setQueryData([QueryKeys.project, project.projectId], project);
    },
  });
};

export const useArchiveProjectMutation = (): UseMutationResult<
  t.TProject,
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.archiveProject], {
    mutationFn: (projectId: string) => dataService.archiveProject(projectId),
    onSuccess: (_project, projectId) => {
      queryClient.invalidateQueries([QueryKeys.projects]);
      queryClient.invalidateQueries([QueryKeys.allConversations], { exact: false });
      queryClient.removeQueries([QueryKeys.project, projectId]);
      queryClient.removeQueries([QueryKeys.projectSources, projectId]);
    },
  });
};

export const useCreateProjectSourceMutation = (): UseMutationResult<
  t.TProjectSource,
  unknown,
  t.TProjectSourceCreateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.createProjectSource], {
    mutationFn: (payload: t.TProjectSourceCreateRequest) => dataService.createProjectSource(payload),
    onSuccess: (source) => {
      queryClient.invalidateQueries([QueryKeys.projectSources, source.projectId]);
    },
  });
};

export const useUpdateProjectSourceMutation = (): UseMutationResult<
  t.TProjectSource,
  unknown,
  t.TProjectSourceUpdateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.updateProjectSource], {
    mutationFn: (payload: t.TProjectSourceUpdateRequest) => dataService.updateProjectSource(payload),
    onSuccess: (source) => {
      queryClient.invalidateQueries([QueryKeys.projectSources, source.projectId]);
    },
  });
};

export const useDeleteProjectSourceMutation = (): UseMutationResult<
  t.TProjectSource,
  unknown,
  { projectId: string; sourceId: string },
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.deleteProjectSource], {
    mutationFn: ({ projectId, sourceId }: { projectId: string; sourceId: string }) =>
      dataService.deleteProjectSource(projectId, sourceId),
    onSuccess: (source) => {
      queryClient.invalidateQueries([QueryKeys.projectSources, source.projectId]);
    },
  });
};
