'use client';

import { useEffect, useState } from 'react';
import { usePomodoro } from './PomodoroProvider';
import { formatTime } from '@/lib/pomodoro';
import { zoneSourceNote } from '@/lib/geo-time';

/**
 * Live wall clock rendered in the timezone matched from the visitor's IP.
 * Keeps its own 1s ticker so the rest of the tree does not re-render.
 */
export function LocalTime() {
  const { zone } = usePomodoro();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="mt-5 rounded-2xl border border-line bg-paper p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[220px]">
          <h2 className="font-display text-[24px] leading-none">Your local time</h2>
          <p className="mt-2 max-w-[380px] text-[12px] leading-relaxed text-muted">
            {zoneSourceNote(zone)}
          </p>
        </div>
        <p
          className="font-display text-[44px] leading-none tabular-nums tracking-[-0.01em] sm:text-[52px]"
          aria-label="Your local time"
        >
          {mounted ? formatTime(new Date(now), zone?.timeZone) : '--:--:--'}
        </p>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        The timer asks a public geolocation service (ipapi.co, then ipwho.is) for the timezone that
        belongs to your IP address and caches the answer in this browser for 6 hours. Your IP is
        never sent to our servers.
      </p>
    </section>
  );
}