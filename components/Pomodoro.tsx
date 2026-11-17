'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock, Maximize2, Pause, Play, RotateCcw, X } from 'lucide-react';

type Mode = 'focus' | 'break';

const FOCUS_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;
const STORAGE_KEY = 'differential-quant.pomodoro.v1';

type Saved = {
  mode: Mode;
  endsAt: number | null;
  remaining: number;
};

function duration(mode: Mode): number {
  return mode === 'focus' ? FOCUS_SECONDS : BREAK_SECONDS;
}

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour12: false });
}

function readSaved(): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    if (parsed.mode !== 'focus' && parsed.mode !== 'break') return null;
    return {
      mode: parsed.mode,
      endsAt: typeof parsed.endsAt === 'number' ? parsed.endsAt : null,
      remaining: typeof parsed.remaining === 'number' ? parsed.remaining : duration(parsed.mode),
    };
  } catch {
    return null;
  }
}

export function Pomodoro() {
  const [mode, setMode] = useState<Mode>('focus');
  const [remaining, setRemaining] = useState(FOCUS_SECONDS);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [focusScreen, setFocusScreen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const saved = readSaved();
    if (!saved) return;
    setMode(saved.mode);
    if (saved.endsAt && saved.endsAt > Date.now()) {
      setEndsAt(saved.endsAt);
      setRunning(true);
      setRemaining(Math.max(0, Math.ceil((saved.endsAt - Date.now()) / 1000)));
    } else {
      setRemaining(saved.remaining);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (!endsAt) return;
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (left > 0) {
        setRemaining(left);
        return;
      }
      const next: Mode = mode === 'focus' ? 'break' : 'focus';
      setMode(next);
      setRemaining(duration(next));
      setEndsAt(null);
      setRunning(false);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [endsAt, mode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ mode, endsAt, remaining }),
      );
    } catch {
      /* storage may be unavailable */
    }
  }, [mode, endsAt, remaining]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) setFocusScreen(false);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  function start() {
    setEndsAt(Date.now() + remaining * 1000);
    setRunning(true);
    setOpen(false);
  }

  function pause() {
    if (endsAt) {
      setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    }
    setEndsAt(null);
    setRunning(false);
  }

  function reset() {
    setRunning(false);
    setEndsAt(null);
    setRemaining(duration(mode));
  }

  function switchMode(next: Mode) {
    setMode(next);
    setRunning(false);
    setEndsAt(null);
    setRemaining(duration(next));
  }

  function openFocusScreen() {
    setOpen(false);
    setFocusScreen(true);
    window.requestAnimationFrame(() => {
      const request = overlayRef.current?.requestFullscreen?.();
      if (request) void request.catch(() => undefined);
    });
  }

  function closeFocusScreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    setFocusScreen(false);
  }

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
        <div className="absolute right-0 top-full z-50 mt-2 w-[248px] rounded-xl border border-line bg-paper p-4 shadow-float">
          <p className="text-[10.5px] uppercase tracking-[0.18em] text-muted">
            {mode === 'focus' ? 'Focus session' : 'Short break'}
          </p>
          <p className="mt-1 font-display text-[32px] leading-none tabular-nums">
            {formatClock(remaining)}
          </p>
          <div className="mt-3 flex gap-2">
            {running ? (
              <button type="button" onClick={pause} className="btn-dark flex-1 px-3 py-2">
                <Pause className="h-3.5 w-3.5" /> Pause
              </button>
            ) : (
              <button type="button" onClick={start} className="btn-dark flex-1 px-3 py-2">
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
              Focus 25
            </button>
            <button
              type="button"
              onClick={() => switchMode('break')}
              className={`rounded-md border px-2 py-1.5 ${
                mode === 'break' ? 'border-ink bg-ink text-cream' : 'border-line text-muted'
              }`}
            >
              Break 5
            </button>
          </div>
        </div>
      ) : null}

      {focusScreen ? (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-black text-white"
        >
          <button
            type="button"
            onClick={closeFocusScreen}
            className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full border border-white/20 text-white/70 transition-colors hover:text-white"
            aria-label="Exit focus screen"
          >
            <X className="h-4 w-4" />
          </button>

          <p className="text-[11px] uppercase tracking-[0.32em] text-white/40">
            {mode === 'focus' ? 'Focus' : 'Break'}
          </p>
          <p className="mt-5 font-display text-[clamp(64px,13vw,170px)] leading-none tabular-nums">
            {formatTime(new Date(now))}
          </p>
          <p className="mt-6 font-display text-[clamp(26px,4.6vw,52px)] text-white/60 tabular-nums">
            {formatClock(remaining)} remaining
          </p>

          <div className="mt-10 flex items-center gap-3">
            {running ? (
              <button
                type="button"
                onClick={pause}
                className="rounded-full border border-white/25 px-5 py-2 text-[13px] text-white/80 transition-colors hover:border-white/60 hover:text-white"
              >
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={start}
                className="rounded-full border border-white/25 px-5 py-2 text-[13px] text-white/80 transition-colors hover:border-white/60 hover:text-white"
              >
                Start
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-white/25 px-5 py-2 text-[13px] text-white/80 transition-colors hover:border-white/60 hover:text-white"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => switchMode(mode === 'focus' ? 'break' : 'focus')}
              className="rounded-full border border-white/25 px-5 py-2 text-[13px] text-white/80 transition-colors hover:border-white/60 hover:text-white"
            >
              {mode === 'focus' ? 'Take a break' : 'Back to focus'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
