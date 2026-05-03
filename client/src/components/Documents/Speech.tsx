import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import {
  FastForward,
  Gauge,
  Highlighter,
  Image,
  PauseCircle,
  PlayCircle,
  Rewind,
  ScrollText,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import type {
  TDocumentSpeechAudioArtifact,
  TDocumentSpeechHighlightMode,
  TDocumentSpeechManifest,
  TDocumentSpeechProfileInput,
  TDocumentSpeechSegment,
  TDocumentWorkspace,
} from 'librechat-data-provider';
import { Slider, useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';
import {
  useCreateDocumentSpeechAudioDownloadMutation,
  useCreateDocumentSpeechAudioMutation,
  useCreateDocumentSpeechManifestMutation,
} from '~/data-provider/Documents';
import store from '~/store';

const DEFAULT_AUDIO_FORMAT = 'audio/mpeg';
const PREFETCH_SEGMENT_COUNT = 3;
const SEEK_STEP_SECONDS = 10;

type ChapterStop = {
  blockId: string;
  title: string;
};

export type DocumentSpeechActiveState = {
  blockId: string;
  excerpt: string;
  segmentKind: TDocumentSpeechSegment['segmentKind'];
};

export type DocumentSpeechPlayerState = {
  currentBlockId: string | null;
  isPausedForVisual: boolean;
  isPlaying: boolean;
  isPreparing: boolean;
};

export type DocumentSpeechHandle = {
  pause: () => void;
  play: () => void;
  playFromBlock: (blockId: string | null) => void;
};

type DocumentSpeechProps = {
  workspace: TDocumentWorkspace;
  onActiveSpeechChange: (activeSpeech: DocumentSpeechActiveState | null) => void;
  onPlaybackStateChange?: (playbackState: DocumentSpeechPlayerState) => void;
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

function formatPlaybackTime(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const roundedSeconds = Math.floor(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function buildChapterStops(workspace: TDocumentWorkspace): ChapterStop[] {
  const outline = workspace.renderVersion.outlineJson.filter(
    (item) => typeof item.blockId === 'string' && item.blockId.length > 0,
  );
  if (outline.length === 0) {
    return [];
  }

  const minDepth = outline.reduce((currentMin, item) => Math.min(currentMin, item.depth), outline[0].depth);
  const topLevelStops = outline.filter((item) => item.depth === minDepth);
  const selectedStops = topLevelStops.length >= 2 ? topLevelStops : outline;
  const seenBlockIds = new Set<string>();

  return selectedStops.flatMap((item) => {
    if (seenBlockIds.has(item.blockId)) {
      return [];
    }

    seenBlockIds.add(item.blockId);
    return [
      {
        blockId: item.blockId,
        title: item.title,
      },
    ];
  });
}

function resolveChapterIndex(
  referenceBlockId: string | null,
  chapterStops: ChapterStop[],
  blockOrderLookup: Map<string, number>,
): number {
  if (!referenceBlockId || chapterStops.length === 0) {
    return -1;
  }

  const referenceOrder = blockOrderLookup.get(referenceBlockId);
  if (referenceOrder == null) {
    return -1;
  }

  let chapterIndex = 0;
  let hasMatch = false;

  chapterStops.forEach((chapter, index) => {
    const chapterOrder = blockOrderLookup.get(chapter.blockId);
    if (chapterOrder != null && chapterOrder <= referenceOrder) {
      chapterIndex = index;
      hasMatch = true;
    }
  });

  return hasMatch ? chapterIndex : -1;
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

function getStartSegmentIndex(
  manifest: TDocumentSpeechManifest,
  startBlockId?: string | null,
): number {
  if (startBlockId) {
    const matchingBlockIndex = manifest.segments.findIndex(
      (segment) =>
        isPlayableSegment(segment) &&
        (segment.blockId === startBlockId || segment.focusBlockId === startBlockId),
    );

    if (matchingBlockIndex >= 0) {
      return matchingBlockIndex;
    }
  }

  if (manifest.startSegmentId) {
    const configuredStartIndex = manifest.segments.findIndex(
      (segment) => segment.segmentId === manifest.startSegmentId,
    );

    if (configuredStartIndex >= 0) {
      return configuredStartIndex;
    }
  }

  return manifest.segments.findIndex((segment) => isPlayableSegment(segment));
}

function buildPlaybackQueue(
  manifest: TDocumentSpeechManifest,
  startIndex: number,
): string[] {
  if (startIndex < 0 || startIndex >= manifest.segments.length) {
    return [];
  }

  return manifest.segments.slice(startIndex).map((segment) => segment.segmentId);
}

const DocumentSpeech = forwardRef<DocumentSpeechHandle, DocumentSpeechProps>(function DocumentSpeech(
  { workspace, onActiveSpeechChange, onPlaybackStateChange },
  ref,
) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [autoscroll, setAutoscroll] = useRecoilState(store.documentSpeechAutoscroll);
  const [pauseOnFigures, setPauseOnFigures] = useRecoilState(store.documentSpeechPauseOnFigures);
  const [highlightMode, setHighlightMode] = useRecoilState(store.documentSpeechHighlightMode);
  const textToSpeech = useRecoilValue(store.textToSpeech);
  const voice = useRecoilValue(store.voice);
  const languageTTS = useRecoilValue(store.languageTTS);
  const [playbackRate, setPlaybackRate] = useRecoilState(store.playbackRate);
  const createManifestMutation = useCreateDocumentSpeechManifestMutation();
  const createAudioMutation = useCreateDocumentSpeechAudioMutation();
  const createAudioDownloadMutation = useCreateDocumentSpeechAudioDownloadMutation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const pendingAudioRef = useRef(new Map<string, Promise<TDocumentSpeechAudioArtifact>>());
  const playbackUrlRef = useRef(new Map<string, Promise<string>>());
  const objectUrlRef = useRef(new Set<string>());
  const sessionRef = useRef(0);
  const [manifest, setManifest] = useState<TDocumentSpeechManifest | null>(null);
  const [manifestRequestStateKey, setManifestRequestStateKey] = useState('');
  const [currentSegmentId, setCurrentSegmentId] = useState<string | null>(null);
  const [playbackQueueSegmentIds, setPlaybackQueueSegmentIds] = useState<string[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isPausedForVisual, setIsPausedForVisual] = useState(false);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [currentDurationSeconds, setCurrentDurationSeconds] = useState(0);

  const effectivePlaybackRate = playbackRate != null && playbackRate > 0 ? playbackRate : 1;

  const profile = useMemo<TDocumentSpeechProfileInput>(
    () => ({
      voice,
      language: languageTTS || null,
      format: DEFAULT_AUDIO_FORMAT,
      rate: null,
    }),
    [languageTTS, voice],
  );
  const profileKey = useMemo(() => buildProfileKey(profile), [profile]);
  const manifestRequestKey = useMemo(
    () => JSON.stringify({ pauseOnFigures, profileKey }),
    [pauseOnFigures, profileKey],
  );
  const currentIndex = useMemo(
    () => manifest?.segments.findIndex((segment) => segment.segmentId === currentSegmentId) ?? -1,
    [currentSegmentId, manifest],
  );
  const currentSegment =
    manifest && currentIndex >= 0 && currentIndex < manifest.segments.length
      ? manifest.segments[currentIndex]
      : null;
  const activeSpeech = useMemo(() => getActiveSpeech(currentSegment), [currentSegment]);
  const blockOrderLookup = useMemo(
    () =>
      new Map(
        workspace.renderVersion.documentIrJson.blocks.map((block, index) => [block.blockId, index] as const),
      ),
    [workspace.renderVersion.documentIrJson.blocks],
  );
  const chapterStops = useMemo(() => buildChapterStops(workspace), [workspace]);
  const playbackState = useMemo<DocumentSpeechPlayerState>(
    () => ({
      currentBlockId: activeSpeech?.blockId ?? null,
      isPausedForVisual,
      isPlaying,
      isPreparing,
    }),
    [activeSpeech?.blockId, isPausedForVisual, isPlaying, isPreparing],
  );

  useEffect(() => {
    onActiveSpeechChange(activeSpeech);
  }, [activeSpeech, onActiveSpeechChange]);

  useEffect(() => {
    onPlaybackStateChange?.(playbackState);
  }, [onPlaybackStateChange, playbackState]);

  useEffect(() => {
    sessionRef.current += 1;
    pendingAudioRef.current.clear();
    playbackUrlRef.current.clear();
    objectUrlRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlRef.current.clear();
    setManifest(null);
    setManifestRequestStateKey('');
    setCurrentSegmentId(null);
    setPlaybackQueueSegmentIds([]);
    setCurrentQueueIndex(-1);
    setIsPlaying(false);
    setIsPreparing(false);
    setIsPausedForVisual(false);
    setCurrentTimeSeconds(0);
    setCurrentDurationSeconds(0);
    onActiveSpeechChange(null);
    onPlaybackStateChange?.({
      currentBlockId: null,
      isPausedForVisual: false,
      isPlaying: false,
      isPreparing: false,
    });

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }, [
    onActiveSpeechChange,
    onPlaybackStateChange,
    pauseOnFigures,
    workspace.document.documentId,
    workspace.renderVersion.renderVersionId,
  ]);

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

    audio.playbackRate = effectivePlaybackRate;
  }, [effectivePlaybackRate]);

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
        setCurrentTimeSeconds(0);
        setCurrentDurationSeconds(0);
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
        setCurrentTimeSeconds(0);
        setCurrentDurationSeconds(0);
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

        const isSameSegmentPlayback = element.src === playbackUrl && currentSegmentId === segment.segmentId;
        if (element.src !== playbackUrl) {
          element.src = playbackUrl;
        }

        if (!isSameSegmentPlayback) {
          element.currentTime = 0;
          setCurrentTimeSeconds(0);
        }
        element.playbackRate = effectivePlaybackRate;
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
      ensurePlaybackUrl,
      ensureSegmentAudio,
      currentSegmentId,
      effectivePlaybackRate,
      localize,
      onActiveSpeechChange,
      prefetchSegments,
      showToast,
    ],
  );

  const playQueueSegment = useCallback(
    async (
      nextManifest: TDocumentSpeechManifest,
      queueSegmentIds: string[],
      queueIndex: number,
      session: number,
    ) => {
      const nextSegmentId = queueSegmentIds[queueIndex];
      if (!nextSegmentId) {
        setCurrentSegmentId(null);
        setCurrentQueueIndex(-1);
        setIsPlaying(false);
        setIsPausedForVisual(false);
        return;
      }

      const manifestIndex = nextManifest.segments.findIndex(
        (segment) => segment.segmentId === nextSegmentId,
      );
      if (manifestIndex < 0) {
        setCurrentSegmentId(null);
        setCurrentQueueIndex(-1);
        setIsPlaying(false);
        setIsPausedForVisual(false);
        return;
      }

      setCurrentQueueIndex(queueIndex);
      await playSegment(nextManifest, manifestIndex, session);
    },
    [playSegment],
  );

  const loadManifest = useCallback(
    async (startBlockId?: string | null): Promise<TDocumentSpeechManifest> => {
      const nextManifest = await createManifestMutation.mutateAsync({
        documentId: workspace.document.documentId,
        renderVersionId: workspace.renderVersion.renderVersionId,
        startBlockId: startBlockId === undefined ? getVisibleStartBlockId() : startBlockId,
        pauseOnFigures,
        profile,
      });
      setManifest(nextManifest);
      setManifestRequestStateKey(manifestRequestKey);
      return nextManifest;
    },
    [
      createManifestMutation,
      manifestRequestKey,
      pauseOnFigures,
      profile,
      workspace.document.documentId,
      workspace.renderVersion.renderVersionId,
    ],
  );

  const beginPlayback = useCallback(
    async (startBlockId?: string | null) => {
      if (!textToSpeech) {
        showToast({
          message: localize('com_ui_document_tts_disabled'),
          status: 'warning',
        });
        return;
      }

      const requestedStartBlockId =
        startBlockId === undefined ? getVisibleStartBlockId() : startBlockId;
      const session = sessionRef.current + 1;
      sessionRef.current = session;
      setIsPreparing(true);
      audioRef.current?.pause();

      try {
        const needsFreshManifest =
          manifest == null ||
          manifest.renderVersionId !== workspace.renderVersion.renderVersionId ||
          manifestRequestStateKey !== manifestRequestKey;
        const nextManifest = needsFreshManifest ? await loadManifest(requestedStartBlockId) : manifest;

        if (!nextManifest || session !== sessionRef.current) {
          return;
        }

        const startIndex = getStartSegmentIndex(nextManifest, requestedStartBlockId);
        if (startIndex < 0) {
          throw new Error(localize('com_ui_document_tts_audio_unavailable'));
        }

        const nextQueue = buildPlaybackQueue(nextManifest, startIndex);
        setPlaybackQueueSegmentIds(nextQueue);
        setCurrentQueueIndex(0);
        await playQueueSegment(nextManifest, nextQueue, 0, session);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : localize('com_ui_document_tts_failed');
        showToast({ message, status: 'error' });
      } finally {
        if (session === sessionRef.current) {
          setIsPreparing(false);
        }
      }
    },
    [
      loadManifest,
      localize,
      manifest,
      manifestRequestKey,
      manifestRequestStateKey,
      playQueueSegment,
      showToast,
      textToSpeech,
      workspace.renderVersion.renderVersionId,
    ],
  );

  const handlePlayAction = useCallback(() => {
    const audio = audioRef.current;

    if (isPreparing) {
      return;
    }

    if (isPausedForVisual && manifest && currentIndex >= 0) {
      const session = sessionRef.current + 1;
      sessionRef.current = session;
      const nextQueueIndex = currentQueueIndex + 1;
      if (nextQueueIndex < 0 || nextQueueIndex >= playbackQueueSegmentIds.length) {
        setCurrentSegmentId(null);
        setCurrentQueueIndex(-1);
        setIsPausedForVisual(false);
        setIsPlaying(false);
        return;
      }
      void playQueueSegment(manifest, playbackQueueSegmentIds, nextQueueIndex, session);
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
    currentQueueIndex,
    isPausedForVisual,
    isPreparing,
    manifest,
    playbackQueueSegmentIds,
    playQueueSegment,
  ]);

  const handlePauseAction = useCallback(() => {
    if (!isPlaying) {
      return;
    }

    audioRef.current?.pause();
    setIsPlaying(false);
  }, [isPlaying]);

  useImperativeHandle(
    ref,
    () => ({
      pause: handlePauseAction,
      play: handlePlayAction,
      playFromBlock: (blockId: string | null) => {
        void beginPlayback(blockId);
      },
    }),
    [beginPlayback, handlePauseAction, handlePlayAction],
  );

  const seekWithinSegment = useCallback((deltaSeconds: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.src) {
      return;
    }

    const nextDuration =
      Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : currentDurationSeconds;
    const nextTime = Math.max(0, Math.min(audio.currentTime + deltaSeconds, nextDuration || audio.currentTime + deltaSeconds));
    audio.currentTime = nextTime;
    setCurrentTimeSeconds(nextTime);
  }, [currentDurationSeconds]);

  const resolveReferenceBlockId = useCallback(() => {
    if (currentSegment?.focusBlockId ?? currentSegment?.blockId) {
      return currentSegment?.focusBlockId ?? currentSegment?.blockId;
    }

    return getVisibleStartBlockId();
  }, [currentSegment?.blockId, currentSegment?.focusBlockId]);

  const currentChapterIndex = useMemo(
    () =>
      resolveChapterIndex(
        currentSegment?.focusBlockId ?? currentSegment?.blockId ?? null,
        chapterStops,
        blockOrderLookup,
      ),
    [blockOrderLookup, chapterStops, currentSegment?.blockId, currentSegment?.focusBlockId],
  );
  const currentChapter = currentChapterIndex >= 0 ? chapterStops[currentChapterIndex] : null;

  const handleChapterJump = useCallback(
    (offset: -1 | 1) => {
      const referenceBlockId = resolveReferenceBlockId();
      const referenceChapterIndex = resolveChapterIndex(referenceBlockId, chapterStops, blockOrderLookup);
      if (referenceChapterIndex < 0) {
        return;
      }

      const targetChapter = chapterStops[referenceChapterIndex + offset];
      if (!targetChapter) {
        return;
      }

      void beginPlayback(targetChapter.blockId);
    },
    [beginPlayback, blockOrderLookup, chapterStops, resolveReferenceBlockId],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handleEnded = () => {
      if (!manifest) {
        setCurrentSegmentId(null);
        setCurrentQueueIndex(-1);
        setIsPlaying(false);
        return;
      }

      const nextQueueIndex = currentQueueIndex + 1;
      if (nextQueueIndex < 0 || nextQueueIndex >= playbackQueueSegmentIds.length) {
        setCurrentSegmentId(null);
        setCurrentQueueIndex(-1);
        setIsPlaying(false);
        setIsPausedForVisual(false);
        return;
      }

      const session = sessionRef.current + 1;
      sessionRef.current = session;
      void playQueueSegment(manifest, playbackQueueSegmentIds, nextQueueIndex, session);
    };

    const handlePause = () => {
      if (!audio.ended && !isPausedForVisual) {
        setIsPlaying(false);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handleTimeUpdate = () => {
      setCurrentTimeSeconds(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setCurrentDurationSeconds(Number.isFinite(audio.duration) ? audio.duration : 0);
      setCurrentTimeSeconds(audio.currentTime);
    };

    const handleDurationChange = () => {
      setCurrentDurationSeconds(Number.isFinite(audio.duration) ? audio.duration : 0);
    };

    const handleEmptied = () => {
      setCurrentTimeSeconds(0);
      setCurrentDurationSeconds(0);
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('emptied', handleEmptied);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('emptied', handleEmptied);
    };
  }, [currentQueueIndex, isPausedForVisual, manifest, playbackQueueSegmentIds, playQueueSegment]);

  const progressLabel =
    playbackQueueSegmentIds.length > 0 && currentQueueIndex >= 0
      ? `${currentQueueIndex + 1} / ${playbackQueueSegmentIds.length}`
      : manifest && currentIndex >= 0
        ? `${currentIndex + 1} / ${manifest.segments.length}`
        : null;
  const highlightLabel =
    highlightMode === 'off'
      ? localize('com_ui_document_tts_highlight_off')
      : highlightMode === 'block'
        ? localize('com_ui_document_tts_highlight_block')
        : localize('com_ui_document_tts_highlight_excerpt');
  const hasSeekableAudio = Boolean(audioRef.current?.src && currentSegment?.playbackDirective !== 'pause_for_visual');
  const playLabel = isPlaying
    ? localize('com_ui_document_tts_pause')
    : isPausedForVisual
      ? localize('com_ui_document_tts_resume')
      : currentSegment && hasSeekableAudio
        ? localize('com_ui_document_tts_resume_reading')
        : localize('com_ui_document_tts_play');
  const currentSnippet =
    currentSegment?.playbackDirective === 'pause_for_visual'
      ? localize('com_ui_document_tts_visual_pause')
      : currentSegment?.spokenText ?? null;
  const currentTimeLabel = formatPlaybackTime(currentTimeSeconds);
  const currentDurationLabel = formatPlaybackTime(currentDurationSeconds);
  const canJumpToPreviousChapter = currentChapterIndex > 0;
  const canJumpToNextChapter = currentChapterIndex >= 0 && currentChapterIndex < chapterStops.length - 1;

  return (
    <div className="rounded-[1.75rem] border border-border-light bg-surface-secondary/90 p-4 backdrop-blur">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
            {currentChapter?.title ?? workspace.document.title}
          </div>
          <div className="mt-2 text-sm text-text-primary">
            {currentSnippet ?? localize('com_ui_document_tts_idle')}
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="rounded-full border border-border-light p-2 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => handleChapterJump(-1)}
            disabled={isPreparing || !canJumpToPreviousChapter}
            aria-label={localize('com_ui_document_tts_previous_chapter')}
            title={localize('com_ui_document_tts_previous_chapter')}
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-full border border-border-light p-2 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => seekWithinSegment(-SEEK_STEP_SECONDS)}
            disabled={isPreparing || !hasSeekableAudio}
            aria-label={localize('com_ui_document_tts_seek_backward')}
            title={localize('com_ui_document_tts_seek_backward')}
          >
            <Rewind className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex min-w-[8.5rem] items-center justify-center gap-2 rounded-full bg-text-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:text-black"
            onClick={isPlaying ? handlePauseAction : handlePlayAction}
            disabled={isPreparing}
          >
            {isPlaying ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
            {isPreparing ? localize('com_ui_document_tts_preparing') : playLabel}
          </button>
          <button
            type="button"
            className="rounded-full border border-border-light p-2 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => seekWithinSegment(SEEK_STEP_SECONDS)}
            disabled={isPreparing || !hasSeekableAudio}
            aria-label={localize('com_ui_document_tts_seek_forward')}
            title={localize('com_ui_document_tts_seek_forward')}
          >
            <FastForward className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-full border border-border-light p-2 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => handleChapterJump(1)}
            disabled={isPreparing || !canJumpToNextChapter}
            aria-label={localize('com_ui_document_tts_next_chapter')}
            title={localize('com_ui_document_tts_next_chapter')}
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        <div className="ml-auto flex min-w-[18rem] flex-1 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
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
            className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
              pauseOnFigures
                ? 'border-border-heavy text-text-primary'
                : 'border-border-light text-text-secondary'
            }`}
            onClick={() => setPauseOnFigures(!pauseOnFigures)}
          >
            <Image className="h-4 w-4" />
            {localize('com_ui_document_tts_pause_on_figures')}
          </button>
          <button
            type="button"
            className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
              highlightMode !== 'off'
                ? 'border-border-heavy text-text-primary'
                : 'border-border-light text-text-secondary'
            }`}
            onClick={() => setHighlightMode(cycleHighlightMode(highlightMode))}
          >
            <Highlighter className="h-4 w-4" />
            {highlightLabel}
          </button>
          <div className="min-w-[10rem] rounded-2xl border border-border-light px-3 py-2">
            <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-[0.14em] text-text-secondary">
              <span className="flex items-center gap-1">
                <Gauge className="h-3.5 w-3.5" />
                {localize('com_ui_document_tts_speed')}
              </span>
              <span>{effectivePlaybackRate.toFixed(1)}x</span>
            </div>
            <Slider
              value={[effectivePlaybackRate]}
              onValueChange={(value) => setPlaybackRate(value[0] ?? 1)}
              min={0.5}
              max={2}
              step={0.1}
              className="flex h-4 w-full"
              aria-label={localize('com_ui_document_tts_speed')}
            />
          </div>
          <div className="rounded-2xl border border-border-light px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary">
            <div>{progressLabel ?? '0 / 0'}</div>
            <div className="mt-1 text-[0.7rem] tracking-[0.12em]">
              {currentTimeLabel} / {currentDurationLabel}
            </div>
          </div>
        </div>
      </div>

      <audio ref={audioRef} preload="none" className="hidden" />
    </div>
  );
});

export default DocumentSpeech;
