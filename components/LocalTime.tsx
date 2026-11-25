'use client';

import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { usePomodoro } from './PomodoroProvider';
import { formatTime } from '@/lib/pomodoro';
import { placeLabel, zoneOffsetLabel } from '@/lib/geo-time';
import { useI18n } from '@/lib/i18n';

/**
 * Live wall clock for the region matched from the visitor's IP:
 * province / city plus the GMT offset. The device timezone is never shown.
 */
export function LocalTime() {
  const { zone } = usePomodoro();
  const { locale, t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const place = placeLabel(zone, locale);
  const offset = mounted ? zoneOffsetLabel(zone?.timeZone, new Date(now)) : '';

  return (
    <section className="mt-5 rounded-2xl border border-line bg-paper p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[220px]">
          <h2 className="font-display text-[24px] leading-none">{t('pomo.localTitle')}</h2>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-ink">
            <MapPin className="h-3.5 w-3.5 text-muted" aria-hidden />
            {zone === null ? (
              <span className="text-muted">{t('pomo.locating')}</span>
            ) : place ? (
              <span>{place}</span>
            ) : null}
            {offset ? (
              <span className="rounded-full border border-line bg-cream/70 px-2 py-0.5 text-[11px] tabular-nums text-muted">
                {offset}
              </span>
            ) : null}
          </p>
        </div>
        <p
          className="font-display text-[44px] leading-none tabular-nums tracking-[-0.01em] sm:text-[52px]"
          aria-label={t('pomo.localTime')}
        >
          {mounted && zone !== null ? formatTime(new Date(now), zone.timeZone) : '--:--:--'}
        </p>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-muted">{t('pomo.localNote')}</p>
    </section>
  );
}
