import type { LectureMoment } from 'librechat-data-provider';

export const timestamp = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};

export function momentAt(moments: LectureMoment[], time: number) {
  let low = 0;
  let high = moments.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (moments[middle].start <= time) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return moments[Math.max(0, high)];
}

export const checkpointAt = (moment: LectureMoment) =>
  Math.min(moment.end - Math.min(0.25, (moment.end - moment.start) / 2), moment.start + 20);

/** Ignore scrubbing; only continuous playback can trigger a teaching pause. */
export function crossedCheckpoint(
  moments: LectureMoment[],
  previous: number,
  current: number,
  visited: Set<string>,
) {
  if (current <= previous || current - previous > 3) {
    return undefined;
  }
  return moments.find(
    (moment) =>
      moment.checkpoint &&
      !visited.has(moment.id) &&
      previous < checkpointAt(moment) &&
      current >= checkpointAt(moment),
  );
}
