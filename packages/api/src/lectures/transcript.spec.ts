import { extractDescriptionUrls, parseTranscript, parseVideoId } from './transcript';

describe('lecture transcript parsing', () => {
  it('accepts YouTube timestamp lines and separates their text', () => {
    expect(
      parseTranscript(
        '0:00\nIntroduction\n0:32 The probe is a readout.\n[1:02:03] A later section.',
      ),
    ).toEqual([
      { start: 0, text: 'Introduction' },
      { start: 32, text: 'The probe is a readout.' },
      { start: 3723, text: 'A later section.' },
    ]);
  });
  it('rejects untimed, out-of-order, and malformed transcripts', () => {
    expect(() => parseTranscript('Words without time')).toThrow('timestamped');
    expect(() => parseTranscript('0:32 First\n0:20 Backwards')).toThrow('increasing');
    expect(() => parseTranscript('0:00 Start\n0:99 Invalid')).toThrow('valid MM:SS');
  });
  it('only accepts actual YouTube hosts and valid video IDs', () => {
    expect(parseVideoId('https://www.youtube.com/watch?v=_egu7OFem-k&t=2536s')).toBe('_egu7OFem-k');
    expect(parseVideoId('https://youtu.be/_egu7OFem-k')).toBe('_egu7OFem-k');
    expect(() => parseVideoId('https://youtube.com.attacker.test/watch?v=_egu7OFem-k')).toThrow();
    expect(() => parseVideoId('https://youtube.com/watch?v=bad')).toThrow();
  });
  it('deduplicates description links and excludes video/social navigation', () => {
    expect(
      extractDescriptionUrls(
        '[Paper](https://arxiv.org/abs/2111.09259).\nhttps://arxiv.org/abs/2111.09259\nhttps://youtu.be/_egu7OFem-k',
      ),
    ).toEqual(['https://arxiv.org/abs/2111.09259']);
  });
});
