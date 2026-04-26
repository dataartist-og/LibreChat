import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import type {
  TDocumentSpeechAudioArtifact,
  TDocumentSpeechHighlightMode,
  TDocumentSpeechManifest,
  TDocumentSpeechProfileInput,
  TDocumentSpeechSegment,
  TDocumentWorkspace,
} from 'librechat-data-provider';
import { Highlighter, PauseCircle, PlayCircle, ScrollText } from 'lucide-react';
import { useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';
import {
  useCreateDocumentSpeechAudioDownloadMutation,
  useCreateDocumentSpeechAudioMutation,
  useCreateDocumentSpeechManifestMutation,
} from '~/data-provider/Documents';
import store from '~/store';

const DEFAULT_AUDIO_FORMAT = 'audio/mpeg';
const PREFETCH_SEGMENT_COUNT = 3;

export type DocumentSpeechActiveState = {
  blockId: string;
  excerpt: string;
  segmentKind: TDocumentSpeechSegment['segmentKind'];
};

type DocumentSpeechProps = {
  workspace: TDocumentWorkspace;
  onActiveSpeechChange: (activeSpeech: DocumentSpeechActiveState | null) => void;
};

function buildProfileKey(profile: TDocumentSpeechProfileInput): string {
  return JSON.stringify({
    provider: profile.provider ?? null,
    model: profile.model ?? null,
    voice: profile.voice ?? null,
    language: profile.language ?? null,
    format: profile.format ?? DEFAULT_AUDIO_FORMAT,
    rate: profile.rate ?? null,
  });
}

function isPlayableSegment(segment: TDocumentSpeechSegment): boolean {
  return segment.playbackDirective !== 'pause_for_visual';
}

function getViewerRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-document-viewer="true"]');
}

function getVisibleStartBlockId(): string | null {
  const viewer = getViewerRoot();
  const blocks = Array.from(
    viewer?.querySelectorAll<HTMLElement>('[data-document-block-id]') ?? [],
  );
  if (blocks.length === 0) {
    return null;
  }

  const viewerRect = viewer?.getBoundingClientRect();
  if (!viewerRect) {
    return blocks[0].dataset.documentBlockId ?? null;
  }

  const visibleBlocks = blocks.filter((block) => {
    const rect = block.getBoundingClientRect();
    return rect.bottom >= viewerRect.top + 24 && rect.top <= viewerRect.bottom - 24;
  });

  const candidateBlocks = visibleBlocks.length > 0 ? visibleBlocks : blocks;
  const closestBlock = candidateBlocks.reduce((closest, current) => {
    const currentDistance = Math.abs(current.getBoundingClientRect().top - viewerRect.top);
    const closestDistance = Math.abs(closest.getBoundingClientRect().top - viewerRect.top);
    return currentDistance < closestDistance ? current : closest;
  }, candidateBlocks[0]);

  return closestBlock.dataset.documentBlockId ?? null;
}

function scrollToBlock(blockId: string | null | undefined, behavior: ScrollBehavior): void {
  if (!blockId) {
    return;
  }

  const element = document.getElementById(`document-block-${blockId}`);
  if (!element) {
    return;
  }

  element.scrollIntoView({ behavior, block: 'center' });
  if (element instanceof HTMLElement) {
    element.focus({ preventScroll: true });
  }
}

function cycleHighlightMode(mode: TDocumentSpeechHighlightMode): TDocumentSpeechHighlightMode {
  if (mode === 'off') {
    return 'block';
  }

  if (mode === 'block') {
    return 'excerpt';
  }

  return 'off';
}

function updateManifestAudio(
  manifest: TDocumentSpeechManifest | null,
  segmentId: string,
  audio: TDocumentSpeechAudioArtifact,
): TDocumentSpeechManifest | null {
  if (!manifest) {
    return manifest;
  }

  return {
    ...manifest,
    segments: manifest.segments.map((segment) =>
      segment.segmentId === segmentId ? { ...segment, audio } : segment,
    ),
  };
}

function getActiveSpeech(segment: TDocumentSpeechSegment | null): DocumentSpeechActiveState | null {
  if (!segment) {
    return null;
  }

  return {
    blockId: segment.focusBlockId ?? segment.blockId,
    excerpt: segment.sourceText || segment.spokenText,
    segmentKind: segment.segmentKind,
  };
}

export default function DocumentSpeech({
  workspace,
  onActiveSpeechChange,
}: DocumentSpeechProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [autoscroll, setAutoscroll] = useRecoilState(store.documentSpeechAutoscroll);
  const [highlightMode, setHighlightMode] = useRecoilState(store.documentSpeechHighlightMode);
  const textToSpeech = useRecoilValue(store.textToSpeech);
  const voice = useRecoilValue(store.voice);
  const languageTTS = useRecoilValue(store.languageTTS);
  const playbackRate = useRecoilValue(store.playbackRate);
  const createManifestMutation = useCreateDocumentSpeechManifestMutation();
  const createAudioMutation = useCreateDocumentSpeechAudioMutation();
  const createAudioDownloadMutation = useCreateDocumentSpeechAudioDownloadMutation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const pendingAudioRef = useRef(new Map<string, Promise<TDocumentSpeechAudioArtifact>>());
  const playbackUrlRef = useRef(new Map<string, Promise<string>>());
  const objectUrlRef = useRef(new Set<string>());
  const sessionRef = useRef(0);
  const [manifest, setManifest] = useState<TDocumentSpeechManifest | null>(null);
  const [manifestProfileKey, setManifestProfileKey] = useState('');
  const [currentSegmentId, setCurrentSegmentId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isPausedForVisual, setIsPausedForVisual] = useState(false);

  const profile = useMemo<TDocumentSpeechProfileInput>(
    () => ({
      voice,
      language: languageTTS || null,
      format: DEFAULT_AUDIO_FORMAT,
      rate: playbackRate != null && playbackRate > 0 ? playbackRate : null,
    }),
    [languageTTS, playbackRate, voice],
  );
  const profileKey = useMemo(() => buildProfileKey(profile), [profile]);
  const currentIndex = useMemo(
    () => manifest?.segments.findIndex((segment) => segment.segmentId === currentSegmentId) ?? -1,
    [currentSegmentId, manifest],
  );
  const currentSegment =
    manifest && currentIndex >= 0 && currentIndex < manifest.segments.length
      ? manifest.segments[currentIndex]
      : null;
  const activeSpeech = useMemo(() => getActiveSpeech(currentSegment), [currentSegment]);

  useEffect(() => {
    onActiveSpeechChange(activeSpeech);
  }, [activeSpeech, onActiveSpeechChange]);

  useEffect(() => {
    sessionRef.current += 1;
    pendingAudioRef.current.clear();
    playbackUrlRef.current.clear();
    objectUrlRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlRef.current.clear();
    setManifest(null);
    setManifestProfileKey('');
    setCurrentSegmentId(null);
    setIsPlaying(false);
    setIsPreparing(false);
    setIsPausedForVisual(false);
    onActiveSpeechChange(null);

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }, [onActiveSpeechChange, workspace.document.documentId, workspace.renderVersion.renderVersionId]);

  useEffect(() => {
    return () => {
      playbackUrlRef.current.clear();
      objectUrlRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.playbackRate = playbackRate != null && playbackRate > 0 ? playbackRate : 1;
  }, [playbackRate]);

  const updateSegmentAudio = useCallback((segmentId: string, audio: TDocumentSpeechAudioArtifact) => {
    setManifest((current) => updateManifestAudio(current, segmentId, audio));
  }, []);

  const ensureSegmentAudio = useCallback(
    async (
      segment: TDocumentSpeechSegment,
      session: number,
    ): Promise<TDocumentSpeechAudioArtifact | null> => {
      if (segment.playbackDirective === 'pause_for_visual') {
        return segment.audio ?? null;
      }

      if (segment.audio?.status === 'ready' && segment.audio.audioUrl) {
        return segment.audio;
      }

      const requestKey = `${segment.segmentId}:${profileKey}`;
      const pendingRequest = pendingAudioRef.current.get(requestKey);
      if (pendingRequest) {
        return pendingRequest;
      }

      const request = createAudioMutation
        .mutateAsync({
          documentId: workspace.document.documentId,
          segmentId: segment.segmentId,
          profile,
        })
        .then((audio) => {
          if (session === sessionRef.current) {
            updateSegmentAudio(segment.segmentId, audio);
          }
          return audio;
        })
        .finally(() => {
          pendingAudioRef.current.delete(requestKey);
        });

      pendingAudioRef.current.set(requestKey, request);
      return request;
    },
    [
      createAudioMutation,
      profile,
      profileKey,
      updateSegmentAudio,
      workspace.document.documentId,
    ],
  );

  const ensurePlaybackUrl = useCallback(
    async (
      audio: TDocumentSpeechAudioArtifact,
      session: number,
    ): Promise<string | null> => {
      if (audio.status !== 'ready' || !audio.audioUrl) {
        return null;
      }

      const requestKey = `${audio.audioArtifactId}:${profileKey}`;
      const pendingRequest = playbackUrlRef.current.get(requestKey);
      if (pendingRequest) {
        return pendingRequest;
      }

      const request = createAudioDownloadMutation
        .mutateAsync({
          documentId: workspace.document.documentId,
          audioArtifactId: audio.audioArtifactId,
        })
        .then((blob) => {
          if (session !== sessionRef.current) {
            throw new Error(localize('com_ui_document_tts_audio_unavailable'));
          }

          const objectUrl = URL.createObjectURL(blob);
          objectUrlRef.current.add(objectUrl);
          return objectUrl;
        })
        .catch((error) => {
          playbackUrlRef.current.delete(requestKey);
          throw error;
        });

      playbackUrlRef.current.set(requestKey, request);
      return request;
    },
    [
      createAudioDownloadMutation,
      localize,
      profileKey,
      workspace.document.documentId,
    ],
  );

  const prefetchSegments = useCallback(
    (nextManifest: TDocumentSpeechManifest, startIndex: number) => {
      const upcomingSegments = nextManifest.segments
        .slice(startIndex + 1)
        .filter(isPlayableSegment)
        .slice(0, PREFETCH_SEGMENT_COUNT);

      upcomingSegments.forEach((segment) => {
        void ensureSegmentAudio(segment, sessionRef.current);
      });
    },
    [ensureSegmentAudio],
  );

  const playSegment = useCallback(
    async (nextManifest: TDocumentSpeechManifest, index: number, session: number) => {
      const segment = nextManifest.segments[index];
      if (!segment) {
        setCurrentSegmentId(null);
        setIsPlaying(false);
        setIsPausedForVisual(false);
        onActiveSpeechChange(null);
        return;
      }

      setCurrentSegmentId(segment.segmentId);
      if (autoscroll) {
        scrollToBlock(segment.focusBlockId ?? segment.blockId, 'smooth');
      }

      if (segment.playbackDirective === 'pause_for_visual') {
        scrollToBlock(segment.focusBlockId ?? segment.blockId, 'smooth');
        setIsPlaying(false);
        setIsPausedForVisual(true);
        audioRef.current?.pause();
        return;
      }

      setIsPausedForVisual(false);

      try {
        const audio = await ensureSegmentAudio(segment, session);
        if (session !== sessionRef.current) {
          return;
        }

        if (!audio || audio.status !== 'ready' || !audio.audioUrl) {
          throw new Error(localize('com_ui_document_tts_audio_unavailable'));
        }

        const playbackUrl = await ensurePlaybackUrl(audio, session);
        if (session !== sessionRef.current) {
          return;
        }

        if (!playbackUrl) {
          throw new Error(localize('com_ui_document_tts_audio_unavailable'));
        }

        const element = audioRef.current;
        if (!element) {
          return;
        }

        if (element.src !== playbackUrl) {
          element.src = playbackUrl;
        }

        element.currentTime = 0;
        element.playbackRate = playbackRate != null && playbackRate > 0 ? playbackRate : 1;
        await element.play();
        setIsPlaying(true);
        prefetchSegments(nextManifest, index);
      } catch (error) {
        setIsPlaying(false);
        const message =
          error instanceof Error ? error.message : localize('com_ui_document_tts_failed');
        showToast({ message, status: 'error' });
      }
    },
    [
      autoscroll,
      ensureSegmentAudio,
      ensurePlaybackUrl,
      localize,
      onActiveSpeechChange,
      playbackRate,
      prefetchSegments,
      showToast,
    ],
  );

  const loadManifest = useCallback(async (): Promise<TDocumentSpeechManifest> => {
    const nextManifest = await createManifestMutation.mutateAsync({
      documentId: workspace.document.documentId,
      renderVersionId: workspace.renderVersion.renderVersionId,
      startBlockId: getVisibleStartBlockId(),
      profile,
    });
    setManifest(nextManifest);
    setManifestProfileKey(profileKey);
    return nextManifest;
  }, [
    createManifestMutation,
    profile,
    profileKey,
    workspace.document.documentId,
    workspace.renderVersion.renderVersionId,
  ]);

  const beginPlayback = useCallback(async () => {
    if (!textToSpeech) {
      showToast({
        message: localize('com_ui_document_tts_disabled'),
        status: 'warning',
      });
      return;
    }

    const session = sessionRef.current + 1;
    sessionRef.current = session;
    setIsPreparing(true);

    try {
      const needsFreshManifest =
        manifest == null ||
        manifest.renderVersionId !== workspace.renderVersion.renderVersionId ||
        manifestProfileKey !== profileKey;
      const nextManifest = needsFreshManifest ? await loadManifest() : manifest;

      if (!nextManifest || session !== sessionRef.current) {
        return;
      }

      const startSegmentId =
        nextManifest.startSegmentId ??
        nextManifest.segments.find((segment) => isPlayableSegment(segment))?.segmentId ??
        null;

      if (!startSegmentId) {
        throw new Error(localize('com_ui_document_tts_audio_unavailable'));
      }

      const startIndex = nextManifest.segments.findIndex(
        (segment) => segment.segmentId === startSegmentId,
      );
      await playSegment(nextManifest, startIndex, session);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : localize('com_ui_document_tts_failed');
      showToast({ message, status: 'error' });
    } finally {
      if (session === sessionRef.current) {
        setIsPreparing(false);
      }
    }
  }, [
    loadManifest,
    localize,
    manifest,
    manifestProfileKey,
    playSegment,
    profileKey,
    showToast,
    textToSpeech,
    workspace.renderVersion.renderVersionId,
  ]);

  const handlePrimaryAction = useCallback(() => {
    const audio = audioRef.current;

    if (isPreparing) {
      return;
    }

    if (isPlaying) {
      audio?.pause();
      setIsPlaying(false);
      return;
    }

    if (isPausedForVisual && manifest && currentIndex >= 0) {
      const session = sessionRef.current + 1;
      sessionRef.current = session;
      void playSegment(manifest, currentIndex + 1, session);
      return;
    }

    if (
      audio &&
      currentSegment &&
      currentSegment.playbackDirective !== 'pause_for_visual' &&
      audio.src &&
      audio.paused
    ) {
      void audio.play();
      return;
    }

    void beginPlayback();
  }, [
    beginPlayback,
    currentIndex,
    currentSegment,
    isPausedForVisual,
    isPlaying,
    isPreparing,
    manifest,
    playSegment,
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handleEnded = () => {
      if (!manifest) {
        setCurrentSegmentId(null);
        setIsPlaying(false);
        return;
      }

      const nextIndex = currentIndex + 1;
      if (nextIndex >= manifest.segments.length) {
        setCurrentSegmentId(null);
        setIsPlaying(false);
        setIsPausedForVisual(false);
        return;
      }

      const session = sessionRef.current + 1;
      sessionRef.current = session;
      void playSegment(manifest, nextIndex, session);
    };

    const handlePause = () => {
      if (!audio.ended && !isPausedForVisual) {
        setIsPlaying(false);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
    };
  }, [currentIndex, isPausedForVisual, manifest, playSegment]);

  const progressLabel =
    manifest && currentIndex >= 0 ? `${currentIndex + 1} / ${manifest.segments.length}` : null;
  const highlightLabel =
    highlightMode === 'off'
      ? localize('com_ui_document_tts_highlight_off')
      : highlightMode === 'block'
        ? localize('com_ui_document_tts_highlight_block')
        : localize('com_ui_document_tts_highlight_excerpt');
  const primaryLabel = isPausedForVisual
    ? localize('com_ui_document_tts_resume')
    : isPlaying
      ? localize('com_ui_document_tts_pause')
      : localize('com_ui_document_tts_play');
  const currentSnippet =
    currentSegment?.playbackDirective === 'pause_for_visual'
      ? localize('com_ui_document_tts_visual_pause')
      : currentSegment?.spokenText ?? null;

  return (
    <div className="mt-4 rounded-2xl border border-border-light bg-surface-secondary/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-2 rounded-xl bg-text-primary px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:text-black"
          onClick={handlePrimaryAction}
          disabled={isPreparing}
        >
          {isPlaying ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
          {isPreparing ? localize('com_ui_document_tts_preparing') : primaryLabel}
        </button>

        <button
          type="button"
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
            autoscroll
              ? 'border-border-heavy text-text-primary'
              : 'border-border-light text-text-secondary'
          }`}
          onClick={() => setAutoscroll(!autoscroll)}
        >
          <ScrollText className="h-4 w-4" />
          {localize('com_ui_document_tts_autoscroll')}
        </button>

        <button
          type="button"
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
            highlightMode !== 'off'
              ? 'border-border-heavy text-text-primary'
              : 'border-border-light text-text-secondary'
          }`}
          onClick={() => setHighlightMode(cycleHighlightMode(highlightMode))}
        >
          <Highlighter className="h-4 w-4" />
          {highlightLabel}
        </button>

        {progressLabel ? (
          <div className="ml-auto text-xs font-medium uppercase tracking-[0.14em] text-text-secondary">
            {progressLabel}
          </div>
        ) : null}
      </div>

      {currentSnippet ? (
        <div className="mt-3 rounded-xl border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-secondary">
          {currentSnippet}
        </div>
      ) : null}

      <audio ref={audioRef} preload="none" className="hidden" />
    </div>
  );
}
