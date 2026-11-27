'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { RotateCw, X } from 'lucide-react';
import { logPomodoro } from '@/lib/account';
import {
  DEFAULT_BREAK_MINUTES,
  DEFAULT_FOCUS_MINUTES,
  clampMinutes,
  durationSeconds,
  formatClock,
  formatTime,
  type PomodoroMode,
} from '@/lib/pomodoro';
import { resolveGeoZone, zoneLabel, type GeoZone } from '@/lib/geo-time';
import { useI18n } from '@/lib/i18n';

const STORAGE_KEY = 'differential-quant.pomodoro.v1';

type Saved = {
  focusMinutes: number;
  breakMinutes: number;
  mode: PomodoroMode;
  endsAt: number | null;
  remaining: number;
};

type PomodoroContextValue = {
  focusMinutes: number;
  breakMinutes: number;
  mode: PomodoroMode;
  remaining: number;
  running: boolean;
  focusScreen: boolean;
  now: number;
  zone: GeoZone | null;
  start: () => void;
  pause: () => void;
  reset: () => void;
  switchMode: (mode: PomodoroMode) => void;
  setDurations: (focusMinutes: number, breakMinutes: number) => void;
  openFocusScreen: () => void;
  closeFocusScreen: () => void;
};

const PomodoroContext = createContext<PomodoroContextValue | null>(null);

function readSaved(): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    const focusMinutes = clampMinutes(
      Number(parsed.focusMinutes ?? DEFAULT_FOCUS_MINUTES),
      1,
      180,
    );
    const breakMinutes = clampMinutes(
      Number(parsed.breakMinutes ?? DEFAULT_BREAK_MINUTES),
      1,
      60,
    );
    const mode: PomodoroMode = parsed.mode === 'break' ? 'break' : 'focus';
    return {
      focusMinutes,
      breakMinutes,
      mode,
      endsAt: typeof parsed.endsAt === 'number' ? parsed.endsAt : null,
      remaining:
        typeof parsed.remaining === 'number'
          ? parsed.remaining
          : durationSeconds(mode, focusMinutes, breakMinutes),
    };
  } catch {
    return null;
  }
}

export function PomodoroProvider({ children }: { children: React.ReactNode }) {
  const [focusMinutes, setFocusMinutes] = useState(DEFAULT_FOCUS_MINUTES);
  const [breakMinutes, setBreakMinutes] = useState(DEFAULT_BREAK_MINUTES);
  const [mode, setMode] = useState<PomodoroMode>('focus');
  const [remaining, setRemaining] = useState(
    durationSeconds('focus', DEFAULT_FOCUS_MINUTES, DEFAULT_BREAK_MINUTES),
  );
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [focusScreen, setFocusScreen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [zone, setZone] = useState<GeoZone | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  // 'auto' = follow the device; 'rotated' = the view is turned 90° (CSS fallback when the browser cannot lock orientation).
  const [rotated, setRotated] = useState(false);
  const [rotateMode, setRotateMode] = useState<'lock' | 'css' | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    // iPadOS reports a desktop Mac UA; touch points reveal it.
    const ipad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    setIsMobile(ipad || /Android|iPhone|iPad|iPod|Mobile|Tablet|HarmonyOS|SamsungBrowser/i.test(ua));
  }, []);

  // Rotate: first try the real orientation lock (Android Chrome in fullscreen);
  // where that is not allowed (iPad / iPhone Safari) rotate the view 90° with CSS.
  // One state covers both, so the same button always undoes it.
  async function toggleRotate() {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };
    if (rotated) {
      setRotated(false);
      setRotateMode(null);
      try {
        orientation?.unlock?.();
      } catch {
        /* ignore */
      }
      return;
    }
    const portraitNow = window.innerHeight > window.innerWidth;
    try {
      if (!orientation?.lock) throw new Error('no lock');
      await orientation.lock(portraitNow ? 'landscape' : 'portrait');
      setRotateMode('lock');
    } catch {
      setRotateMode('css');
    }
    setRotated(true);
  }
  const { locale, t } = useI18n();

  useEffect(() => {
    const saved = readSaved();
    if (saved) {
      setFocusMinutes(saved.focusMinutes);
      setBreakMinutes(saved.breakMinutes);
      setMode(saved.mode);
      if (saved.endsAt && saved.endsAt > Date.now()) {
        setEndsAt(saved.endsAt);
        setRunning(true);
        setRemaining(Math.max(0, Math.ceil((saved.endsAt - Date.now()) / 1000)));
      } else {
        setRemaining(
          saved.remaining > 0
            ? saved.remaining
            : durationSeconds(saved.mode, saved.focusMinutes, saved.breakMinutes),
        );
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    let alive = true;
    resolveGeoZone(locale).then((resolved) => {
      if (alive) setZone(resolved);
    });
    return () => {
      alive = false;
    };
  }, [locale]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ focusMinutes, breakMinutes, mode, endsAt, remaining }),
      );
    } catch {
      /* storage may be unavailable */
    }
  }, [hydrated, focusMinutes, breakMinutes, mode, endsAt, remaining]);

  useEffect(() => {
    if (!running && !focusScreen) return;
    const timer = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (!endsAt) return;
      const left = Math.max(0, Math.ceil((endsAt - timestamp) / 1000));
      if (left > 0) {
        setRemaining(left);
        return;
      }
      // A block ran to the end: record it (signed-in users only; the server rejects bursts).
      void logPomodoro(mode === 'focus' ? focusMinutes : breakMinutes, mode);
      const next: PomodoroMode = mode === 'focus' ? 'break' : 'focus';
      setMode(next);
      setRemaining(durationSeconds(next, focusMinutes, breakMinutes));
      setEndsAt(null);
      setRunning(false);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, focusScreen, endsAt, mode, focusMinutes, breakMinutes]);

  useEffect(() => {
    if (!focusScreen) return;
    const request = overlayRef.current?.requestFullscreen?.();
    if (request) void request.catch(() => undefined);

    function onFullscreenChange() {
      if (!document.fullscreenElement) setFocusScreen(false);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [focusScreen]);

  function start() {
    const seconds = remaining > 0 ? remaining : durationSeconds(mode, focusMinutes, breakMinutes);
    setEndsAt(Date.now() + seconds * 1000);
    setRunning(true);
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
    setRemaining(durationSeconds(mode, focusMinutes, breakMinutes));
  }

  function switchMode(next: PomodoroMode) {
    setMode(next);
    setRunning(false);
    setEndsAt(null);
    setRemaining(durationSeconds(next, focusMinutes, breakMinutes));
  }

  function setDurations(nextFocus: number, nextBreak: number) {
    const focus = clampMinutes(nextFocus, 1, 180);
    const rest = clampMinutes(nextBreak, 1, 60);
    setFocusMinutes(focus);
    setBreakMinutes(rest);
    if (!running) {
      setRemaining(durationSeconds(mode, focus, rest));
    }
  }

  function openFocusScreen() {
    setFocusScreen(true);
  }

  function closeFocusScreen() {
    setRotated(false);
    setRotateMode(null);
    try {
      (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
    } catch {
      /* ignore */
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    setFocusScreen(false);
  }

  const value: PomodoroContextValue = {
    focusMinutes,
    breakMinutes,
    mode,
    remaining,
    running,
    focusScreen,
    now,
    zone,
    start,
    pause,
    reset,
    switchMode,
    setDurations,
    openFocusScreen,
    closeFocusScreen,
  };

  return (
    <PomodoroContext.Provider value={value}>
      {children}

      {focusScreen ? (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-[120] overflow-hidden bg-black text-white"
        >
          <div
            className="absolute flex flex-col items-center justify-center"
            style={
              rotated && rotateMode === 'css'
                ? { width: '100vh', height: '100vw', left: '50%', top: '50%', transform: 'translate(-50%, -50%) rotate(90deg)' }
                : { inset: 0 }
            }
          >
          {isMobile ? (
            <button
              type="button"
              onClick={() => void toggleRotate()}
              className="absolute left-5 top-5 flex h-10 items-center gap-1.5 rounded-full border border-white/20 px-3.5 text-[12.5px] text-white/75 transition-colors hover:text-white"
              aria-label="旋转屏幕"
            >
              <RotateCw className="h-4 w-4" aria-hidden />
              {rotated ? '恢复' : '横屏'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={closeFocusScreen}
            className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full border border-white/20 text-white/70 transition-colors hover:text-white"
            aria-label={t('pomo.exit')}
          >
            <X className="h-4 w-4" />
          </button>

          <p className="text-[11px] uppercase tracking-[0.32em] text-white/40">
            {mode === 'focus' ? t('pomo.focus') : t('pomo.break')}
          </p>
          <p className="mt-5 font-display text-[clamp(64px,13vw,170px)] leading-none tabular-nums">
            {formatTime(new Date(now), zone?.timeZone)}
          </p>
          <p className="mt-6 font-display text-[clamp(26px,4.6vw,52px)] text-white/60 tabular-nums">
            {t('pomo.remaining', { time: formatClock(remaining) })}
          </p>
          <p className="mt-4 text-[11px] uppercase tracking-[0.24em] text-white/35">
            {zone ? zoneLabel(zone, locale) : t('pomo.locating')}
          </p>

          <div className="mt-10 flex items-center gap-3">
            {running ? (
              <button
                type="button"
                onClick={pause}
                className="rounded-full border border-white/25 px-5 py-2 text-[13px] text-white/80 transition-colors hover:border-white/60 hover:text-white"
              >
                {t('pomo.pause')}
              </button>
            ) : (
              <button
                type="button"
                onClick={start}
                className="rounded-full border border-white/25 px-5 py-2 text-[13px] text-white/80 transition-colors hover:border-white/60 hover:text-white"
              >
                {t('pomo.start')}
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-white/25 px-5 py-2 text-[13px] text-white/80 transition-colors hover:border-white/60 hover:text-white"
            >
              {t('pomo.reset')}
            </button>
            <button
              type="button"
              onClick={() => switchMode(mode === 'focus' ? 'break' : 'focus')}
              className="rounded-full border border-white/25 px-5 py-2 text-[13px] text-white/80 transition-colors hover:border-white/60 hover:text-white"
            >
              {mode === 'focus' ? t('pomo.takeBreak') : t('pomo.backToFocus')}
            </button>
          </div>
          </div>
        </div>
      ) : null}
    </PomodoroContext.Provider>
  );
}

export function usePomodoro(): PomodoroContextValue {
  const context = useContext(PomodoroContext);
  if (!context) throw new Error('usePomodoro must be used inside <PomodoroProvider>');
  return context;
}
