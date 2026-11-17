'use client';

import { useEffect, useState } from 'react';
import { Clock, Maximize2, Pause, Play, RotateCcw } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { usePomodoro } from '@/components/PomodoroProvider';
import { formatClock } from '@/lib/pomodoro';

export default function PomodoroPage() {
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
    setDurations,
    openFocusScreen,
  } = usePomodoro();
  const [draftFocus, setDraftFocus] = useState(focusMinutes);
  const [draftBreak, setDraftBreak] = useState(breakMinutes);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraftFocus(focusMinutes);
    setDraftBreak(breakMinutes);
  }, [focusMinutes, breakMinutes]);

  function applyDurations(event: React.FormEvent) {
    event.preventDefault();
    setDurations(draftFocus, draftBreak);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div>
      <Header />
      <main className="container-page py-14 sm:py-20">
        <div className="mx-auto max-w-[860px]">
          <p className="eyebrow">Study timer</p>
          <h1 className="mt-3 font-display text-[46px] leading-none tracking-[-0.01em] sm:text-[54px]">
            Focus, then rest.
          </h1>
          <p className="mt-4 max-w-[520px] text-[14px] leading-relaxed text-muted">
            A simple Pomodoro timer: a focused block, a short break, repeat. It keeps running while
            you move between pages, and the focus screen is pure black with just the clock.
          </p>

          <section className="mt-9 overflow-hidden rounded-2xl border border-line bg-paper shadow-card">
            <div className="flex items-center justify-between border-b border-line/80 px-5 py-3.5 sm:px-7">
              <div className="inline-flex rounded-full border border-line bg-cream/60 p-1">
                <button
                  type="button"
                  onClick={() => switchMode('focus')}
                  className={`rounded-full px-3.5 py-1.5 text-[12px] transition-colors ${
                    mode === 'focus' ? 'bg-ink text-cream' : 'text-muted hover:text-ink'
                  }`}
                >
                  Focus · {focusMinutes} min
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('break')}
                  className={`rounded-full px-3.5 py-1.5 text-[12px] transition-colors ${
                    mode === 'break' ? 'bg-ink text-cream' : 'text-muted hover:text-ink'
                  }`}
                >
                  Break · {breakMinutes} min
                </button>
              </div>
              <span className="hidden items-center gap-1.5 text-[11.5px] text-muted sm:flex">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {running ? 'running' : 'paused'}
              </span>
            </div>

            <div className="px-5 py-10 text-center sm:px-8 sm:py-14">
              <p className="text-[11px] uppercase tracking-[0.28em] text-muted">
                {mode === 'focus' ? 'Focus block' : 'Short break'}
              </p>
              <p className="mt-4 font-display text-[clamp(84px,18vw,168px)] leading-none tabular-nums tracking-[-0.02em]">
                {formatClock(remaining)}
              </p>

              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                {running ? (
                  <button type="button" onClick={pause} className="btn-dark px-6 py-3">
                    <Pause className="h-4 w-4" /> Pause
                  </button>
                ) : (
                  <button type="button" onClick={start} className="btn-dark px-6 py-3">
                    <Play className="h-4 w-4" /> Start
                  </button>
                )}
                <button type="button" onClick={reset} className="btn-light px-5 py-3">
                  <RotateCcw className="h-4 w-4" /> Reset
                </button>
                <button
                  type="button"
                  onClick={openFocusScreen}
                  className="btn-light px-5 py-3"
                >
                  <Maximize2 className="h-4 w-4" /> Focus screen
                </button>
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-line bg-paper p-5 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-[24px] leading-none">Durations</h2>
                <p className="mt-2 text-[12px] text-muted">
                  Defaults are 25 and 5 minutes. Changes apply immediately when paused, or from the
                  next session.
                </p>
              </div>
              {saved ? (
                <span className="rounded-full border border-[#cfe1d4] bg-[#eef5ef] px-2.5 py-1 text-[11px] text-[#3f7d5a]">
                  saved
                </span>
              ) : null}
            </div>

            <form onSubmit={applyDurations} className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
              <label className="block space-y-1.5 text-[12.5px] text-muted">
                <span>Focus minutes</span>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={draftFocus}
                  onChange={(event) => setDraftFocus(Number(event.target.value))}
                  className="input"
                />
              </label>
              <label className="block space-y-1.5 text-[12.5px] text-muted">
                <span>Break minutes</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={draftBreak}
                  onChange={(event) => setDraftBreak(Number(event.target.value))}
                  className="input"
                />
              </label>
              <button type="submit" className="btn-dark h-[46px] self-end px-5">
                Apply
              </button>
            </form>

            <p className="mt-4 text-[11px] leading-relaxed text-muted">
              Ranges: focus 1–180 minutes, break 1–60 minutes. The timer is stored in this browser;
              it does not contact the server.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
