import { act, cleanup, renderHook } from '@testing-library/react';
import type { LectureVoiceRequest, LectureVoiceSession } from 'librechat-data-provider';
import useLiveConversation, { createVoiceTranscriptTracker } from '../useLiveConversation';

const mockStartSession = jest.fn<Promise<LectureVoiceSession>, [LectureVoiceRequest]>();
const mockStopSession = jest.fn<Promise<{ stopped: true }>, [string]>();
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('~/data-provider/Lectures', () => ({
  useLectureVoiceStartMutation: () => ({ mutateAsync: mockStartSession }),
  useLectureVoiceStopMutation: () => ({ mutateAsync: mockStopSession }),
}));

class ExternalChannel {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  close = jest.fn();
}

class ExternalPeer extends EventTarget {
  static instances: ExternalPeer[] = [];
  static initialGathering: RTCIceGatheringState = 'complete';
  iceGatheringState = ExternalPeer.initialGathering;
  connectionState: RTCPeerConnectionState = 'new';
  localDescription: RTCSessionDescriptionInit | null = null;
  ontrack: ((event: { streams: MediaStream[]; track?: MediaStreamTrack }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  channel = new ExternalChannel();
  addTrack = jest.fn();
  close = jest.fn();
  createDataChannel = jest.fn(() => this.channel);
  createOffer = jest
    .fn<Promise<RTCSessionDescriptionInit>, []>()
    .mockResolvedValue({ type: 'offer', sdp: 'local-offer' });

  setLocalDescription = jest.fn(async (description: RTCSessionDescriptionInit) => {
    this.localDescription = description;
  });

  setRemoteDescription = jest
    .fn<Promise<void>, [RTCSessionDescriptionInit]>()
    .mockResolvedValue(undefined);

  constructor() {
    super();
    ExternalPeer.instances.push(this);
  }
}

class ExternalAudio {
  static instances: ExternalAudio[] = [];
  autoplay = false;
  srcObject: MediaProvider | null = null;
  onerror: (() => void) | null = null;
  pause = jest.fn();
  removeAttribute = jest.fn();
  play = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);

  constructor() {
    ExternalAudio.instances.push(this);
  }
}

const originalPeer = Object.getOwnPropertyDescriptor(window, 'RTCPeerConnection');
const originalAudio = Object.getOwnPropertyDescriptor(window, 'Audio');
const originalMedia = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
let track: Pick<MediaStreamTrack, 'stop' | 'onended'>;
let stream: MediaStream;
let getMicrophone: jest.Mock<Promise<MediaStream>, [MediaStreamConstraints]>;

beforeEach(() => {
  jest.useFakeTimers();
  mockStartSession.mockReset().mockResolvedValue({ sessionId: 'voice-1', sdp: 'remote-answer' });
  mockStopSession.mockReset().mockResolvedValue({ stopped: true });
  ExternalPeer.instances = [];
  ExternalPeer.initialGathering = 'complete';
  ExternalAudio.instances = [];
  track = { stop: jest.fn(), onended: null };
  stream = { getTracks: () => [track as MediaStreamTrack] } as MediaStream;
  getMicrophone = jest.fn().mockResolvedValue(stream);
  Object.defineProperty(window, 'RTCPeerConnection', { configurable: true, value: ExternalPeer });
  Object.defineProperty(window, 'Audio', { configurable: true, value: ExternalAudio });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: getMicrophone },
  });
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
  for (const [target, name, descriptor] of [
    [window, 'RTCPeerConnection', originalPeer],
    [window, 'Audio', originalAudio],
    [navigator, 'mediaDevices', originalMedia],
  ] as const) {
    if (descriptor) {
      Object.defineProperty(target, name, descriptor);
    } else {
      Reflect.deleteProperty(target, name);
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

function mountLive() {
  const onExchange = jest.fn();
  const options = {
    lecture: {
      id: 'lecture',
      title: 'Lecture',
      videoId: 'video',
      description: '',
      duration: 100,
      sources: [],
      moments: [],
    },
    momentId: 'moment',
    sourceId: 'source',
    onExchange,
    onActivity: jest.fn(),
  };
  const hook = renderHook((props) => useLiveConversation(props), { initialProps: options });
  const begin = async () => {
    await act(async () => hook.result.current.start());
    const peer = ExternalPeer.instances[0];
    act(() => peer.channel.onopen?.());
    return peer;
  };
  return { ...hook, options, onExchange, begin };
}

describe('native transcript correlation', () => {
  it('pairs Codex v3 turn IDs and never attaches an interrupted old answer to a new question', () => {
    const exchange = jest.fn();
    const receive = createVoiceTranscriptTracker(exchange);
    receive({ type: 'turn.created', turn: { id: 'greeting', role: 'assistant' } });
    receive({
      type: 'turn.done',
      turn: { id: 'greeting', role: 'assistant', transcript: 'Hello' },
    });
    receive({ type: 'turn.done', turn: { id: 'u1', role: 'user', transcript: 'First question' } });
    receive({ type: 'turn.created', turn: { id: 'a1', role: 'assistant' } });
    receive({ type: 'input_transcript.added', item: { text: 'Actually' } });
    receive({
      type: 'turn.done',
      turn: { id: 'u2', role: 'user', transcript: 'Actually explain the figure' },
    });
    receive({
      type: 'turn.done',
      turn: { id: 'a1', role: 'assistant', transcript: 'Late interrupted answer' },
    });
    receive({ type: 'turn.created', turn: { id: 'a2', role: 'assistant' } });
    receive({
      type: 'turn.done',
      turn: { id: 'a2', role: 'assistant', transcript: 'Figure explanation' },
    });
    receive({
      type: 'turn.done',
      turn: { id: 'a2', role: 'assistant', transcript: 'Duplicate final event' },
    });
    expect(exchange.mock.calls).toEqual([['Actually explain the figure', 'Figure explanation']]);
  });

  it('waits for delayed native user transcription and omits uncorrelated native turns', () => {
    const exchange = jest.fn();
    const receive = createVoiceTranscriptTracker(exchange);
    receive({ type: 'turn.created', turn: { id: 'u1', role: 'user' } });
    receive({ type: 'turn.created', turn: { id: 'a1', role: 'assistant' } });
    receive({ type: 'turn.done', turn: { id: 'a1', role: 'assistant', transcript: 'Answer' } });
    expect(exchange).not.toHaveBeenCalled();
    receive({ type: 'turn.done', turn: { id: 'u1', role: 'user', transcript: 'Question' } });
    receive({
      type: 'turn.done',
      turn: { id: 'unseen', role: 'assistant', transcript: 'Uncorrelated' },
    });
    receive({ type: 'turn.done', turn: { role: 'user', transcript: 'No ID' } });
    receive({ type: 'turn.done', turn: { role: 'assistant', transcript: 'No ID answer' } });
    expect(exchange.mock.calls).toEqual([['Question', 'Answer']]);
  });

  it('pairs delayed input transcriptions by committed item and response IDs, never by arrival order', () => {
    const exchange = jest.fn();
    const receive = createVoiceTranscriptTracker(exchange);
    receive({ type: 'input_audio_buffer.committed', item_id: 'u1' });
    receive({ type: 'response.created', response: { id: 'r1' } });
    receive({
      type: 'response.output_audio_transcript.done',
      response_id: 'r1',
      transcript: 'Answer one',
    });
    receive({ type: 'response.done', response: { id: 'r1', status: 'completed' } });
    receive({ type: 'input_audio_buffer.committed', item_id: 'u2' });
    receive({ type: 'response.created', response: { id: 'r2' } });
    receive({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'u2',
      transcript: 'Question two',
    });
    receive({
      type: 'response.audio_transcript.done',
      response_id: 'r2',
      transcript: 'Answer two',
    });
    receive({ type: 'response.done', response: { id: 'r2', status: 'completed' } });
    receive({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'u1',
      transcript: 'Question one',
    });
    expect(exchange.mock.calls).toEqual([
      ['Question two', 'Answer two'],
      ['Question one', 'Answer one'],
    ]);
    receive({
      type: 'response.output_audio_transcript.done',
      response_id: 'r1',
      transcript: 'Duplicate answer',
    });
    expect(exchange).toHaveBeenCalledTimes(2);
  });

  it('does not save greetings, canceled responses, or uncorrelated transcripts as completed exchanges', () => {
    const exchange = jest.fn();
    const receive = createVoiceTranscriptTracker(exchange);
    receive({ type: 'response.created', response: { id: 'greeting' } });
    receive({
      type: 'response.audio_transcript.done',
      response_id: 'greeting',
      transcript: 'Hello',
    });
    receive({ type: 'response.done', response: { id: 'greeting', status: 'completed' } });
    receive({ type: 'conversation.item.created', item: { id: 'u1', role: 'user' } });
    receive({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'u1',
      transcript: 'Question',
    });
    receive({ type: 'response.created', response: { id: 'canceled' } });
    receive({
      type: 'response.audio_transcript.done',
      response_id: 'canceled',
      transcript: 'Unfinished',
    });
    receive({ type: 'response.done', response: { id: 'canceled', status: 'cancelled' } });
    receive({
      type: 'response.audio_transcript.done',
      response_id: 'unknown',
      transcript: 'Unpaired',
    });
    expect(exchange).not.toHaveBeenCalled();
  });
});

describe('native voice lifecycle', () => {
  it('understands native Codex v3 transcript and audio events over the data channel', async () => {
    const hook = mountLive();
    const peer = await hook.begin();
    const receive = (event: object) => peer.channel.onmessage?.({ data: JSON.stringify(event) });
    act(() => {
      receive({ type: 'session.started' });
      receive({ type: 'input_transcript.added', item: { text: 'What is a feature?' } });
      receive({
        type: 'turn.done',
        turn: { id: 'u1', role: 'user', transcript: 'What is a feature?' },
      });
    });
    expect(hook.result.current.status).toBe('thinking');
    act(() => {
      receive({ type: 'turn.created', turn: { id: 'a1', role: 'assistant' } });
      receive({ type: 'output_transcript.added', item: { text: 'It is' } });
    });
    expect(hook.result.current.status).toBe('speaking');
    act(() =>
      receive({
        type: 'turn.done',
        turn: { id: 'a1', role: 'assistant', transcript: 'It is an activation pattern.' },
      }),
    );
    expect(hook.onExchange).toHaveBeenCalledWith(
      'What is a feature?',
      'It is an activation pattern.',
    );
    expect(hook.result.current.status).toBe('listening');
  });

  it('waits for opt-in, sends only SDP and source context, and attaches the remote media stream', async () => {
    const hook = mountLive();
    expect(getMicrophone).not.toHaveBeenCalled();
    expect(mockStartSession).not.toHaveBeenCalled();
    expect(hook.result.current.supported).toBe(true);
    const peer = await hook.begin();
    expect(getMicrophone).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    expect(peer.addTrack).toHaveBeenCalledWith(track, stream);
    expect(peer.createDataChannel).toHaveBeenCalledWith('oai-events');
    expect(mockStartSession).toHaveBeenCalledWith({
      lecture: hook.options.lecture,
      momentId: 'moment',
      sourceId: 'source',
      focus: undefined,
      sdp: 'local-offer',
    });
    expect(peer.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'remote-answer',
    });
    await act(async () => peer.ontrack?.({ streams: [stream] }));
    expect(ExternalAudio.instances[0].srcObject).toBe(stream);
    expect(ExternalAudio.instances[0].play).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toBe('listening');
    expect(jest.getTimerCount()).toBe(0);
    await act(async () => hook.result.current.start());
    expect(mockStartSession).toHaveBeenCalledTimes(1);
  });

  it('forwards completed exchanges and follows native speech state without an extra tutor request', async () => {
    const hook = mountLive();
    const peer = await hook.begin();
    const receive = (event: object) => peer.channel.onmessage?.({ data: JSON.stringify(event) });
    act(() => {
      receive({ type: 'input_audio_buffer.committed', item_id: 'user' });
      receive({ type: 'response.created', response: { id: 'answer' } });
    });
    expect(hook.result.current.status).toBe('thinking');
    act(() => receive({ type: 'output_audio_buffer.started' }));
    expect(hook.result.current.status).toBe('speaking');
    act(() => {
      receive({
        type: 'response.output_audio_transcript.done',
        response_id: 'answer',
        transcript: 'Explanation',
      });
      receive({ type: 'response.done', response: { id: 'answer', status: 'completed' } });
      receive({
        type: 'conversation.item.input_audio_transcription.completed',
        item_id: 'user',
        transcript: 'Question',
      });
      receive({ type: 'input_audio_buffer.speech_started' });
    });
    expect(hook.onExchange).toHaveBeenCalledWith('Question', 'Explanation');
    expect(hook.result.current.status).toBe('listening');
    expect(mockStartSession).toHaveBeenCalledTimes(1);
    expect(peer.close).not.toHaveBeenCalled();
    act(() => peer.channel.onmessage?.({ data: 'malformed event' }));
    expect(hook.result.current.error).toBe('');
  });

  it('releases microphone, peer, channel, playback, timers, and backend session on stop', async () => {
    const hook = mountLive();
    const peer = await hook.begin();
    const queued = peer.channel.onmessage;
    await act(async () => hook.result.current.stop());
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(track.onended).toBeNull();
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(peer.channel.close).toHaveBeenCalledTimes(1);
    expect(peer.channel.onmessage).toBeNull();
    expect(ExternalAudio.instances[0].pause).toHaveBeenCalledTimes(1);
    expect(ExternalAudio.instances[0].srcObject).toBeNull();
    expect(mockStopSession).toHaveBeenCalledWith('voice-1');
    expect(hook.result.current.active).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
    act(() =>
      queued?.({ data: JSON.stringify({ type: 'response.created', response: { id: 'late' } }) }),
    );
    expect(hook.result.current.status).toBe('idle');
  });

  it('closes a late backend session after the user stops while SDP is pending', async () => {
    const pending = deferred<LectureVoiceSession>();
    mockStartSession.mockReturnValueOnce(pending.promise);
    const hook = mountLive();
    await act(async () => {
      void hook.result.current.start();
    });
    const peer = ExternalPeer.instances[0];
    act(() => hook.result.current.stop());
    await act(async () => pending.resolve({ sessionId: 'late-session', sdp: 'late-answer' }));
    expect(mockStopSession).toHaveBeenCalledWith('late-session');
    expect(peer.setRemoteDescription).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('releases late microphone grants after unmount without creating a voice session', async () => {
    const pending = deferred<MediaStream>();
    getMicrophone.mockReturnValueOnce(pending.promise);
    const hook = mountLive();
    act(() => {
      void hook.result.current.start();
    });
    hook.unmount();
    await act(async () => pending.resolve(stream));
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(mockStartSession).not.toHaveBeenCalled();
    expect(ExternalPeer.instances).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stops on context changes so a live session cannot retain the previous paper context', async () => {
    const hook = mountLive();
    await hook.begin();
    await act(async () => hook.rerender({ ...hook.options, sourceId: 'another-source' }));
    expect(hook.result.current.active).toBe(false);
    expect(mockStopSession).toHaveBeenCalledWith('voice-1');
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('reports microphone denial and connection failure without leaving capture enabled', async () => {
    getMicrophone.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    const hook = mountLive();
    await act(async () => hook.result.current.start());
    expect(hook.result.current.error).toBe('com_ui_lecture_live_microphone');
    expect(hook.result.current.active).toBe(false);
    expect(mockStartSession).not.toHaveBeenCalled();
    await hook.begin();
    const peer = ExternalPeer.instances[0];
    await act(async () => {
      peer.connectionState = 'failed';
      peer.onconnectionstatechange?.();
    });
    expect(hook.result.current.error).toBe('com_ui_lecture_live_connection');
    expect(mockStopSession).toHaveBeenCalledWith('voice-1');
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('allows brief network recovery but closes prolonged disconnections', async () => {
    const hook = mountLive();
    const peer = await hook.begin();
    act(() => {
      peer.connectionState = 'disconnected';
      peer.onconnectionstatechange?.();
      jest.advanceTimersByTime(2_000);
      peer.connectionState = 'connected';
      peer.onconnectionstatechange?.();
      jest.advanceTimersByTime(5_000);
    });
    expect(hook.result.current.active).toBe(true);
    await act(async () => {
      peer.connectionState = 'disconnected';
      peer.onconnectionstatechange?.();
      jest.advanceTimersByTime(5_000);
    });
    expect(hook.result.current.active).toBe(false);
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('fails clearly when remote audio cannot play and when data-channel startup times out', async () => {
    const hook = mountLive();
    const peer = await hook.begin();
    ExternalAudio.instances[0].play.mockRejectedValueOnce(new Error('Blocked'));
    await act(async () => peer.ontrack?.({ streams: [stream] }));
    expect(hook.result.current.error).toBe('com_ui_lecture_live_playback');
    expect(hook.result.current.active).toBe(false);
    await act(async () => hook.result.current.start());
    await act(async () => jest.advanceTimersByTime(75_000));
    expect(hook.result.current.error).toBe('com_ui_lecture_live_connection');
    expect(hook.result.current.active).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('waits for ICE candidates and permits a slow paper bootstrap within the startup deadline', async () => {
    ExternalPeer.initialGathering = 'gathering';
    const pending = deferred<LectureVoiceSession>();
    mockStartSession.mockReturnValueOnce(pending.promise);
    const hook = mountLive();
    await act(async () => {
      void hook.result.current.start();
    });
    const peer = ExternalPeer.instances[0];
    expect(mockStartSession).not.toHaveBeenCalled();
    await act(async () => {
      peer.iceGatheringState = 'complete';
      peer.dispatchEvent(new Event('icegatheringstatechange'));
    });
    act(() => jest.advanceTimersByTime(45_000));
    expect(hook.result.current.active).toBe(true);
    await act(async () => pending.resolve({ sessionId: 'slow', sdp: 'answer' }));
    act(() => peer.channel.onopen?.());
    expect(hook.result.current.status).toBe('listening');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cancels ICE gathering listeners and timers on stop before creating a backend session', async () => {
    ExternalPeer.initialGathering = 'gathering';
    const hook = mountLive();
    await act(async () => {
      void hook.result.current.start();
    });
    const peer = ExternalPeer.instances[0];
    await act(async () => hook.result.current.stop());
    expect(jest.getTimerCount()).toBe(0);
    act(() => {
      peer.iceGatheringState = 'complete';
      peer.dispatchEvent(new Event('icegatheringstatechange'));
    });
    expect(mockStartSession).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });
});
