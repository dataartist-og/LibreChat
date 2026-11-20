import type { LectureNote } from 'librechat-data-provider';
import { notesKey, orderedNotes, persistNotes, readNotes } from '../notes';
import { sourcesAtPause } from '../context';
import seed from '../mcgrath.json';

const note: LectureNote = {
  id: 'one',
  lectureId: 'mcgrath',
  timestamp: 2536.78,
  momentId: 'rewards',
  sourceId: 'rewards',
  question: 'What was the data?',
  answer: 'The answer.',
  takeaways: ['Important detail'],
  citations: [],
  createdAt: '2026-09-12T00:00:00Z',
};
afterEach(() => localStorage.clear());
it('keeps exact pause times and edits across reloads in user-and-lecture scoped storage', () => {
  const key = notesKey('alice', 'mcgrath');
  expect(persistNotes(key, [note])).toBe(true);
  expect(readNotes(key)).toEqual([note]);
  expect(readNotes(notesKey('bob', 'mcgrath'))).toEqual([]);
  expect(readNotes(notesKey('alice', 'other'))).toEqual([]);
  expect(persistNotes(key, [{ ...note, takeaways: ['My revision'] }])).toBe(true);
  expect(readNotes(key)[0].takeaways).toEqual(['My revision']);
  persistNotes(key, []);
  expect(readNotes(key)).toEqual([]);
});
it('returns safe empty notes for corrupt or invalid browser data and reports quota failure', () => {
  const key = notesKey('alice', 'mcgrath');
  localStorage.setItem(key, '{bad');
  expect(readNotes(key)).toEqual([]);
  localStorage.setItem(key, JSON.stringify([{ ...note, timestamp: -1 }]));
  expect(readNotes(key)).toEqual([]);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  expect(persistNotes(key, [note])).toBe(false);
});
it('orders by video time without mutating saved conversation order', () => {
  const later = { ...note, id: 'two', timestamp: 2700 };
  const notes = [later, note];
  expect(orderedNotes(notes)).toEqual([note, later]);
  expect(notes[0]).toBe(later);
});
it('surfaces the Features as Rewards paper at the supplied pause point', () => {
  const sources = sourcesAtPause(seed, 2536.78);
  expect(sources.length).toBeGreaterThan(0);
  expect(sources.some(({ source }) => /features as rewards/i.test(source.title))).toBe(true);
  expect(sources.every(({ nearby }) => !nearby)).toBe(true);
});
it('deduplicates linked papers and marks a nearby fallback without inventing a distant match', () => {
  const evidence = seed.moments.find((moment) => moment.evidence.length)?.evidence[0];
  if (!evidence) {
    throw new Error('Missing fixture evidence');
  }
  const base = seed.moments[0];
  const lecture = {
    ...seed,
    moments: [
      { ...base, id: 'first', start: 0, end: 30, evidence: [evidence, evidence] },
      { ...base, id: 'second', start: 30, end: 500, evidence: [] },
    ],
  };
  expect(sourcesAtPause(lecture, 5)).toHaveLength(1);
  expect(sourcesAtPause(lecture, 45)[0].nearby).toBe(true);
  expect(sourcesAtPause(lecture, 400)).toEqual([]);
});
