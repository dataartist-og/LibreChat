import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useLocalize } from '~/hooks';

export type PlayerHandle = {
  pause: () => void;
  play: () => void;
  seek: (time: number) => void;
  time: () => number;
};
type YouTubePlayer = {
  getCurrentTime: () => number;
  getPlayerState: () => number;
  seekTo: (time: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
};
type YouTubeWindow = Window & {
  YT?: {
    Player: new (
      element: HTMLElement,
      options: {
        videoId: string;
        width: string;
        height: string;
        playerVars: { start: number; origin: string; playsinline: number; rel: number };
        events: {
          onReady: () => void;
          onError: () => void;
          onStateChange: (event: { data: number }) => void;
        };
      },
    ) => YouTubePlayer;
  };
};

const Player = forwardRef<
  PlayerHandle,
  {
    videoId: string;
    initialTime: number;
    onTime: (time: number, playing: boolean) => void;
    onPaused: () => void;
    onPlaying: () => void;
  }
>(({ videoId, initialTime, onTime, onPlaying, onPaused }, ref) => {
  const localize = useLocalize();
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YouTubePlayer | null>(null);
  const callbacks = useRef({ onTime, onPlaying, onPaused });
  callbacks.current = { onTime, onPlaying, onPaused };
  const initial = useRef(initialTime);
  const pendingSeek = useRef(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useImperativeHandle(
    ref,
    () => ({
      pause: () => player.current?.pauseVideo(),
      time: () => player.current?.getCurrentTime?.() ?? initial.current,
      play: () => player.current?.playVideo(),
      seek: (time) => {
        initial.current = time;
        pendingSeek.current = true;
        player.current?.seekTo(time, true);
        player.current?.pauseVideo();
      },
    }),
    [],
  );
  useEffect(() => {
    const win = window as YouTubeWindow;
    let disposed = false;
    let initialized = false;
    let loaded = false;
    const interval = window.setInterval(() => {
      if (!win.YT?.Player || initialized || disposed || !host.current) {
        return;
      }
      initialized = true;
      const node = document.createElement('div');
      host.current.replaceChildren(node);
      player.current = new win.YT.Player(node, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          start: Math.floor(initial.current),
          origin: window.location.origin,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            if (!disposed) {
              loaded = true;
              setReady(true);
              if (pendingSeek.current) {
                player.current?.seekTo(initial.current, true);
                player.current?.pauseVideo();
              }
              setFailed(false);
            }
          },
          onError: () => {
            if (!disposed) {
              setFailed(true);
            }
          },
          onStateChange: ({ data }) => {
            if (disposed) {
              return;
            }
            if (data === 1) {
              callbacks.current.onPlaying();
            } else if (data === 2 || data === 0) {
              callbacks.current.onPaused();
            }
          },
        },
      });
    }, 150);
    if (
      !win.YT?.Player &&
      !document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
    ) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }
    const timeout = window.setTimeout(() => {
      if (!loaded) {
        setFailed(true);
      }
    }, 15000);
    const clock = window.setInterval(() => {
      const state = player.current?.getPlayerState?.();
      if (player.current && (state === 1 || state === 2 || state === 0)) {
        callbacks.current.onTime(player.current.getCurrentTime(), state === 1);
      }
    }, 350);
    return () => {
      disposed = true;
      clearInterval(interval);
      clearInterval(clock);
      clearTimeout(timeout);
      player.current?.destroy();
      player.current = null;
    };
  }, [videoId]);
  return (
    <div>
      <div className="lecture-video" ref={host} />
      {!ready && !failed && (
        <p className="lecture-muted">{localize('com_ui_lecture_player_loading')}</p>
      )}
      {failed && (
        <p role="alert">
          {localize('com_ui_lecture_player_failed')}{' '}
          <a
            href={`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(initialTime)}`}
            target="_blank"
            rel="noreferrer"
          >
            {localize('com_ui_lecture_original')}
          </a>
        </p>
      )}
    </div>
  );
});
Player.displayName = 'LecturePlayer';
export default Player;
