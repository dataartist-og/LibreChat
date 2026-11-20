import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalize } from '~/hooks';

export type ConversationStatus = 'idle' | 'starting' | 'listening' | 'thinking' | 'speaking';

export interface BrowserRecognitionResult {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

export interface BrowserRecognition {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onresult:
    | ((event: { resultIndex: number; results: ArrayLike<BrowserRecognitionResult> }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  abort: () => void;
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => BrowserRecognition;
  webkitSpeechRecognition?: new () => BrowserRecognition;
};

type ConversationOptions = {
  onQuestion: (text: string, signal?: AbortSignal) => Promise<string>;
  onActivity: () => void;
};

const turnDelay = 750;
const connectionTimeout = 10_000;
const echoTail = 1_500;
const normalize = (text: string) =>
  text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function recognitionConstructor() {
  const browser = window as SpeechWindow;
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

/** Browser speech/text loop. Recognition has no portable acoustic echo or speaker control. */
export default function useConversation({ onQuestion, onActivity }: ConversationOptions) {
  const localize = useLocalize();
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [error, setError] = useState('');
  const callbacks = useRef({ onQuestion, onActivity, localize });
  callbacks.current = { onQuestion, onActivity, localize };
  const mounted = useRef(true);
  const enabled = useRef(false);
  const phase = useRef<ConversationStatus>('idle');
  const recognition = useRef<BrowserRecognition | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingText = useRef('');
  const spoken = useRef({ text: '', until: 0 });
  const supported = Boolean(
    recognitionConstructor() && window.speechSynthesis && window.SpeechSynthesisUtterance,
  );

  const updateStatus = useCallback((next: ConversationStatus) => {
    phase.current = next;
    if (mounted.current) {
      setStatus(next);
    }
  }, []);

  const cancelReply = useCallback(() => {
    generation.current += 1;
    request.current?.abort();
    request.current = null;
    if (utterance.current) {
      utterance.current.onend = null;
      utterance.current.onerror = null;
      utterance.current = null;
      spoken.current.until = Date.now() + echoTail;
      window.speechSynthesis?.cancel();
    }
  }, []);

  const dispose = useCallback(() => {
    enabled.current = false;
    for (const timer of [turnTimer, restartTimer, startTimer]) {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }
    pendingText.current = '';
    cancelReply();
    const engine = recognition.current;
    recognition.current = null;
    if (engine) {
      engine.onstart = null;
      engine.onend = null;
      engine.onspeechstart = null;
      engine.onresult = null;
      engine.onerror = null;
      try {
        engine.abort();
      } catch {
        return;
      }
    }
  }, [cancelReply]);

  const stop = useCallback(() => {
    dispose();
    updateStatus('idle');
    if (mounted.current) {
      setActive(false);
    }
  }, [dispose, updateStatus]);

  const interrupt = useCallback(() => {
    if (!enabled.current) {
      return;
    }
    cancelReply();
    callbacks.current.onActivity();
    updateStatus('listening');
  }, [cancelReply, updateStatus]);

  const submit = useCallback(async () => {
    const text = pendingText.current.trim();
    pendingText.current = '';
    turnTimer.current = null;
    if (!enabled.current || !text) {
      return;
    }
    cancelReply();
    const id = generation.current;
    const controller = new AbortController();
    request.current = controller;
    const current = () => mounted.current && enabled.current && generation.current === id;
    setError('');
    updateStatus('thinking');
    callbacks.current.onActivity();
    try {
      const answer = await callbacks.current.onQuestion(text, controller.signal);
      if (!current()) {
        return;
      }
      request.current = null;
      const readable = answer
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[#*_`]/g, '')
        .trim();
      if (!readable) {
        updateStatus('listening');
        return;
      }
      const reply = new SpeechSynthesisUtterance(readable);
      reply.lang = recognition.current?.lang ?? navigator.language;
      utterance.current = reply;
      spoken.current = { text: normalize(readable), until: Infinity };
      reply.onend = () => {
        if (!current()) {
          return;
        }
        utterance.current = null;
        spoken.current.until = Date.now() + echoTail;
        updateStatus('listening');
      };
      reply.onerror = () => {
        if (!current()) {
          return;
        }
        utterance.current = null;
        spoken.current.until = Date.now() + echoTail;
        setError(callbacks.current.localize('com_ui_lecture_conversation_playback'));
        updateStatus('listening');
      };
      updateStatus('speaking');
      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(reply);
      } catch {
        cancelReply();
        setError(callbacks.current.localize('com_ui_lecture_conversation_playback'));
        updateStatus('listening');
      }
    } catch (cause) {
      if (current()) {
        request.current = null;
        setError(
          `${callbacks.current.localize('com_ui_lecture_conversation_response')}${cause instanceof Error ? ` ${cause.message}` : ''}`,
        );
        updateStatus('listening');
      }
    }
  }, [cancelReply, updateStatus]);

  const start = useCallback(() => {
    if (enabled.current) {
      return;
    }
    const Constructor = recognitionConstructor();
    if (!Constructor || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setError(callbacks.current.localize('com_ui_lecture_conversation_unavailable'));
      return;
    }
    const fail = (message: string) => {
      stop();
      if (mounted.current) {
        setError(message);
      }
    };
    let engine: BrowserRecognition;
    try {
      engine = new Constructor();
    } catch {
      fail(callbacks.current.localize('com_ui_lecture_conversation_unavailable'));
      return;
    }
    recognition.current = engine;
    enabled.current = true;
    spoken.current = { text: '', until: 0 };
    setActive(true);
    setError('');
    updateStatus('starting');
    callbacks.current.onActivity();
    engine.continuous = true;
    engine.interimResults = true;
    engine.maxAlternatives = 1;
    engine.lang = document.documentElement.lang || navigator.language || 'en-US';
    const consumed = new Set<number>();
    let startedAt = Date.now();
    let shortConnections = 0;
    const current = () => enabled.current && recognition.current === engine && mounted.current;
    const listen = () => {
      if (!current()) {
        return;
      }
      consumed.clear();
      startedAt = Date.now();
      startTimer.current = setTimeout(() => {
        if (current()) {
          fail(callbacks.current.localize('com_ui_lecture_conversation_connection'));
        }
      }, connectionTimeout);
      try {
        engine.start();
      } catch {
        fail(callbacks.current.localize('com_ui_lecture_conversation_recognition'));
      }
    };
    engine.onstart = () => {
      if (!current()) {
        return;
      }
      if (startTimer.current !== null) {
        clearTimeout(startTimer.current);
        startTimer.current = null;
      }
      if (phase.current === 'starting') {
        updateStatus('listening');
      }
    };
    engine.onspeechstart = () => {
      if (current() && phase.current === 'thinking') {
        interrupt();
      }
    };
    engine.onresult = (event) => {
      if (!current()) {
        return;
      }
      let receivedSpeech = false;
      let awaitingFinal = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result || consumed.has(index)) {
          continue;
        }
        if (result.isFinal) {
          consumed.add(index);
        }
        const text = result[0]?.transcript.trim() ?? '';
        const normalized = normalize(text);
        if (!normalized) {
          continue;
        }
        const likelyEcho =
          Date.now() < spoken.current.until &&
          ` ${spoken.current.text} `.includes(` ${normalized} `);
        if (likelyEcho) {
          continue;
        }
        receivedSpeech = true;
        awaitingFinal = awaitingFinal || !result.isFinal;
        if (result.isFinal || normalized.includes(' ') || /^(stop|wait|pause)$/.test(normalized)) {
          interrupt();
        }
        if (result.isFinal) {
          pendingText.current = `${pendingText.current} ${text}`.trim();
        }
      }
      if (!receivedSpeech) {
        return;
      }
      if (turnTimer.current !== null) {
        clearTimeout(turnTimer.current);
        turnTimer.current = null;
      }
      if (pendingText.current && !awaitingFinal) {
        turnTimer.current = setTimeout(() => void submit(), turnDelay);
      }
    };
    engine.onerror = (event) => {
      if (!current() || event.error === 'no-speech') {
        return;
      }
      const denied = ['not-allowed', 'service-not-allowed'].includes(event.error);
      fail(
        callbacks.current.localize(
          denied
            ? 'com_ui_lecture_conversation_permission'
            : 'com_ui_lecture_conversation_recognition',
        ),
      );
    };
    engine.onend = () => {
      if (!current()) {
        return;
      }
      if (startTimer.current !== null) {
        clearTimeout(startTimer.current);
        startTimer.current = null;
      }
      shortConnections = Date.now() - startedAt < 1500 ? shortConnections + 1 : 0;
      if (shortConnections >= 3) {
        fail(callbacks.current.localize('com_ui_lecture_conversation_connection'));
        return;
      }
      if (pendingText.current && turnTimer.current === null) {
        turnTimer.current = setTimeout(() => void submit(), turnDelay);
      }
      restartTimer.current = setTimeout(listen, 250 * 2 ** shortConnections);
    };
    listen();
  }, [interrupt, stop, submit, updateStatus]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      dispose();
    };
  }, [dispose]);

  return { start, stop, interrupt, active, status, error, supported };
}
