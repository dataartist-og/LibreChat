import { createRef } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { PlayerHandle } from '../Player';
import Player from '../Player';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));

type YouTubeEvents = {
  onReady: () => void;
  onError: () => void;
  onStateChange: (event: { data: number }) => void;
};

type YouTubeOptions = {
  videoId: string;
  playerVars: { start: number; origin: string; playsinline: number; rel: number };
  events: YouTubeEvents;
};

function createExternalPlayer() {
  let time = 0;
  let state = -1;
  return {
    getCurrentTime: jest.fn(() => time),
    getPlayerState: jest.fn(() => state),
    seekTo: jest.fn((nextTime: number, _allowSeekAhead: boolean) => {
      time = nextTime;
    }),
    playVideo: jest.fn(() => {
      state = 1;
    }),
    pauseVideo: jest.fn(() => {
      state = 2;
    }),
    destroy: jest.fn(),
    setTime: (nextTime: number) => {
      time = nextTime;
    },
    setState: (nextState: number) => {
      state = nextState;
    },
  };
}

function installYouTube() {
  const instance = createExternalPlayer();
  const options: YouTubeOptions[] = [];
  const constructor = jest.fn((_element: HTMLElement, config: YouTubeOptions) => {
    options.push(config);
    return instance;
  });
  Object.defineProperty(window, 'YT', { configurable: true, value: { Player: constructor } });
  return { instance, options, constructor };
}

function advance(milliseconds: number) {
  act(() => {
    jest.advanceTimersByTime(milliseconds);
  });
}

function mountPlayer() {
  const ref = createRef<PlayerHandle>();
  const callbacks = { onTime: jest.fn(), onPaused: jest.fn(), onPlaying: jest.fn() };
  const result = render(
    <Player ref={ref} videoId="_egu7OFem-k" initialTime={2536.8} {...callbacks} />,
  );
  return { ...result, ref, ...callbacks };
}

beforeEach(() => {
  jest.useFakeTimers();
  Reflect.deleteProperty(window, 'YT');
  document
    .querySelectorAll('script[src="https://www.youtube.com/iframe_api"]')
    .forEach((script) => script.remove());
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  Reflect.deleteProperty(window, 'YT');
});

describe('YouTube readiness and fallback', () => {
  it('loads the external API once and initializes when it becomes available', () => {
    const view = mountPlayer();
    expect(screen.getByText('com_ui_lecture_player_loading')).toBeInTheDocument();
    expect(
      document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]'),
    ).toHaveLength(1);
    advance(300);
    const api = installYouTube();
    advance(150);
    expect(api.constructor).toHaveBeenCalledTimes(1);
    expect(api.options[0].videoId).toBe('_egu7OFem-k');
    expect(api.options[0].playerVars).toEqual({
      start: 2536,
      origin: window.location.origin,
      playsinline: 1,
      rel: 0,
    });
    advance(900);
    expect(api.constructor).toHaveBeenCalledTimes(1);
    expect(
      document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]'),
    ).toHaveLength(1);
    view.unmount();
  });

  it('removes loading on ready and does not show the timeout fallback afterward', () => {
    const api = installYouTube();
    mountPlayer();
    advance(150);
    act(() => api.options[0].events.onReady());
    expect(screen.queryByText('com_ui_lecture_player_loading')).not.toBeInTheDocument();
    advance(15000);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the original timestamped video link on an API error', () => {
    const api = installYouTube();
    mountPlayer();
    advance(150);
    act(() => api.options[0].events.onError());
    expect(screen.getByRole('alert')).toHaveTextContent('com_ui_lecture_player_failed');
    expect(screen.getByRole('link', { name: 'com_ui_lecture_original' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=_egu7OFem-k&t=2536',
    );
    expect(screen.queryByText('com_ui_lecture_player_loading')).not.toBeInTheDocument();
  });

  it('falls back at 15 seconds when constructed but not ready, and recovers on late readiness', () => {
    const api = installYouTube();
    mountPlayer();
    advance(14999);
    expect(api.constructor).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    advance(1);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => api.options[0].events.onReady());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('com_ui_lecture_player_loading')).not.toBeInTheDocument();
  });

  it('falls back if the external API never becomes available', () => {
    mountPlayer();
    advance(15000);
    expect(screen.getByRole('alert')).toHaveTextContent('com_ui_lecture_player_failed');
  });
});

describe('playback and timestamp synchronization', () => {
  it('maps native playing, paused, and ended events without treating buffering as playing', () => {
    const api = installYouTube();
    const view = mountPlayer();
    advance(150);
    act(() => {
      api.options[0].events.onStateChange({ data: 1 });
      api.options[0].events.onStateChange({ data: 3 });
      api.options[0].events.onStateChange({ data: 2 });
      api.options[0].events.onStateChange({ data: 0 });
    });
    expect(view.onPlaying).toHaveBeenCalledTimes(1);
    expect(view.onPaused).toHaveBeenCalledTimes(2);
  });

  it('reports paused seeks and ended timestamps with playing=false, and skips buffering ticks', () => {
    const api = installYouTube();
    const view = mountPlayer();
    advance(150);
    act(() => api.options[0].events.onReady());
    api.instance.setTime(1314.5);
    api.instance.setState(2);
    advance(350);
    expect(view.onTime).toHaveBeenLastCalledWith(1314.5, false);
    const calls = view.onTime.mock.calls.length;
    api.instance.setState(3);
    advance(350);
    expect(view.onTime).toHaveBeenCalledTimes(calls);
    api.instance.setTime(1320);
    api.instance.setState(1);
    advance(350);
    expect(view.onTime).toHaveBeenLastCalledWith(1320, true);
    api.instance.setState(0);
    advance(350);
    expect(view.onTime).toHaveBeenLastCalledWith(1320, false);
  });

  it('keeps a seek made before API availability and pauses at that exact timestamp when ready', () => {
    const view = mountPlayer();
    act(() => view.ref.current?.seek(412.9));
    const api = installYouTube();
    advance(150);
    expect(api.options[0].playerVars.start).toBe(412);
    act(() => api.options[0].events.onReady());
    expect(api.instance.seekTo).toHaveBeenLastCalledWith(412.9, true);
    expect(api.instance.pauseVideo).toHaveBeenCalled();
    advance(350);
    expect(view.onTime).toHaveBeenLastCalledWith(412.9, false);
  });

  it('reapplies a pending seek made after construction but before readiness', () => {
    const api = installYouTube();
    const view = mountPlayer();
    advance(150);
    act(() => view.ref.current?.seek(901.25));
    api.instance.seekTo.mockClear();
    api.instance.pauseVideo.mockClear();
    act(() => api.options[0].events.onReady());
    expect(api.instance.seekTo).toHaveBeenCalledWith(901.25, true);
    expect(api.instance.pauseVideo).toHaveBeenCalledTimes(1);
  });

  it('supports imperative play, pause, and a seek that does not autoplay', () => {
    const api = installYouTube();
    const view = mountPlayer();
    advance(150);
    act(() => api.options[0].events.onReady());
    act(() => view.ref.current?.play());
    expect(api.instance.playVideo).toHaveBeenCalledTimes(1);
    act(() => view.ref.current?.pause());
    expect(api.instance.pauseVideo).toHaveBeenCalledTimes(1);
    act(() => view.ref.current?.seek(1749.5));
    expect(api.instance.seekTo).toHaveBeenLastCalledWith(1749.5, true);
    expect(api.instance.pauseVideo).toHaveBeenCalledTimes(2);
    expect(api.instance.playVideo).toHaveBeenCalledTimes(1);
  });

  it('uses current callbacks after rerender without reconstructing the player', () => {
    const api = installYouTube();
    const view = mountPlayer();
    advance(150);
    const latest = { onTime: jest.fn(), onPaused: jest.fn(), onPlaying: jest.fn() };
    view.rerender(<Player ref={view.ref} videoId="_egu7OFem-k" initialTime={2536.8} {...latest} />);
    act(() => api.options[0].events.onStateChange({ data: 1 }));
    api.instance.setState(2);
    advance(350);
    expect(latest.onPlaying).toHaveBeenCalledTimes(1);
    expect(latest.onTime).toHaveBeenCalledWith(0, false);
    expect(view.onPlaying).not.toHaveBeenCalled();
    expect(view.onTime).not.toHaveBeenCalled();
    expect(api.constructor).toHaveBeenCalledTimes(1);
  });
});

describe('player disposal', () => {
  it('destroys the external player and clears all player timers on unmount', () => {
    const api = installYouTube();
    const view = mountPlayer();
    advance(150);
    expect(jest.getTimerCount()).toBe(3);
    view.unmount();
    expect(api.instance.destroy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    advance(20000);
    expect(view.onTime).not.toHaveBeenCalled();
  });

  it('clears readiness polling and timeout if unmounted before the API loads', () => {
    const view = mountPlayer();
    view.unmount();
    expect(jest.getTimerCount()).toBe(0);
    const api = installYouTube();
    advance(20000);
    expect(api.constructor).not.toHaveBeenCalled();
  });

  it('ignores queued YouTube events after the component is disposed', () => {
    const api = installYouTube();
    const view = mountPlayer();
    advance(150);
    const events = api.options[0].events;
    view.unmount();
    act(() => {
      events.onReady();
      events.onError();
      events.onStateChange({ data: 1 });
      events.onStateChange({ data: 2 });
    });
    expect(view.onPlaying).not.toHaveBeenCalled();
    expect(view.onPaused).not.toHaveBeenCalled();
  });
});
