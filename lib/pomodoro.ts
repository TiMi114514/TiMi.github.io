export type PomodoroMode = 'focus' | 'break';

export const DEFAULT_FOCUS_MINUTES = 25;
export const DEFAULT_BREAK_MINUTES = 5;

export function clampMinutes(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function durationSeconds(
  mode: PomodoroMode,
  focusMinutes: number,
  breakMinutes: number,
): number {
  return (mode === 'focus' ? focusMinutes : breakMinutes) * 60;
}

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function formatTime(date: Date, timeZone?: string): string {
  return date.toLocaleTimeString(
    'en-GB',
    timeZone ? { hour12: false, timeZone } : { hour12: false },
  );
}
