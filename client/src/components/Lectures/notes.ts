import { z } from 'zod';
import type { LectureNote } from 'librechat-data-provider';

const noteSchema: z.ZodType<LectureNote> = z.object({
  id: z.string(),
  lectureId: z.string(),
  timestamp: z.number().finite().nonnegative(),
  momentId: z.string(),
  sourceId: z.string(),
  question: z.string(),
  answer: z.string(),
  takeaways: z.array(z.string()),
  citations: z.array(
    z.object({ sourceId: z.string(), url: z.string().url(), section: z.string() }),
  ),
  createdAt: z.string(),
});
export const notesKey = (userId: string, lectureId: string) =>
  `lecture-notes-v1:${userId}:${lectureId}`;
export function readNotes(key: string): LectureNote[] {
  try {
    const parsed = z.array(noteSchema).safeParse(JSON.parse(localStorage.getItem(key) ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
export const orderedNotes = (notes: LectureNote[]) =>
  [...notes].sort((a, b) => a.timestamp - b.timestamp || a.createdAt.localeCompare(b.createdAt));
export function persistNotes(key: string, notes: LectureNote[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(notes));
    return true;
  } catch {
    return false;
  }
}
export function downloadJson(value: object, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
