import { LectureError } from './schema';

export type TranscriptEntry = { start: number; text: string };

export function parseVideoId(value: string): string {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  let videoId: string | null | undefined = null;
  if (hostname === 'youtu.be') {
    videoId = url.pathname.split('/')[1];
  } else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(hostname)) {
    videoId =
      url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
  }
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new LectureError(400, 'Provide a valid YouTube video URL.');
  }
  return videoId;
}

export function parseTranscript(value: string): TranscriptEntry[] {
  const pattern = /(?:^|\n)\s*\[?(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\]?\s*/g;
  const matches = Array.from(value.matchAll(pattern));
  const entries = matches
    .map((match, index) => {
      const hours = Number(match[1] ?? 0);
      const minutes = Number(match[2]);
      const seconds = Number(match[3]);
      if (seconds >= 60 || (match[1] && minutes >= 60)) {
        throw new LectureError(
          400,
          'Transcript timestamps must use valid MM:SS or HH:MM:SS times.',
        );
      }
      const start = hours * 3600 + minutes * 60 + seconds;
      const text = value
        .slice((match.index ?? 0) + match[0].length, matches[index + 1]?.index)
        .trim();
      return { start, text };
    })
    .filter((entry) => entry.text.length > 0);
  if (
    entries.length < 2 ||
    entries.some((entry, index) => index > 0 && entry.start < entries[index - 1].start)
  ) {
    throw new LectureError(
      400,
      'Paste a transcript with at least two increasing timestamped passages, one timestamp per line.',
    );
  }
  if (entries[entries.length - 1].start >= 86400) {
    throw new LectureError(400, 'The transcript is longer than the supported 24 hours.');
  }
  return entries;
}

export function extractDescriptionUrls(description: string): string[] {
  const matches = description.match(/https?:\/\/[^\s<>"\]]+/g) ?? [];
  const urls = new Set<string>();
  for (const match of matches) {
    const candidate = match.replace(/[),.;!?]+$/, '');
    try {
      const url = new URL(candidate);
      if (/(^|\.)(youtube\.com|youtu\.be|patreon\.com|twitter\.com|x\.com)$/i.test(url.hostname)) {
        continue;
      }
      url.hash = '';
      urls.add(url.href);
    } catch {
      continue;
    }
  }
  if (urls.size > 24) {
    throw new LectureError(
      400,
      'Use at most 24 supporting article or paper URLs in the description.',
    );
  }
  return [...urls];
}
