import { z } from 'zod';
import type { RequestHandler } from 'express';
import { askLecture, getLectureSource, indexLecture, extractLectureTakeaways } from './service';
import { getLectureVoiceStatus, startLectureVoice, stopLectureVoice } from './voice';
import { importYouTubeLecture } from './youtube';
import { LectureError, lectureSchema } from './schema';

function handler<T>(
  operation: (input: unknown, signal?: AbortSignal, userId?: string) => Promise<T>,
): RequestHandler {
  return async (req, res) => {
    const controller = new AbortController();
    const abort = () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    };
    req.once('aborted', abort);
    res.once('close', abort);
    try {
      const identity = z.object({ id: z.string() }).safeParse(req.user);
      const result = await operation(
        req.body,
        controller.signal,
        identity.success ? identity.data.id : undefined,
      );
      if (!res.writableEnded && !controller.signal.aborted) {
        res.set('Cache-Control', 'private, no-store').json(result);
      }
    } catch (error) {
      if (controller.signal.aborted || res.writableEnded) {
        return;
      }
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: error.issues
            .map((issue) => issue.message)
            .slice(0, 3)
            .join(' '),
        });
        return;
      }
      if (error instanceof LectureError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'The lecture request could not be completed.' });
    } finally {
      req.removeListener('aborted', abort);
      res.removeListener('close', abort);
    }
  };
}

export const lectureSourceHandler = handler(getLectureSource);
export const lectureAskHandler = handler(askLecture);
export const lectureIndexHandler = handler(indexLecture);
export const lectureImportHandler = handler(async (input: unknown) => lectureSchema.parse(input));
export const lectureNotesHandler = handler(extractLectureTakeaways);
export const lectureYouTubeHandler = handler((input, signal) =>
  importYouTubeLecture(input, signal),
);
export const lectureVoiceStatusHandler = handler(getLectureVoiceStatus);
export const lectureVoiceStartHandler = handler((input, signal, userId) =>
  startLectureVoice(input, userId ?? '', signal),
);
export const lectureVoiceStopHandler = handler((input, _signal, userId) =>
  stopLectureVoice(input, userId ?? ''),
);
