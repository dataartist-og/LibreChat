import { z } from 'zod';
import type { Lecture } from 'librechat-data-provider';

const identifier = z.string().trim().min(1).max(180);
const prose = z.string().trim().max(12000);

export const lectureSourceSchema = z
  .object({
    id: identifier,
    title: z.string().trim().min(1).max(400),
    url: z.string().url().max(2048),
  })
  .strict();

export const lectureMomentSchema = z
  .object({
    id: identifier,
    start: z.number().finite().min(0).max(86400),
    end: z.number().finite().positive().max(86400),
    title: z.string().trim().min(1).max(400),
    explanation: prose,
    technical: prose,
    question: z.string().trim().max(2000),
    evidence: z
      .array(
        z
          .object({
            sourceId: identifier,
            anchor: identifier,
            section: z.string().trim().min(1).max(500),
            why: z.string().trim().max(2000),
          })
          .strict(),
      )
      .max(8),
    checkpoint: z.boolean(),
  })
  .strict();

export const lectureSchema: z.ZodType<Lecture> = z
  .object({
    id: identifier,
    title: z.string().trim().min(1).max(400),
    videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
    description: z.string().max(30000),
    duration: z.number().finite().positive().max(86400),
    sources: z.array(lectureSourceSchema).min(1).max(24),
    moments: z.array(lectureMomentSchema).min(1).max(120),
  })
  .strict()
  .superRefine((lecture, context) => {
    const sources = new Set(lecture.sources.map((source) => source.id));
    const moments = new Set(lecture.moments.map((moment) => moment.id));
    if (sources.size !== lecture.sources.length || moments.size !== lecture.moments.length) {
      context.addIssue({ code: 'custom', message: 'Source and moment IDs must be unique.' });
    }
    lecture.moments.forEach((moment, index) => {
      if (moment.end <= moment.start || moment.end > lecture.duration) {
        context.addIssue({
          code: 'custom',
          path: ['moments', index],
          message: 'Invalid moment timing.',
        });
      }
      const previous = lecture.moments[index - 1];
      if (previous && (moment.start <= previous.start || moment.start < previous.end)) {
        context.addIssue({
          code: 'custom',
          path: ['moments', index],
          message: 'Moments must be chronological and must not overlap.',
        });
      }
      if (moment.evidence.some((evidence) => !sources.has(evidence.sourceId))) {
        context.addIssue({
          code: 'custom',
          path: ['moments', index],
          message: 'Unknown evidence source.',
        });
      }
    });
  });

export const lectureSourceRequestSchema = z.object({ source: lectureSourceSchema }).strict();
const lectureAskInput = z
  .object({
    lecture: lectureSchema,
    momentId: identifier,
    question: z.string().trim().min(1).max(4000),
    sourceId: identifier.optional(),
    focus: z.object({ sourceId: identifier, anchor: identifier }).strict().optional(),
    history: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().max(6000),
          })
          .strict(),
      )
      .max(12)
      .optional(),
  })
  .strict();

function validateSourceSelection(
  request: Pick<z.infer<typeof lectureAskInput>, 'lecture' | 'sourceId' | 'focus'>,
  context: z.RefinementCtx,
) {
  const selected = request.sourceId ?? request.focus?.sourceId;
  if (selected && !request.lecture.sources.some((source) => source.id === selected)) {
    context.addIssue({
      code: 'custom',
      path: ['sourceId'],
      message: 'The selected source is not part of this lecture.',
    });
  }
  if (request.sourceId && request.focus && request.sourceId !== request.focus.sourceId) {
    context.addIssue({
      code: 'custom',
      path: ['focus', 'sourceId'],
      message: 'The focused passage must belong to the selected source.',
    });
  }
}

export const lectureAskSchema = lectureAskInput.superRefine(validateSourceSelection);
export const lectureNotesSchema = lectureAskInput
  .omit({ history: true })
  .extend({ answer: z.string().trim().min(1).max(18000) })
  .strict()
  .superRefine(validateSourceSelection);

export const lectureIndexSchema = z
  .object({
    title: z.string().trim().min(1).max(400),
    videoUrl: z.string().url().max(2048),
    transcript: z.string().trim().min(20).max(160000),
    description: z.string().trim().min(1).max(30000),
  })
  .strict();

export class LectureError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'LectureError';
  }
}
