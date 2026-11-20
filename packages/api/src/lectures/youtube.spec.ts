import {
  assertCaptionUrl,
  importYouTubeLecture,
  parseCaptionTranscript,
  parseYouTubeMetadata,
  selectCaptionTrack,
  youtubeCommand,
} from './youtube';
import { LectureError } from './schema';

const videoId = '_egu7OFem-k';
const canonical = `https://www.youtube.com/watch?v=${videoId}`;
const captionUrl = 'https://www.youtube.com/api/timedtext?v=_egu7OFem-k&lang=en&fmt=json3';
const track = { ext: 'json3', url: captionUrl };
const metadata = {
  id: videoId,
  title: 'A research interview',
  description:
    'Research https://arxiv.org/abs/2604.28119 and https://example.com/research\nVideo https://youtu.be/_egu7OFem-k',
  duration: 100,
  availability: 'public',
  subtitles: { 'en-GB': [track] },
  automatic_captions: { 'en-orig': [track] },
};
const captions = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'An opening explanation.' }] },
    {
      tStartMs: 2500,
      dDurationMs: 3000,
      segs: [{ utf8: 'A second ' }, { utf8: 'technical point.' }],
    },
    { tStartMs: 62000, dDurationMs: 2000, segs: [{ utf8: 'Later evidence and results.' }] },
  ],
});

describe('public YouTube import', () => {
  it('uses canonical individual-video arguments and never requests media, account cookies, or local configuration', () => {
    const command = youtubeCommand('https://youtu.be/_egu7OFem-k?t=400&list=playlist');
    expect(command.args).toEqual(
      expect.arrayContaining([
        '--ignore-config',
        '--no-plugin-dirs',
        '--no-playlist',
        '--skip-download',
        '--dump-single-json',
      ]),
    );
    expect(command.args[command.args.length - 1]).toBe(canonical);
    expect(command.args).not.toEqual(
      expect.arrayContaining([
        '--cookies',
        '--cookies-from-browser',
        '--netrc',
        '--write-info-json',
        '--exec',
      ]),
    );
    expect(() => youtubeCommand('https://evil.example/watch?v=_egu7OFem-k')).toThrow(
      'valid YouTube',
    );
  });

  it('prioritizes manual English, then automatic English, then another available language', () => {
    expect(selectCaptionTrack(metadata)).toMatchObject({
      language: 'en-GB',
      kind: 'manual',
      ext: 'json3',
    });
    expect(selectCaptionTrack({ ...metadata, subtitles: { fr: [track] } })).toMatchObject({
      language: 'en-orig',
      kind: 'automatic',
    });
    expect(
      selectCaptionTrack({ ...metadata, subtitles: { fr: [track] }, automatic_captions: {} }),
    ).toMatchObject({ language: 'fr', kind: 'manual' });
    expect(
      selectCaptionTrack({
        ...metadata,
        subtitles: { live_chat: [track] },
        automatic_captions: {},
      }),
    ).toBeUndefined();
  });

  it('forwards only public transport headers from metadata, never cookies or authorization', () => {
    const selected = selectCaptionTrack({
      ...metadata,
      http_headers: {
        'User-Agent': 'Public caption client',
        Cookie: 'ignored',
        Authorization: 'ignored',
      },
    });
    expect(selected?.headers).toEqual({
      'User-Agent': 'Public caption client',
      Referer: canonical,
    });
  });

  it('preserves timestamps, joins word segments, and creates a transcript accepted by the indexer', () => {
    expect(parseCaptionTranscript(captions, 'json3')).toBe(
      '00:00 An opening explanation.\n00:02 A second technical point.\n01:02 Later evidence and results.',
    );
  });

  it('parses VTT, decodes markup, and removes overlapping repeated caption prefixes', () => {
    const vtt =
      'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<c>Hello &amp; welcome</c>\n\n00:00:01.000 --> 00:00:03.000\nHello &amp; welcome to the lecture\n\n00:01:02.000 --> 00:01:04.000\nA separate technical point.\n';
    expect(parseCaptionTranscript(vtt, 'vtt')).toBe(
      '00:00 Hello & welcome\n00:01 to the lecture\n01:02 A separate technical point.',
    );
  });

  it('does not silently truncate an oversized transcript or treat an empty response as captions', () => {
    expect(() => parseCaptionTranscript('', 'json3')).toThrow('could not be parsed');
    expect(() => parseCaptionTranscript('WEBVTT\n', 'vtt')).toThrow('too little');
    const huge = JSON.stringify({
      events: [
        { tStartMs: 0, segs: [{ utf8: 'a'.repeat(160000) }] },
        { tStartMs: 3000, segs: [{ utf8: 'A final explanation.' }] },
      ],
    });
    expect(() => parseCaptionTranscript(huge, 'json3')).toThrow('160,000-character');
  });

  it('refuses restricted videos, active streams, mismatched IDs, and excessive duration', () => {
    for (const extra of [
      { availability: 'needs_auth' },
      { availability: 'private' },
      { is_live: true },
      { duration: 86400 },
      { id: 'different' },
    ]) {
      expect(() =>
        parseYouTubeMetadata(JSON.stringify({ ...metadata, ...extra }), videoId),
      ).toThrow();
    }
    expect(
      parseYouTubeMetadata(JSON.stringify({ ...metadata, availability: 'unlisted' }), videoId)
        .title,
    ).toBe(metadata.title);
  });

  it.each([
    'https://evil.example/api/timedtext',
    'https://youtube.com.evil.example/api/timedtext',
    'http://www.youtube.com/api/timedtext',
    'https://user:password@www.youtube.com/api/timedtext',
    'https://www.youtube.com:8443/api/timedtext',
    'https://www.youtube.com/watch?v=_egu7OFem-k',
    'http://127.0.0.1/api/timedtext',
  ])('refuses an unsafe or unrelated caption URL: %s', (url) => {
    expect(() => assertCaptionUrl(url)).toThrow();
  });

  it('returns reusable video metadata, timestamped captions, and description source links', async () => {
    const metadataRequest = jest.fn(async () => JSON.stringify(metadata));
    const captionRequest = jest.fn(async () => captions);
    const result = await importYouTubeLecture(
      { videoUrl: `https://youtu.be/${videoId}` },
      undefined,
      { metadata: metadataRequest, captions: captionRequest },
    );
    expect(result).toMatchObject({
      title: metadata.title,
      videoUrl: canonical,
      transcriptKind: 'manual',
      language: 'en-GB',
      warnings: [],
    });
    expect(result.sourceUrls).toEqual([
      'https://arxiv.org/abs/2604.28119',
      'https://example.com/research',
    ]);
    expect(result.transcript).toContain('01:02 Later evidence');
    expect(metadataRequest).toHaveBeenCalledWith(canonical, undefined);
    expect(captionRequest).toHaveBeenCalledTimes(1);
  });

  it('warns about automatic or non-English captions and preserves the manual fallback on absent captions', async () => {
    const captionRequest = jest.fn(async () => captions);
    const result = await importYouTubeLecture({ videoUrl: canonical }, undefined, {
      metadata: async () =>
        JSON.stringify({
          ...metadata,
          description: '',
          subtitles: {},
          automatic_captions: { fr: [track] },
        }),
      captions: captionRequest,
    });
    expect(result.warnings.join(' ')).toMatch(/automatically.*No English.*No supporting/);
    const missing = { ...metadata, subtitles: {}, automatic_captions: {} };
    const unavailable = await importYouTubeLecture({ videoUrl: canonical }, undefined, {
      metadata: async () => JSON.stringify(missing),
      captions: captionRequest,
    });
    expect(unavailable).toMatchObject({
      title: metadata.title,
      description: metadata.description,
      transcript: '',
      transcriptKind: 'unavailable',
    });
    expect(unavailable.warnings.join(' ')).toContain('no accessible caption');
    expect(captionRequest).toHaveBeenCalledTimes(1);
  });

  it('preserves video details and source URLs when public captions are rate-limited', async () => {
    const result = await importYouTubeLecture({ videoUrl: canonical }, undefined, {
      metadata: async () => JSON.stringify(metadata),
      captions: async () => {
        throw new LectureError(
          422,
          'YouTube is rate-limiting caption requests. Paste the transcript manually.',
        );
      },
    });
    expect(result).toMatchObject({
      title: metadata.title,
      description: metadata.description,
      transcript: '',
      transcriptKind: 'unavailable',
      language: '',
    });
    expect(result.sourceUrls).toHaveLength(2);
    expect(result.warnings.join(' ')).toContain('rate-limiting');
  });
});
