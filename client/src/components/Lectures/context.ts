import type {
  Lecture,
  LectureMoment,
  LectureSource,
  LectureEvidence,
} from 'librechat-data-provider';
import { momentAt } from './timeline';

export type SourceSuggestion = {
  source: LectureSource;
  evidence: LectureEvidence;
  nearby: boolean;
};

export function sourcesAtPause(lecture: Lecture, time: number): SourceSuggestion[] {
  const current = momentAt(lecture.moments, time);
  if (!current) {
    return [];
  }
  const sourceMap = new Map(lecture.sources.map((source) => [source.id, source]));
  const candidates: LectureMoment[] = current.evidence.length
    ? [current]
    : lecture.moments
        .filter(
          (moment) =>
            moment.evidence.length &&
            Math.min(Math.abs(moment.start - time), Math.abs(moment.end - time)) <= 180,
        )
        .sort((a, b) => Math.abs(a.start - time) - Math.abs(b.start - time))
        .slice(0, 1);
  const seen = new Set<string>();
  return candidates.flatMap((moment) =>
    moment.evidence.flatMap((evidence) => {
      const source = sourceMap.get(evidence.sourceId);
      if (!source || seen.has(source.id)) {
        return [];
      }
      seen.add(source.id);
      return [{ source, evidence, nearby: moment.id !== current.id }];
    }),
  );
}
