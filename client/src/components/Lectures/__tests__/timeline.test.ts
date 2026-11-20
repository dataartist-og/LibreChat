import type { Lecture, LectureMoment } from 'librechat-data-provider';
import { checkpointAt, crossedCheckpoint, momentAt, timestamp } from '../timeline';
import mcgrath from '../mcgrath.json';

const createMoment = (
  id: string,
  start: number,
  end: number,
  checkpoint = false,
): LectureMoment => ({
  id,
  start,
  end,
  checkpoint,
  title: id,
  explanation: 'A teaching explanation.',
  technical: '',
  question: '',
  evidence: [],
});

const moments = [
  createMoment('introduction', 0, 30),
  createMoment('first-checkpoint', 30, 90, true),
  createMoment('short-checkpoint', 90, 95, true),
];

describe('lecture timeline selection', () => {
  it('selects the new section at an exact boundary without changing early', () => {
    expect(momentAt(moments, 0)).toBe(moments[0]);
    expect(momentAt(moments, 29.999)).toBe(moments[0]);
    expect(momentAt(moments, 30)).toBe(moments[1]);
    expect(momentAt(moments, 90)).toBe(moments[2]);
  });

  it('clamps before the first section and after the last section, including video end', () => {
    expect(momentAt(moments, -10)).toBe(moments[0]);
    expect(momentAt(moments, 94.999)).toBe(moments[2]);
    expect(momentAt(moments, 95)).toBe(moments[2]);
    expect(momentAt(moments, 100)).toBe(moments[2]);
  });

  it('holds the preceding moment through a gap in an imported timeline', () => {
    const withGap = [
      createMoment('first', 0, 10),
      createMoment('second', 20, 30),
      createMoment('third', 50, 60),
    ];
    expect(momentAt(withGap, 15)).toBe(withGap[0]);
    expect(momentAt(withGap, 45)).toBe(withGap[1]);
  });

  it('returns no selection for an empty timeline', () => {
    expect(momentAt([], 0)).toBeUndefined();
    expect(momentAt([], 10)).toBeUndefined();
  });

  it('formats elapsed lecture time without rounding into the next second', () => {
    expect(timestamp(-1)).toBe('0:00');
    expect(timestamp(59.99)).toBe('0:59');
    expect(timestamp(60)).toBe('1:00');
    expect(timestamp(6014)).toBe('100:14');
  });
});

describe('teaching checkpoint timing', () => {
  it('allows context before a checkpoint and keeps short sections before their end', () => {
    expect(checkpointAt(moments[1])).toBe(50);
    expect(checkpointAt(moments[2])).toBe(94.75);
  });

  it('keeps a checkpoint inside a section shorter than the end buffer', () => {
    const tiny = createMoment('tiny', 10, 10.1, true);
    expect(checkpointAt(tiny)).toBeGreaterThanOrEqual(tiny.start);
    expect(checkpointAt(tiny)).toBeLessThan(tiny.end);
  });

  it('triggers when continuous playback first reaches the checkpoint', () => {
    const visited = new Set<string>();
    expect(crossedCheckpoint(moments, 49, 49.9, visited)).toBeUndefined();
    expect(crossedCheckpoint(moments, 49.9, 50, visited)).toBe(moments[1]);
  });

  it('detects a checkpoint crossed between player samples', () => {
    expect(crossedCheckpoint(moments, 49.8, 50.2, new Set())).toBe(moments[1]);
    expect(crossedCheckpoint(moments, 94.5, 94.9, new Set())).toBe(moments[2]);
  });

  it('does not fire again when playback resumes from the checkpoint time', () => {
    expect(crossedCheckpoint(moments, 50, 50.35, new Set())).toBeUndefined();
  });

  it('suppresses a previously visited checkpoint even after a replay', () => {
    const visited = new Set([moments[1].id]);
    expect(crossedCheckpoint(moments, 49.8, 50.2, visited)).toBeUndefined();
    expect(crossedCheckpoint(moments, 94.5, 94.9, visited)).toBe(moments[2]);
  });

  it('leaves visitation changes to the playback controller', () => {
    const visited = new Set(['earlier-checkpoint']);
    crossedCheckpoint(moments, 49.8, 50.2, visited);
    expect([...visited]).toEqual(['earlier-checkpoint']);
  });

  it('suppresses stationary and backward playback updates', () => {
    expect(crossedCheckpoint(moments, 50, 50, new Set())).toBeUndefined();
    expect(crossedCheckpoint(moments, 51, 49, new Set())).toBeUndefined();
  });

  it('suppresses large forward seeks without consuming checkpoints for subsequent playback', () => {
    const visited = new Set<string>();
    expect(crossedCheckpoint(moments, 40, 51, visited)).toBeUndefined();
    expect(crossedCheckpoint(moments, 47, 50.01, visited)).toBeUndefined();
    expect(crossedCheckpoint(moments, 47, 50, visited)).toBe(moments[1]);
    expect(crossedCheckpoint(moments, 49.8, 50.2, visited)).toBe(moments[1]);
  });

  it('does not pause at an ordinary section or an empty timeline', () => {
    expect(crossedCheckpoint(moments, 19.8, 20.2, new Set())).toBeUndefined();
    expect(crossedCheckpoint([], 19.8, 20.2, new Set())).toBeUndefined();
  });
});

describe('McGrath lecture seed integrity', () => {
  const lecture: Lecture = mcgrath;

  it('covers the complete video with unique, sorted, contiguous sections', () => {
    expect(lecture.videoId).toBe('_egu7OFem-k');
    expect(Number.isFinite(lecture.duration)).toBe(true);
    expect(lecture.duration).toBeGreaterThan(0);
    expect(lecture.moments.length).toBeGreaterThan(0);
    expect(new Set(lecture.moments.map(({ id }) => id)).size).toBe(lecture.moments.length);
    expect(lecture.moments[0].start).toBe(0);
    expect(lecture.moments[lecture.moments.length - 1].end).toBe(lecture.duration);

    for (const [index, moment] of lecture.moments.entries()) {
      expect(moment.id.trim()).not.toBe('');
      expect(moment.title.trim()).not.toBe('');
      expect(moment.explanation.trim()).not.toBe('');
      expect(Number.isFinite(moment.start)).toBe(true);
      expect(Number.isFinite(moment.end)).toBe(true);
      expect(moment.start).toBeGreaterThanOrEqual(0);
      expect(moment.end).toBeGreaterThan(moment.start);
      expect(moment.end).toBeLessThanOrEqual(lecture.duration);
      if (index > 0) {
        expect(moment.start).toBe(lecture.moments[index - 1].end);
      }
    }
  });

  it('grounds every evidence passage in a known source and a nonempty anchor', () => {
    const sourceIds = new Set(lecture.sources.map(({ id }) => id));
    expect(sourceIds.size).toBe(lecture.sources.length);
    expect(sourceIds.size).toBeGreaterThan(0);

    for (const source of lecture.sources) {
      expect(source.id.trim()).not.toBe('');
      expect(source.title.trim()).not.toBe('');
      expect(new URL(source.url).protocol).toBe('https:');
    }

    for (const moment of lecture.moments) {
      if (moment.checkpoint) {
        expect(moment.evidence.length).toBeGreaterThan(0);
        expect(checkpointAt(moment)).toBeGreaterThanOrEqual(moment.start);
        expect(checkpointAt(moment)).toBeLessThan(moment.end);
      }
      for (const evidence of moment.evidence) {
        expect(sourceIds.has(evidence.sourceId)).toBe(true);
        expect(evidence.anchor.replace(/^#/, '').trim()).not.toBe('');
        expect(evidence.section.trim()).not.toBe('');
        expect(evidence.why.trim()).not.toBe('');
      }
    }
  });

  it('selects every section at its start and retains the final section at video end', () => {
    for (const moment of lecture.moments) {
      expect(momentAt(lecture.moments, moment.start)).toBe(moment);
    }
    expect(momentAt(lecture.moments, lecture.duration)).toBe(
      lecture.moments[lecture.moments.length - 1],
    );
  });
});
