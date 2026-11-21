/**
 * Initial reader fetch window.
 *
 * Keep the first content request bounded independently from the larger
 * follow-up pagination chunk used while scrolling.
 */
export const INITIAL_READER_WINDOW_SIZE = 150;
export const INITIAL_READER_LINES_BEFORE_TARGET = 60;

export interface ReaderLineRange {
  start: number;
  end: number;
}

export function getInitialReaderRange(targetLine: number): ReaderLineRange {
  const target = Number.isFinite(targetLine)
    ? Math.max(1, Math.floor(targetLine))
    : 1;
  const start = Math.max(1, target - INITIAL_READER_LINES_BEFORE_TARGET);

  return {
    start,
    end: start + INITIAL_READER_WINDOW_SIZE - 1,
  };
}
