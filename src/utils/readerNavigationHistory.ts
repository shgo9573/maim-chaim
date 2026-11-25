import type { ReaderNavigationHistory } from '../types';

export type ReaderNavigationDirection = 'back' | 'forward';
export const MAX_READER_NAVIGATION_DEPTH = 20;

function isValidLine(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function normalizeStack(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const result: number[] = [];
  for (const item of value) {
    if (!isValidLine(item) || result[result.length - 1] === item) continue;
    result.push(item);
  }
  return result.slice(-MAX_READER_NAVIGATION_DEPTH);
}

export function normalizeReaderNavigationHistory(value: unknown): ReaderNavigationHistory {
  if (!value || typeof value !== 'object') return { back: [], forward: [] };
  const candidate = value as Partial<ReaderNavigationHistory>;
  return {
    back: normalizeStack(candidate.back),
    forward: normalizeStack(candidate.forward),
  };
}

function pushRecent(stack: number[], line: number): void {
  if (!isValidLine(line) || stack[stack.length - 1] === line) return;
  stack.push(line);
  if (stack.length > MAX_READER_NAVIGATION_DEPTH) {
    stack.splice(0, stack.length - MAX_READER_NAVIGATION_DEPTH);
  }
}

/** Records an explicit reader jump; ordinary scrolling must not call this. */
export function recordReaderNavigation(
  history: unknown,
  currentLine: number,
  destinationLine: number,
): ReaderNavigationHistory {
  const normalized = normalizeReaderNavigationHistory(history);
  if (!isValidLine(currentLine) || !isValidLine(destinationLine) || currentLine === destinationLine) {
    return normalized;
  }
  const back = [...normalized.back];
  pushRecent(back, currentLine);
  return { back, forward: [] };
}

export interface ReaderNavigationResult {
  line: number;
  history: ReaderNavigationHistory;
}

/** Moves the current position to the opposite stack and returns the last target. */
export function travelReaderNavigation(
  history: unknown,
  currentLine: number,
  direction: ReaderNavigationDirection,
): ReaderNavigationResult | null {
  const normalized = normalizeReaderNavigationHistory(history);
  const source = [...normalized[direction]];
  const line = source.pop();
  if (!isValidLine(line)) return null;

  const back = direction === 'back' ? source : [...normalized.back];
  const forward = direction === 'forward' ? source : [...normalized.forward];
  const opposite = direction === 'back' ? forward : back;
  if (isValidLine(currentLine)) pushRecent(opposite, currentLine);

  return { line, history: { back, forward } };
}
