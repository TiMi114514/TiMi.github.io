'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Clock, Maximize2, Pause, Play, RotateCcw } from 'lucide-react';
import { formatClock } from '@/lib/pomodoro';
import { usePomodoro } from './PomodoroProvider';

export function Pomodoro() {
  const {
    focusMinutes,
    breakMinutes,
    mode,
    remaining,
    running,
    start,
    pause,
    reset,
    switchMode,
    openFocusScreen,
  } = usePomodoro();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-paper/70 px-2.5 text-[12px] text-ink transition-colors hover:bg-white sm:px-3"
        aria-label="Pomodoro timer"
        title="Pomodoro timer"
      >
        <Clock className="h-3.5 w-3.5" aria-hidden />
        <span className="tabular-nums">{formatClock(remaining)}</span>
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[252px] rounded-xl border border-line bg-paper p-4 shadow-float">
          <p className="text-[10.5px] uppercase tracking-[0.18em] text-muted">
            {mode === 'focus' ? 'Focus session' : 'Short break'}
          </p>
          <p className="mt-1 font-display text-[32px] leading-none tabular-nums">
            {formatClock(remaining)}
          </p>
          <div className="mt-3 flex gap-2">
            {running ? (
              <button
                type="button"
                onClick={() => {
                  pause();
                  setOpen(false);
                }}
                className="btn-dark flex-1 px-3 py-2"
              >
                <Pause className="h-3.5 w-3.5" /> Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  start();
                  setOpen(false);
                }}
                className="btn-dark flex-1 px-3 py-2"
              >
                <Play className="h-3.5 w-3.5" /> Start
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="btn-outline px-2.5 py-2"
              aria-label="Reset timer"
              title="Reset"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={openFocusScreen}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-[12px] text-ink transition-colors hover:bg-cream"
          >
            <Maximize2 className="h-3.5 w-3.5" /> Focus screen
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => switchMode('focus')}
              className={`rounded-md border px-2 py-1.5 ${
                mode === 'focus' ? 'border-ink bg-ink text-cream' : 'border-line text-muted'
              }`}
            >
              Focus {focusMinutes}
            </button>
            <button
              type="button"
              onClick={() => switchMode('break')}
              className={`rounded-md border px-2 py-1.5 ${
                mode === 'break' ? 'border-ink bg-ink text-cream' : 'border-line text-muted'
              }`}
            >
              Break {breakMinutes}
            </button>
          </div>
          <Link
            href="/pomodoro"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-md px-2 py-1.5 text-center text-[11px] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Customise durations
          </Link>
        </div>
      ) : null}
    </div>
  );
}
