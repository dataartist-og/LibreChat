import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import type { LectureVoiceRequest } from 'librechat-data-provider';
import type { ConversationStatus } from './useConversation';
import {
  useLectureVoiceStartMutation,
  useLectureVoiceStopMutation,
} from '~/data-provider/Lectures';
import { useLocalize } from '~/hooks';

const eventSchema = z.object({
  type: z.string(),
  item_id: z.string().optional(),
  response_id: z.string().optional(),
  transcript: z.string().optional(),
  item: z
    .object({ id: z.string().optional(), role: z.string().optional(), text: z.string().optional() })
    .optional(),
  turn: z
    .object({ id: z.string().optional(), role: z.string(), transcript: z.string().optional() })
    .optional(),
  response: z.object({ id: z.string(), status: z.string().optional() }).optional(),
  error: z.object({ message: z.string().optional() }).optional(),
});

type VoiceEvent = z.infer<typeof eventSchema>;
type LiveOptions = Omit<LectureVoiceRequest, 'sdp'> & {
  onExchange: (question: string, answer: string) => void;
  onActivity: () => void;
};

/** Correlates delayed input transcription with the response created after its committed item. */
export function createVoiceTranscriptTracker(onExchange: LiveOptions['onExchange']) {
  const questions = new Map<string, string>();
  const responses = new Map<
    string,
    {
      questionId: string | undefined;
      answer: string;
      complete: boolean;
      emitted: boolean;
      cancelled: boolean;
    }
  >();
  let latestQuestion: string | undefined;
  let nativeResponse: string | undefined;
  const nativeQuestions = new Set<string>();
  const registerResponse = (id: string) => {
    if (!responses.has(id)) {
      responses.set(id, {
        questionId: latestQuestion,
        answer: '',
        complete: false,
        emitted: false,
        cancelled: false,
      });
    }
  };
  const interruptNative = () => {
    const response = nativeResponse ? responses.get(nativeResponse) : undefined;
    if (response && !response.complete) {
      response.cancelled = true;
    }
  };
  const emit = (id: string) => {
    const response = responses.get(id);
    const question = response?.questionId ? questions.get(response.questionId) : undefined;
    if (
      !response ||
      response.emitted ||
      response.cancelled ||
      !response.complete ||
      !response.answer ||
      !question
    ) {
      return;
    }
    response.emitted = true;
    onExchange(question, response.answer);
  };
  const saveQuestion = (id: string, text: string) => {
    questions.set(id, text);
    for (const [responseId, response] of responses) {
      if (response.questionId === id) {
        emit(responseId);
      }
    }
  };
  return (event: VoiceEvent) => {
    if (event.type === 'input_transcript.added') {
      interruptNative();
      return;
    }
    if (event.type === 'turn.created' || event.type === 'turn.done') {
      const turn = event.turn;
      if (!turn?.id) {
        return;
      }
      if (turn.role === 'user') {
        if (!nativeQuestions.has(turn.id)) {
          interruptNative();
          latestQuestion = turn.id;
          nativeQuestions.add(turn.id);
        }
        if (event.type === 'turn.done' && turn.transcript?.trim()) {
          saveQuestion(turn.id, turn.transcript.trim());
        }
      } else if (turn.role === 'assistant' && event.type === 'turn.created') {
        nativeResponse = turn.id;
        registerResponse(turn.id);
      } else if (turn.role === 'assistant' && event.type === 'turn.done') {
        const response = responses.get(turn.id);
        if (response) {
          response.answer = turn.transcript?.trim() ?? '';
          response.complete = true;
          emit(turn.id);
        }
      }
      return;
    }
    if (event.type === 'input_audio_buffer.committed' && event.item_id) {
      latestQuestion = event.item_id;
      return;
    }
    if (
      ['conversation.item.created', 'conversation.item.added'].includes(event.type) &&
      event.item?.role === 'user' &&
      event.item.id
    ) {
      latestQuestion = event.item.id;
      return;
    }
    if (
      event.type === 'conversation.item.input_audio_transcription.completed' &&
      event.item_id &&
      event.transcript?.trim()
    ) {
      saveQuestion(event.item_id, event.transcript.trim());
      latestQuestion ??= event.item_id;
      return;
    }
    const id = event.response?.id ?? event.response_id;
    if (!id) {
      return;
    }
    if (event.type === 'response.created') {
      registerResponse(id);
      return;
    }
    const response = responses.get(id);
    if (!response) {
      return;
    }
    if (
      ['response.output_audio_transcript.done', 'response.audio_transcript.done'].includes(
        event.type,
      )
    ) {
      response.answer = event.transcript?.trim() ?? '';
      emit(id);
    }
    if (event.type === 'response.done') {
      response.complete = event.response?.status === 'completed';
      emit(id);
    }
  };
}

function parseEvent(data: string): VoiceEvent | null {
  try {
    const result = eventSchema.safeParse(JSON.parse(data));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export default function useLiveConversation(options: LiveOptions) {
  const localize = useLocalize();
  const { mutateAsync: startSession } = useLectureVoiceStartMutation();
  const { mutateAsync: stopSession } = useLectureVoiceStopMutation();
  const callbacks = useRef({ options, localize, startSession, stopSession });
  callbacks.current = { options, localize, startSession, stopSession };
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const generation = useRef(0);
  const enabled = useRef(false);
  const session = useRef<string | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const playback = useRef<HTMLAudioElement | null>(null);
  const connectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelGathering = useRef<(() => void) | null>(null);
  const contextKey = JSON.stringify([
    options.lecture.id,
    options.momentId,
    options.sourceId,
    options.focus?.sourceId,
    options.focus?.anchor,
  ]);
  const previousContext = useRef(contextKey);
  const supported =
    typeof RTCPeerConnection === 'function' && !!navigator.mediaDevices?.getUserMedia;

  const updateStatus = useCallback((next: ConversationStatus) => {
    if (mounted.current) {
      setStatus(next);
    }
  }, []);

  const closeSession = useCallback(async (id: string) => {
    const closingGeneration = generation.current;
    try {
      await callbacks.current.stopSession(id);
    } catch {
      if (mounted.current && generation.current === closingGeneration && !enabled.current) {
        setError(callbacks.current.localize('com_ui_lecture_live_stop'));
      }
    }
  }, []);

  const dispose = useCallback(() => {
    generation.current += 1;
    enabled.current = false;
    cancelGathering.current?.();
    for (const timer of [connectionTimer, disconnectTimer]) {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }
    if (channel.current) {
      channel.current.onopen = null;
      channel.current.onclose = null;
      channel.current.onerror = null;
      channel.current.onmessage = null;
      channel.current.close();
      channel.current = null;
    }
    if (peer.current) {
      peer.current.ontrack = null;
      peer.current.onconnectionstatechange = null;
      peer.current.close();
      peer.current = null;
    }
    microphone.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    microphone.current = null;
    if (playback.current) {
      playback.current.onerror = null;
      playback.current.pause();
      playback.current.srcObject = null;
      playback.current.removeAttribute('src');
      playback.current = null;
    }
    const id = session.current;
    session.current = null;
    if (id) {
      void closeSession(id);
    }
  }, [closeSession]);

  const stop = useCallback(() => {
    dispose();
    if (mounted.current) {
      setActive(false);
      updateStatus('idle');
    }
  }, [dispose, updateStatus]);

  const start = useCallback(async () => {
    if (enabled.current) {
      return;
    }
    if (typeof RTCPeerConnection !== 'function' || !navigator.mediaDevices?.getUserMedia) {
      setError(callbacks.current.localize('com_ui_lecture_live_unavailable'));
      return;
    }
    enabled.current = true;
    const id = ++generation.current;
    const current = () => mounted.current && enabled.current && generation.current === id;
    const fail = (message: string) => {
      if (!current()) {
        return;
      }
      stop();
      setError(message);
    };
    const context = callbacks.current.options;
    setError('');
    setActive(true);
    updateStatus('starting');
    context.onActivity();
    connectionTimer.current = setTimeout(() => {
      fail(callbacks.current.localize('com_ui_lecture_live_connection'));
    }, 75_000);
    try {
      const output = new Audio();
      output.autoplay = true;
      playback.current = output;
      output.onerror = () => fail(callbacks.current.localize('com_ui_lecture_live_playback'));
      const capture = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (!current()) {
        capture.getTracks().forEach((track) => track.stop());
        return;
      }
      microphone.current = capture;
      const connection = new RTCPeerConnection();
      peer.current = connection;
      capture.getTracks().forEach((track) => {
        track.onended = () => fail(callbacks.current.localize('com_ui_lecture_live_microphone'));
        connection.addTrack(track, capture);
      });
      connection.ontrack = (event) => {
        if (!current()) {
          return;
        }
        output.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void output
          .play()
          .catch(() => fail(callbacks.current.localize('com_ui_lecture_live_playback')));
      };
      connection.onconnectionstatechange = () => {
        if (!current()) {
          return;
        }
        if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
          fail(callbacks.current.localize('com_ui_lecture_live_connection'));
          return;
        }
        if (connection.connectionState === 'disconnected' && disconnectTimer.current === null) {
          disconnectTimer.current = setTimeout(
            () => fail(callbacks.current.localize('com_ui_lecture_live_connection')),
            5_000,
          );
        }
        if (connection.connectionState === 'connected' && disconnectTimer.current !== null) {
          clearTimeout(disconnectTimer.current);
          disconnectTimer.current = null;
        }
      };
      const events = connection.createDataChannel('oai-events');
      channel.current = events;
      const trackTranscript = createVoiceTranscriptTracker((question, answer) => {
        if (current()) {
          callbacks.current.options.onExchange(question, answer);
        }
      });
      events.onopen = () => {
        if (!current()) {
          return;
        }
        if (connectionTimer.current !== null) {
          clearTimeout(connectionTimer.current);
          connectionTimer.current = null;
        }
        updateStatus('listening');
      };
      events.onclose = () => fail(callbacks.current.localize('com_ui_lecture_live_connection'));
      events.onerror = () => fail(callbacks.current.localize('com_ui_lecture_live_connection'));
      events.onmessage = (message: MessageEvent<string>) => {
        if (!current() || typeof message.data !== 'string') {
          return;
        }
        const event = parseEvent(message.data);
        if (!event) {
          return;
        }
        trackTranscript(event);
        if (event.type === 'error') {
          fail(
            `${callbacks.current.localize('com_ui_lecture_live_connection')}${event.error?.message ? ` ${event.error.message.slice(0, 500)}` : ''}`,
          );
          return;
        }
        if (['input_audio_buffer.speech_started', 'input_transcript.added'].includes(event.type)) {
          callbacks.current.options.onActivity();
          updateStatus('listening');
        } else if (['input_audio_buffer.speech_stopped', 'response.created'].includes(event.type)) {
          updateStatus('thinking');
        } else if (event.type === 'turn.done') {
          updateStatus(event.turn?.role === 'user' ? 'thinking' : 'listening');
        } else if (
          [
            'output_audio_buffer.started',
            'response.output_audio_transcript.delta',
            'response.audio_transcript.delta',
            'output_audio.delta',
            'output_transcript.added',
          ].includes(event.type)
        ) {
          updateStatus('speaking');
        } else if (
          [
            'output_audio_buffer.stopped',
            'output_audio_buffer.cleared',
            'session.started',
          ].includes(event.type)
        ) {
          updateStatus('listening');
        }
      };
      const offer = await connection.createOffer();
      if (!current()) {
        return;
      }
      await connection.setLocalDescription(offer);
      if (!current()) {
        return;
      }
      if (connection.iceGatheringState !== 'complete') {
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            connection.removeEventListener('icegatheringstatechange', onGathering);
            cancelGathering.current = null;
            resolve();
          };
          const onGathering = () => {
            if (connection.iceGatheringState === 'complete') {
              finish();
            }
          };
          const timer = setTimeout(finish, 2_000);
          cancelGathering.current = finish;
          connection.addEventListener('icegatheringstatechange', onGathering);
        });
      }
      if (!current()) {
        return;
      }
      const sdp = connection.localDescription?.sdp;
      if (!sdp) {
        throw new Error('Missing local SDP');
      }
      const result = await callbacks.current.startSession({
        lecture: context.lecture,
        momentId: context.momentId,
        sourceId: context.sourceId,
        focus: context.focus,
        sdp,
      });
      if (!current()) {
        void closeSession(result.sessionId);
        return;
      }
      session.current = result.sessionId;
      await connection.setRemoteDescription({ type: 'answer', sdp: result.sdp });
    } catch (cause) {
      const permissionDenied =
        cause instanceof DOMException &&
        ['NotAllowedError', 'SecurityError', 'NotFoundError'].includes(cause.name);
      const detail = isAxiosError<{ error?: string }>(cause)
        ? cause.response?.data?.error
        : undefined;
      const key = permissionDenied
        ? 'com_ui_lecture_live_microphone'
        : 'com_ui_lecture_live_connection';
      fail(
        `${callbacks.current.localize(key)}${typeof detail === 'string' ? ` ${detail.slice(0, 500)}` : ''}`,
      );
    }
  }, [closeSession, stop, updateStatus]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      dispose();
    };
  }, [dispose]);

  useEffect(() => {
    if (previousContext.current !== contextKey) {
      previousContext.current = contextKey;
      stop();
    }
  }, [contextKey, stop]);

  return { start, stop, active, status, error, supported };
}
