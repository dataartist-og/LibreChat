import { act, cleanup, renderHook } from '@testing-library/react';
import type { BrowserRecognition, BrowserRecognitionResult } from '../useConversation';
import useConversation from '../useConversation';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));

class ExternalRecognition implements BrowserRecognition {
  static instances: ExternalRecognition[] = [];
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  lang = '';
  onstart: BrowserRecognition['onstart'] = null;
  onend: BrowserRecognition['onend'] = null;
  onspeechstart: BrowserRecognition['onspeechstart'] = null;
  onresult: BrowserRecognition['onresult'] = null;
  onerror: BrowserRecognition['onerror'] = null;
  start = jest.fn();
  abort = jest.fn();

  constructor() {
    ExternalRecognition.instances.push(this);
  }
}

class ExternalUtterance {
  static instances: ExternalUtterance[] = [];
  lang = '';
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public text: string) {
    ExternalUtterance.instances.push(this);
  }
}

const synthesis = { speak: jest.fn(), cancel: jest.fn(), resume: jest.fn() };
const properties = [
  'SpeechRecognition',
  'webkitSpeechRecognition',
  'speechSynthesis',
  'SpeechSynthesisUtterance',
] as const;
const originals = properties.map(
  (name) => [name, Object.getOwnPropertyDescriptor(window, name)] as const,
);

beforeEach(() => {
  jest.useFakeTimers();
  ExternalRecognition.instances = [];
  ExternalUtterance.instances = [];
  Object.defineProperty(window, 'SpeechRecognition', {
    configurable: true,
    value: ExternalRecognition,
  });
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synthesis });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    value: ExternalUtterance,
  });
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
  for (const [name, descriptor] of originals) {
    if (descriptor) {
      Object.defineProperty(window, name, descriptor);
    } else {
      Reflect.deleteProperty(window, name);
    }
  }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function result(engine: ExternalRecognition, texts: Array<[string, boolean]>, resultIndex = 0) {
  const results: BrowserRecognitionResult[] = texts.map(([transcript, isFinal]) => ({
    isFinal,
    0: { transcript },
  }));
  engine.onresult?.({ resultIndex, results });
}

function mountConversation() {
  const onQuestion = jest
    .fn<Promise<string>, [string, AbortSignal?]>()
    .mockResolvedValue('The feature represents a direction in activation space.');
  const onActivity = jest.fn();
  const hook = renderHook((props) => useConversation(props), {
    initialProps: { onQuestion, onActivity },
  });
  const begin = () => {
    act(() => hook.result.current.start());
    const engine = ExternalRecognition.instances[0];
    act(() => engine.onstart?.());
    return engine;
  };
  return { ...hook, onQuestion, onActivity, begin };
}

describe('browser conversation opt-in and connection lifecycle', () => {
  it('requests recognition only on explicit start and keeps one continuous engine', () => {
    const hook = mountConversation();
    expect(hook.result.current.supported).toBe(true);
    expect(hook.result.current.active).toBe(false);
    expect(ExternalRecognition.instances).toHaveLength(0);
    act(() => hook.result.current.start());
    expect(hook.result.current.status).toBe('starting');
    const engine = ExternalRecognition.instances[0];
    expect(engine.continuous).toBe(true);
    expect(engine.interimResults).toBe(true);
    expect(engine.start).toHaveBeenCalledTimes(1);
    act(() => engine.onstart?.());
    act(() => hook.result.current.start());
    expect(ExternalRecognition.instances).toHaveLength(1);
    expect(hook.result.current.status).toBe('listening');
    expect(hook.onActivity).toHaveBeenCalledTimes(1);
  });

  it('uses the prefixed browser constructor when available and reports unsupported browsers', () => {
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    const hook = mountConversation();
    expect(hook.result.current.supported).toBe(false);
    act(() => hook.result.current.start());
    expect(hook.result.current.error).toBe('com_ui_lecture_conversation_unavailable');
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: ExternalRecognition,
    });
    act(() => hook.result.current.start());
    expect(ExternalRecognition.instances[0].start).toHaveBeenCalledTimes(1);
  });

  it('restarts ordinary disconnections and stops a rapid disconnect loop', () => {
    const hook = mountConversation();
    const engine = hook.begin();
    act(() => jest.advanceTimersByTime(2_000));
    act(() => engine.onend?.());
    act(() => jest.advanceTimersByTime(250));
    expect(engine.start).toHaveBeenCalledTimes(2);
    for (const delay of [500, 1_000]) {
      act(() => engine.onstart?.());
      act(() => engine.onend?.());
      act(() => jest.advanceTimersByTime(delay));
    }
    act(() => engine.onend?.());
    expect(hook.result.current.active).toBe(false);
    expect(hook.result.current.error).toBe('com_ui_lecture_conversation_connection');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reports denied permission without repeatedly requesting access', () => {
    const hook = mountConversation();
    const engine = hook.begin();
    act(() => engine.onerror?.({ error: 'not-allowed' }));
    act(() => jest.advanceTimersByTime(20_000));
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(engine.abort).toHaveBeenCalledTimes(1);
    expect(hook.result.current.error).toBe('com_ui_lecture_conversation_permission');
    expect(hook.result.current.active).toBe(false);
  });

  it('stops when recognition never confirms that it started', () => {
    const hook = mountConversation();
    act(() => hook.result.current.start());
    act(() => jest.advanceTimersByTime(10_000));
    expect(hook.result.current.active).toBe(false);
    expect(hook.result.current.error).toBe('com_ui_lecture_conversation_connection');
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('automatic questions, replies, and interruption', () => {
  it('combines final speech fragments, waits for interim speech, and sends each final result once', async () => {
    const hook = mountConversation();
    const engine = hook.begin();
    act(() => result(engine, [['Explain the feature', true]]));
    act(() => jest.advanceTimersByTime(500));
    act(() =>
      result(
        engine,
        [
          ['Explain the feature', true],
          ['in this', false],
        ],
        1,
      ),
    );
    act(() => jest.advanceTimersByTime(1_000));
    expect(hook.onQuestion).not.toHaveBeenCalled();
    await act(async () => {
      result(
        engine,
        [
          ['Explain the feature', true],
          ['in this figure', true],
        ],
        1,
      );
      jest.advanceTimersByTime(750);
    });
    expect(hook.onQuestion).toHaveBeenCalledTimes(1);
    expect(hook.onQuestion.mock.calls[0][0]).toBe('Explain the feature in this figure');
    expect(hook.onQuestion.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
    expect(hook.result.current.status).toBe('speaking');
    expect(synthesis.speak).toHaveBeenCalledTimes(1);
    expect(engine.abort).not.toHaveBeenCalled();
    await act(async () => {
      result(
        engine,
        [
          ['Explain the feature', true],
          ['in this figure', true],
        ],
        0,
      );
      jest.advanceTimersByTime(1_000);
    });
    expect(hook.onQuestion).toHaveBeenCalledTimes(1);
    act(() => ExternalUtterance.instances[0].onend?.());
    expect(hook.result.current.status).toBe('listening');
    expect(hook.result.current.active).toBe(true);
  });

  it('keeps listening during replies, ignores recognizable speaker echo, and interrupts for new speech', async () => {
    const hook = mountConversation();
    const engine = hook.begin();
    await act(async () => {
      result(engine, [['Explain this', true]]);
      jest.advanceTimersByTime(750);
    });
    act(() => engine.onspeechstart?.());
    act(() =>
      result(
        engine,
        [
          ['Explain this', true],
          ['The feature represents', false],
        ],
        1,
      ),
    );
    expect(synthesis.cancel).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe('speaking');
    act(() =>
      result(
        engine,
        [
          ['Explain this', true],
          ['Wait how is this measured', false],
        ],
        1,
      ),
    );
    expect(synthesis.cancel).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toBe('listening');
    await act(async () => {
      result(
        engine,
        [
          ['Explain this', true],
          ['Wait how is this measured', true],
        ],
        1,
      );
      jest.advanceTimersByTime(750);
    });
    expect(hook.onQuestion.mock.calls[1][0]).toBe('Wait how is this measured');
    expect(engine.abort).not.toHaveBeenCalled();
  });

  it('ignores final echoes after speech ends without asking the tutor its own answer', async () => {
    const hook = mountConversation();
    const engine = hook.begin();
    await act(async () => {
      result(engine, [['Explain this', true]]);
      jest.advanceTimersByTime(750);
    });
    act(() => ExternalUtterance.instances[0].onend?.());
    await act(async () => {
      result(
        engine,
        [
          ['Explain this', true],
          ['a direction in activation space', true],
        ],
        1,
      );
      jest.advanceTimersByTime(750);
    });
    expect(hook.onQuestion).toHaveBeenCalledTimes(1);
  });

  it('aborts a pending answer on speech detection and never reads a stale response', async () => {
    const hook = mountConversation();
    const pending = deferred<string>();
    hook.onQuestion.mockReturnValueOnce(pending.promise);
    const engine = hook.begin();
    await act(async () => {
      result(engine, [['Original question', true]]);
      jest.advanceTimersByTime(750);
    });
    expect(hook.result.current.status).toBe('thinking');
    act(() => engine.onspeechstart?.());
    expect(hook.onQuestion.mock.calls[0][1]?.aborted).toBe(true);
    await act(async () => pending.resolve('Obsolete answer'));
    expect(synthesis.speak).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe('listening');
  });

  it('uses the current callback after rerender and surfaces tutor and playback failures', async () => {
    const hook = mountConversation();
    const engine = hook.begin();
    const latest = jest
      .fn<Promise<string>, [string, AbortSignal?]>()
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValue('New reply');
    hook.rerender({ onQuestion: latest, onActivity: hook.onActivity });
    await act(async () => {
      result(engine, [['First question', true]]);
      jest.advanceTimersByTime(750);
    });
    expect(hook.onQuestion).not.toHaveBeenCalled();
    expect(hook.result.current.error).toContain('com_ui_lecture_conversation_response');
    expect(hook.result.current.status).toBe('listening');
    await act(async () => {
      result(
        engine,
        [
          ['First question', true],
          ['Second question', true],
        ],
        1,
      );
      jest.advanceTimersByTime(750);
    });
    act(() => ExternalUtterance.instances[0].onerror?.());
    expect(hook.result.current.error).toBe('com_ui_lecture_conversation_playback');
    expect(hook.result.current.status).toBe('listening');
  });

  it('stops and unmounts without leaving recording, timers, playback, or queued callbacks', async () => {
    const hook = mountConversation();
    const engine = hook.begin();
    await act(async () => {
      result(engine, [['Explain this', true]]);
      jest.advanceTimersByTime(750);
    });
    const queuedResult = engine.onresult;
    act(() => engine.onend?.());
    hook.unmount();
    expect(engine.abort).toHaveBeenCalledTimes(1);
    expect(synthesis.cancel).toHaveBeenCalledTimes(1);
    expect(engine.onresult).toBeNull();
    expect(ExternalUtterance.instances[0].onend).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
    await act(async () => {
      queuedResult?.({
        resultIndex: 1,
        results: [
          { isFinal: true, 0: { transcript: 'Explain this' } },
          { isFinal: true, 0: { transcript: 'Late question' } },
        ],
      });
      jest.advanceTimersByTime(5_000);
    });
    expect(hook.onQuestion).toHaveBeenCalledTimes(1);
  });
});
