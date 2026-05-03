import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

type DocumentMutationContext = {
  documentId: string;
};

function invalidateDocumentQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  documentId: string,
) {
  queryClient.invalidateQueries([QueryKeys.documents]);
  queryClient.invalidateQueries([QueryKeys.exploreDocuments]);
  queryClient.invalidateQueries([QueryKeys.documentWorkspace, 'library', documentId]);
  queryClient.invalidateQueries([QueryKeys.documentWorkspace, 'explore', documentId]);
  queryClient.invalidateQueries([QueryKeys.learner]);
}

export const useCreateStudyDocumentMutation = (): UseMutationResult<
  t.TDocumentWorkspace,
  unknown,
  t.TStudyDocumentCreateRequest,
  DocumentMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.createStudyDocument], {
    mutationFn: (payload) => dataService.createStudyDocument(payload),
    onMutate: async (payload) => ({
      documentId: payload.sourceFileId,
    }),
    onSuccess: (workspace) => {
      queryClient.invalidateQueries([QueryKeys.documents]);
      queryClient.setQueryData(
        [QueryKeys.documentWorkspace, 'library', workspace.document.documentId],
        workspace,
      );
    },
  });
};

export const useImportStudyDocumentMutation = (): UseMutationResult<
  t.TDocumentWorkspace,
  unknown,
  t.TStudyDocumentImportRequest,
  DocumentMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.importStudyDocument], {
    mutationFn: ({ documentId }) => dataService.importStudyDocument(documentId),
    onMutate: ({ documentId }) => ({ documentId }),
    onSuccess: (workspace, _payload, context) => {
      const documentId = context?.documentId ?? workspace.document.documentId;
      queryClient.setQueryData([QueryKeys.documentWorkspace, 'library', documentId], workspace);
      invalidateDocumentQueries(queryClient, documentId);
    },
  });
};

export const useReingestStudyDocumentMutation = (): UseMutationResult<
  t.TDocumentWorkspace,
  unknown,
  { documentId: string },
  DocumentMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.reingestStudyDocument], {
    mutationFn: ({ documentId }) => dataService.reingestStudyDocument(documentId),
    onMutate: ({ documentId }) => ({ documentId }),
    onSuccess: (workspace, _payload, context) => {
      const documentId = context?.documentId ?? workspace.document.documentId;
      queryClient.setQueryData([QueryKeys.documentWorkspace, 'library', documentId], workspace);
      invalidateDocumentQueries(queryClient, documentId);
    },
  });
};

export const useUpdateStudyDocumentSharingMutation = (): UseMutationResult<
  t.TStudyDocument,
  unknown,
  t.TStudyDocumentSharingRequest,
  DocumentMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.updateStudyDocumentSharing], {
    mutationFn: (payload) => dataService.updateStudyDocumentSharing(payload),
    onMutate: ({ documentId }) => ({ documentId }),
    onSuccess: (_document, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateDocumentQueries(queryClient, context.documentId);
    },
  });
};

export const useCreateDocumentClarificationMutation = (): UseMutationResult<
  t.TDocumentClarification,
  unknown,
  t.TDocumentClarificationCreateRequest,
  DocumentMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.createDocumentClarification], {
    mutationFn: (payload) => dataService.createDocumentClarification(payload),
    onMutate: ({ documentId }) => ({ documentId }),
    onSuccess: (_clarification, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateDocumentQueries(queryClient, context.documentId);
    },
  });
};

export const useIntegrateDocumentClarificationMutation = (): UseMutationResult<
  t.TDocumentClarification,
  unknown,
  t.TDocumentClarificationIntegrateRequest & DocumentMutationContext,
  DocumentMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.integrateDocumentClarification], {
    mutationFn: ({ documentId: _documentId, ...payload }) =>
      dataService.integrateDocumentClarification(payload),
    onMutate: ({ documentId }) => ({ documentId }),
    onSuccess: (_clarification, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateDocumentQueries(queryClient, context.documentId);
    },
  });
};

export const useArchiveDocumentClarificationMutation = (): UseMutationResult<
  t.TDocumentClarification,
  unknown,
  { clarificationId: string } & DocumentMutationContext,
  DocumentMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.archiveDocumentClarification], {
    mutationFn: ({ clarificationId }) => dataService.archiveDocumentClarification(clarificationId),
    onMutate: ({ documentId }) => ({ documentId }),
    onSuccess: (_clarification, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateDocumentQueries(queryClient, context.documentId);
    },
  });
};

export const useCreateDocumentVisualizationMutation = (): UseMutationResult<
  t.TDocumentVisualization,
  unknown,
  t.TDocumentVisualizationCreateRequest,
  DocumentMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.createDocumentVisualization], {
    mutationFn: (payload) => dataService.createDocumentVisualization(payload),
    onMutate: ({ documentId }) => ({ documentId }),
    onSuccess: (_visualization, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateDocumentQueries(queryClient, context.documentId);
    },
  });
};

export const useIntegrateDocumentVisualizationMutation = (): UseMutationResult<
  t.TDocumentVisualization,
  unknown,
  t.TDocumentVisualizationIntegrateRequest & DocumentMutationContext,
  DocumentMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.integrateDocumentVisualization], {
    mutationFn: ({ documentId: _documentId, ...payload }) =>
      dataService.integrateDocumentVisualization(payload),
    onMutate: ({ documentId }) => ({ documentId }),
    onSuccess: (_visualization, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateDocumentQueries(queryClient, context.documentId);
    },
  });
};

export const useDeleteDocumentVisualizationMutation = (): UseMutationResult<
  t.TDocumentVisualization,
  unknown,
  { visualizationId: string } & DocumentMutationContext,
  DocumentMutationContext
> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.deleteDocumentVisualization], {
    mutationFn: ({ visualizationId }) => dataService.deleteDocumentVisualization(visualizationId),
    onMutate: ({ documentId }) => ({ documentId }),
    onSuccess: (_visualization, _payload, context) => {
      if (!context) {
        return;
      }
      invalidateDocumentQueries(queryClient, context.documentId);
    },
  });
};

export const useCreateDocumentSpeechManifestMutation = (): UseMutationResult<
  t.TDocumentSpeechManifest,
  unknown,
  t.TDocumentSpeechManifestRequest,
  void
> =>
  useMutation([MutationKeys.createDocumentSpeechManifest], {
    mutationFn: (payload) => dataService.getDocumentSpeechManifest(payload),
  });

export const useCreateDocumentSpeechAudioMutation = (): UseMutationResult<
  t.TDocumentSpeechAudioArtifact,
  unknown,
  t.TDocumentSpeechAudioRequest,
  void
> =>
  useMutation([MutationKeys.createDocumentSpeechAudio], {
    mutationFn: (payload) => dataService.getDocumentSpeechAudioArtifact(payload),
  });

export const useCreateDocumentSpeechAudioDownloadMutation = (): UseMutationResult<
  Blob,
  unknown,
  { documentId: string; audioArtifactId: string },
  void
> =>
  useMutation([MutationKeys.createDocumentSpeechAudioDownload], {
    mutationFn: async ({ documentId, audioArtifactId }) => {
      const response = await dataService.getDocumentSpeechAudioDownload(documentId, audioArtifactId);
      return response.data;
    },
  });
