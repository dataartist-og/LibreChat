import { z } from 'zod';
import { load } from 'cheerio';
import fetch from 'node-fetch';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import type { LectureYouTubeResponse } from 'librechat-data-provider';
import type { Agent, AgentOptions } from 'node:http';
import { createSSRFSafeAgents } from '~/auth/agent';
import { extractDescriptionUrls, parseTranscript, parseVideoId } from './transcript';
import { LectureError } from './schema';

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 160000;
const requestSchema = z.object({ videoUrl: z.string().url().max(2048) }).strict();
const trackSchema = z.object({ ext: z.string(), url: z.string().url().max(16000) });
const metadataSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().nullish(),
  duration: z.number().finite().nonnegative().nullish(),
  availability: z.string().nullish(),
  is_live: z.boolean().optional(),
  http_headers: z.record(z.string().max(4000)).optional(),
  subtitles: z.record(z.array(trackSchema).max(24)).nullish(),
  automatic_captions: z.record(z.array(trackSchema).max(24)).nullish(),
});
const jsonCaptionSchema = z.object({
  events: z
    .array(
      z.object({
        tStartMs: z.number().finite().nonnegative().optional(),
        dDurationMs: z.number().finite().nonnegative().optional(),
        segs: z
          .array(z.object({ utf8: z.string().optional() }))
          .max(4000)
          .optional(),
      }),
    )
    .max(100000),
});
type YouTubeMetadata = z.infer<typeof metadataSchema>;
export type CaptionTrack = {
  language: string;
  kind: 'manual' | 'automatic';
  ext: 'json3' | 'vtt';
  url: string;
  headers?: { 'User-Agent'?: string; Referer?: string };
};
type CaptionCue = { start: number; end: number; text: string };
type LookupAgent = Agent & { options: AgentOptions };

export function youtubeCommand(videoUrl: string): { file: string; args: string[] } {
  const videoId = parseVideoId(videoUrl);
  return {
    file: process.env.LECTURE_YTDLP_PATH || process.env.LECTURE_PYTHON || 'python3',
    args: [
      ...(process.env.LECTURE_YTDLP_PATH ? [] : ['-m', 'yt_dlp']),
      '--ignore-config',
      '--no-plugin-dirs',
      '--no-playlist',
      '--skip-download',
      '--dump-single-json',
      '--quiet',
      '--no-warnings',
      '--no-cache-dir',
      '--socket-timeout',
      '10',
      '--retries',
      '0',
      '--extractor-retries',
      '0',
      '--ignore-no-formats-error',
      '--',
      `https://www.youtube.com/watch?v=${videoId}`,
    ],
  };
}

export function loadYouTubeMetadata(videoUrl: string, signal?: AbortSignal): Promise<string> {
  const command = youtubeCommand(videoUrl);
  const environment = Object.fromEntries(
    [
      'PATH',
      'HOME',
      'USERPROFILE',
      'SystemRoot',
      'LANG',
      'LC_ALL',
      'VIRTUAL_ENV',
      'PYTHONPATH',
    ].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
  );
  return new Promise((resolve, reject) => {
    execFile(
      command.file,
      command.args,
      {
        encoding: 'utf8',
        timeout: 45000,
        maxBuffer: MAX_BYTES,
        signal,
        windowsHide: true,
        env: environment,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }
        if (signal?.aborted) {
          reject(new LectureError(499, 'YouTube import was cancelled.'));
          return;
        }
        if (error.code === 'ENOENT' || /No module named yt_dlp/i.test(stderr)) {
          reject(
            new LectureError(
              503,
              'Automatic YouTube import needs yt-dlp on the server. Install it for the configured Python, or paste the transcript and description manually.',
            ),
          );
          return;
        }
        reject(
          new LectureError(
            422,
            'YouTube metadata could not be retrieved publicly within the import limits. The video may be restricted or temporarily blocked. Paste its transcript and description manually.',
          ),
        );
      },
    );
  });
}

export function parseYouTubeMetadata(value: string, videoId: string): YouTubeMetadata {
  let parsed: YouTubeMetadata;
  try {
    parsed = metadataSchema.parse(JSON.parse(value));
  } catch {
    throw new LectureError(
      422,
      'YouTube returned unreadable metadata. Paste the transcript and description manually.',
    );
  }
  if (parsed.id !== videoId || parsed.is_live || (parsed.duration ?? 0) >= 86400) {
    throw new LectureError(
      422,
      'Import supports completed individual videos shorter than 24 hours. Paste a bounded transcript manually.',
    );
  }
  if (parsed.availability && !['public', 'unlisted'].includes(parsed.availability)) {
    throw new LectureError(
      422,
      'This video is not publicly accessible. Automatic import does not use account cookies or sign-in. Paste a transcript you can access manually.',
    );
  }
  return parsed;
}

export function selectCaptionTrack(metadata: YouTubeMetadata): CaptionTrack | undefined {
  const userAgent = metadata.http_headers?.['User-Agent'] ?? metadata.http_headers?.['user-agent'];
  const headers: CaptionTrack['headers'] = {
    Referer: `https://www.youtube.com/watch?v=${metadata.id}`,
    ...(userAgent && userAgent.length <= 1000 && !/[\r\n]/.test(userAgent)
      ? { 'User-Agent': userAgent }
      : {}),
  };
  const groups: { kind: CaptionTrack['kind']; tracks: YouTubeMetadata['subtitles'] }[] = [
    { kind: 'manual', tracks: metadata.subtitles },
    { kind: 'automatic', tracks: metadata.automatic_captions },
  ];
  return groups
    .flatMap(({ kind, tracks }) =>
      Object.entries(tracks ?? {}).flatMap(([language, formats]) => {
        if (language === 'live_chat') return [];
        const track =
          formats.find((format) => format.ext === 'json3') ??
          formats.find((format) => format.ext === 'vtt');
        if (!track || (track.ext !== 'json3' && track.ext !== 'vtt')) return [];
        const english = /^en(?:-|$)/i.test(language);
        const rank = (english ? 0 : 2) + (kind === 'manual' ? 0 : 1);
        const selected: CaptionTrack & { rank: number } = {
          language,
          kind,
          ext: track.ext,
          url: track.url,
          rank,
          headers,
        };
        return [selected];
      }),
    )
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        Number(right.language.endsWith('-orig')) - Number(left.language.endsWith('-orig')) ||
        left.language.localeCompare(right.language),
    )[0];
}

export function assertCaptionUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !(url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com')) ||
    !['/api/timedtext', '/timedtext'].includes(url.pathname)
  ) {
    throw new LectureError(
      422,
      'YouTube returned an unsupported caption URL. Paste the transcript manually.',
    );
  }
  return url;
}

export async function loadYouTubeCaptions(
  track: CaptionTrack,
  signal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 15000);
  const agents = createSSRFSafeAgents();
  (agents.httpAgent as LookupAgent).options.family = 4;
  (agents.httpsAgent as LookupAgent).options.family = 4;
  let current = track.url;
  try {
    for (let hop = 0; hop <= 2; hop++) {
      const url = assertCaptionUrl(current);
      const response = await fetch(url.href, {
        redirect: 'manual',
        signal: controller.signal,
        size: MAX_BYTES,
        agent: agents.httpsAgent,
        headers: { Accept: 'application/json,text/vtt,text/plain', ...track.headers },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (response.body instanceof Readable) response.body.destroy();
        const location = response.headers.get('location');
        if (!location || hop === 2) break;
        current = new URL(location, url).href;
        continue;
      }
      if (!response.ok || Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) {
        if (response.body instanceof Readable) response.body.destroy();
        if (response.status === 429) {
          throw new LectureError(
            422,
            'YouTube is rate-limiting public caption requests. Try again later or paste the transcript manually; video details and description links were still imported.',
          );
        }
        break;
      }
      return await response.text();
    }
  } catch (error) {
    if (error instanceof LectureError) throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    agents.httpAgent.destroy();
    agents.httpsAgent.destroy();
  }
  throw new LectureError(
    signal?.aborted ? 499 : 422,
    signal?.aborted
      ? 'YouTube import was cancelled.'
      : 'Public YouTube captions could not be retrieved. They may be unavailable or rate-limited. Paste the transcript manually.',
  );
}

function captionText(value: string): string {
  return load(value, undefined, false).text().replace(/\s+/g, ' ').trim();
}

function vttTime(value: string): number {
  return value.split(':').reduce((time, part) => time * 60 + Number(part), 0);
}

export function parseCaptionTranscript(value: string, format: CaptionTrack['ext']): string {
  let cues: CaptionCue[];
  try {
    if (format === 'json3') {
      cues = jsonCaptionSchema.parse(JSON.parse(value)).events.flatMap((event) => {
        if (event.tStartMs === undefined || !event.segs) return [];
        return [
          {
            start: event.tStartMs / 1000,
            end: (event.tStartMs + (event.dDurationMs ?? 0)) / 1000,
            text: captionText(event.segs.map((segment) => segment.utf8 ?? '').join('')),
          },
        ];
      });
    } else {
      const matches = [
        ...value.matchAll(
          /((?:\d{2,}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{2,}:)?\d{2}:\d{2}\.\d{3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g,
        ),
      ];
      cues = matches.map((match) => ({
        start: vttTime(match[1]),
        end: vttTime(match[2]),
        text: captionText(match[3]),
      }));
    }
  } catch {
    throw new LectureError(
      422,
      'The caption track could not be parsed. Paste a timestamped transcript manually.',
    );
  }
  const entries: { start: number; text: string }[] = [];
  let previous: CaptionCue | undefined;
  for (const cue of cues) {
    if (!cue.text || cue.start >= 86400) continue;
    if (previous && cue.start < previous.start) continue;
    let text = cue.text;
    if (previous && cue.start < previous.end) {
      if (text === previous.text) continue;
      if (text.startsWith(`${previous.text} `)) text = text.slice(previous.text.length).trim();
    }
    const start = Math.floor(cue.start);
    const last = entries[entries.length - 1];
    if (last?.start === start) last.text += ` ${text}`;
    else entries.push({ start, text });
    previous = cue;
  }
  const transcript = entries
    .map(({ start, text }) => {
      const hours = Math.floor(start / 3600);
      const minutes = Math.floor((start % 3600) / 60);
      const seconds = start % 60;
      return `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} ${text}`;
    })
    .join('\n');
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    throw new LectureError(
      422,
      'The transcript exceeds the 160,000-character indexing limit. Import a shorter video or paste a bounded transcript manually.',
    );
  }
  if (entries.length < 2 || transcript.length < 20) {
    throw new LectureError(
      422,
      'The caption track has too little timestamped speech to index. Paste a transcript manually.',
    );
  }
  parseTranscript(transcript);
  return transcript;
}

export async function importYouTubeLecture(
  input: unknown,
  signal?: AbortSignal,
  dependencies = { metadata: loadYouTubeMetadata, captions: loadYouTubeCaptions },
): Promise<LectureYouTubeResponse> {
  const { videoUrl } = requestSchema.parse(input);
  const videoId = parseVideoId(videoUrl);
  const canonical = `https://www.youtube.com/watch?v=${videoId}`;
  const metadata = parseYouTubeMetadata(await dependencies.metadata(canonical, signal), videoId);
  const track = selectCaptionTrack(metadata);
  const description = (metadata.description ?? '').slice(0, 30000);
  const sourceUrls = extractDescriptionUrls(description);
  const warnings: string[] = [];
  let transcript = '';
  if (!track) {
    warnings.push(
      'This video has no accessible caption track. Video details and supporting links were imported; paste a timestamped transcript manually.',
    );
  }
  if (track) {
    try {
      transcript = parseCaptionTranscript(await dependencies.captions(track, signal), track.ext);
    } catch (error) {
      if (signal?.aborted || (error instanceof LectureError && error.status === 499)) throw error;
      warnings.push(
        error instanceof LectureError
          ? error.message
          : 'Captions could not be imported. Video details and supporting links were imported; paste a timestamped transcript manually.',
      );
    }
  }
  if (transcript && track?.kind === 'automatic')
    warnings.push(
      'These captions were generated automatically and may contain transcription errors.',
    );
  if (transcript && track && !/^en(?:-|$)/i.test(track.language))
    warnings.push(`No English captions were available; imported ${track.language} captions.`);
  if (transcript && track && new URL(track.url).searchParams.has('tlang'))
    warnings.push(
      'This caption track is automatically translated; technical terminology may be inaccurate.',
    );
  if (!sourceUrls.length)
    warnings.push(
      'No supporting source URLs were found in the description. Add research links before indexing.',
    );
  if ((metadata.description?.length ?? 0) > 30000)
    warnings.push('The description was shortened to the 30,000-character limit.');
  return {
    title: metadata.title.slice(0, 400),
    videoUrl: canonical,
    description,
    transcript,
    transcriptKind: transcript && track ? track.kind : 'unavailable',
    language: transcript && track ? track.language : '',
    sourceUrls,
    warnings,
  };
}
