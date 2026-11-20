import { useQuery, useMutation } from '@tanstack/react-query';
import { dataService, QueryKeys, MutationKeys } from 'librechat-data-provider';
import type {
  Lecture,
  LectureSource,
  LectureVoiceRequest,
  LectureNotesRequest,
  LectureYouTubeRequest,
  LectureAskRequest,
  LectureIndexRequest,
} from 'librechat-data-provider';

export const useLectureSourceQuery = (source?: LectureSource) =>
  useQuery({
    queryKey: [QueryKeys.lectureSource, source?.url],
    queryFn: () => dataService.getLectureSource(source!),
    enabled: !!source,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
export const useLectureYouTubeMutation = () =>
  useMutation({
    mutationKey: [MutationKeys.lectureYouTube],
    mutationFn: (payload: LectureYouTubeRequest) => dataService.getLectureYouTube(payload),
  });

export const useLectureAskMutation = () =>
  useMutation({
    mutationKey: [MutationKeys.lectureAsk],
    mutationFn: ({ signal, ...payload }: LectureAskRequest & { signal?: AbortSignal }) =>
      dataService.askLecture(payload, signal),
  });

export const useLectureIndexMutation = () =>
  useMutation({
    mutationKey: [MutationKeys.lectureIndex],
    mutationFn: (payload: LectureIndexRequest) => dataService.indexLecture(payload),
  });

export const useLectureImportMutation = () =>
  useMutation({
    mutationKey: [MutationKeys.lectureImport],
    mutationFn: (payload: Lecture) => dataService.importLecture(payload),
  });

export const useLectureVoiceStatusQuery = () =>
  useQuery({
    queryKey: [QueryKeys.lectureVoice],
    queryFn: dataService.getLectureVoiceStatus,
    staleTime: 60000,
    retry: false,
    refetchOnWindowFocus: false,
  });
export const useLectureVoiceStartMutation = () =>
  useMutation({
    mutationKey: [MutationKeys.lectureVoiceStart],
    mutationFn: ({ signal, ...payload }: LectureVoiceRequest & { signal?: AbortSignal }) =>
      dataService.startLectureVoice(payload, signal),
  });
export const useLectureVoiceStopMutation = () =>
  useMutation({
    mutationKey: [MutationKeys.lectureVoiceStop],
    mutationFn: dataService.stopLectureVoice,
  });
export const useLectureNotesMutation = () =>
  useMutation({
    mutationKey: [MutationKeys.lectureNotes],
    mutationFn: ({ signal, ...payload }: LectureNotesRequest & { signal?: AbortSignal }) =>
      dataService.extractLectureNotes(payload, signal),
  });
