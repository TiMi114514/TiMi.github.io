'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ExternalLink, MapPin, Timer } from 'lucide-react';
import { EXAMS_BY_ZONE, EXAM_SOURCES, type ExamRow, type ExamZone } from '@/lib/exam-timetable';
import { DEFAULT_ZONE } from '@/lib/exam-zones';
import { examZoneFor, getVisitorPlace, readSavedZone, saveZone } from '@/lib/visitor-place';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';

type Upcoming = {
  start: number;
  session: ExamRow[1];
  level: ExamRow[2];
  syllabus: string;
  component: string;
  title: string;
  duration: string;
  series: string;
};

const ZONES: ExamZone[] = [1, 2, 3, 4, 5, 6];

function upcoming(zone: ExamZone, now: number, count: number): Upcoming[] {
  const out: Upcoming[] = [];
  for (const row of EXAMS_BY_ZONE[zone]) {
    const start = Date.parse(row[0]);
    if (start <= now) continue;
    out.push({ start, session: row[1], level: row[2], syllabus: row[3], component: row[4], title: row[5], duration: row[6], series: row[7] });
    if (out.length === count) break;
  }
  return out;
}

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/**
 * Next three AS & A Level sittings for the visitor's Cambridge zone, with live
 * countdowns. Zone priority: signed-in profile > saved choice > IP location > Zone 5.
 * Times are shown in the visitor's IP timezone (falls back to the device clock).
 */
export function RecentExams() {
  const { locale, t } = useI18n();
  const { user } = useAuth();
  const [now, setNow] = useState<number | null>(null);
  const [zone, setZone] = useState<ExamZone>(DEFAULT_ZONE);
  const [zoneSource, setZoneSource] = useState<'default' | 'ip' | 'saved' | 'account'>('default');
  const [timeZone, setTimeZone] = useState<string | undefined>(undefined);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    const saved = readSavedZone();
    if (saved) {
      setZone(saved);
      setZoneSource('saved');
    }
    getVisitorPlace().then((place) => {
      if (!alive) return;
      if (place.timezone) setTimeZone(place.timezone);
      if (!saved) {
        setZone(examZoneFor(place));
        setZoneSource(place.country || place.timezone ? 'ip' : 'default');
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // A signed-in user's saved zone wins.
  useEffect(() => {
    if (!user || !supabase) return;
    let alive = true;
    supabase.rpc('my_preferences').then(({ data }) => {
      const z = Number((data as { exam_zone?: number } | null)?.exam_zone);
      if (alive && z >= 1 && z <= 6) {
        setZone(z as ExamZone);
        setZoneSource('account');
      }
    });
    return () => {
      alive = false;
    };
  }, [user]);

  function chooseZone(next: ExamZone) {
    setZone(next);
    setZoneSource('saved');
    saveZone(next);
    if (user && supabase) void supabase.rpc('set_my_preferences', { p_exam_zone: next });
  }

  const minute = now === null ? null : Math.floor(now / 60_000);
  const items = useMemo(() => (minute === null ? [] : upcoming(zone, minute * 60_000, 3)), [zone, minute]);

  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone, weekday: 'short', month: 'short', day: 'numeric' }), [locale, timeZone]);
  const timeFmt = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }), [locale, timeZone]);
  const tzLabel = useMemo(() => {
    try {
      const part = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
      return part?.value ?? '';
    } catch {
      return '';
    }
  }, [timeZone]);

  const sessionLabel = (s: Upcoming['session']) => (s === 'AM' ? t('exams.session.am') : s === 'PM' ? t('exams.session.pm') : t('exams.session.ev'));
  const sourceLabel =
    zoneSource === 'account' ? t('exams.zoneFromAccount') : zoneSource === 'saved' ? t('exams.zoneSaved') : zoneSource === 'ip' ? t('exams.zoneFromIp') : t('exams.zoneDefault');

  return (
    <section className="border-t border-line/60">
      <div className="container-page py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{t('exams.eyebrow')}</p>
            <h2 className="mt-3 font-display text-[38px] leading-none tracking-[-0.01em] sm:text-[44px]">{t('exams.title')}</h2>
            <p className="mt-3 max-w-[560px] text-[13px] leading-relaxed text-muted">{t('exams.subtitleZone', { n: zone, tz: tzLabel })}</p>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            <select
              value={zone}
              onChange={(event) => chooseZone(Number(event.target.value) as ExamZone)}
              className="rounded-full border border-line bg-paper px-3 py-1.5 text-[12.5px] text-ink"
              aria-label={t('signup.examZone')}
            >
              {ZONES.map((z) => (
                <option key={z} value={z}>
                  {t('exams.zoneOption', { n: z })}
                </option>
              ))}
            </select>
            <span className="hidden text-[11px] sm:inline">{sourceLabel}</span>
          </label>
        </div>

        {now === null ? (
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[210px] animate-pulse rounded-2xl bg-soft/60" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-line px-6 py-10 text-center text-[13px] text-muted">{t('exams.none')}</p>
        ) : (
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {items.map((exam, index) => {
              const left = parts(exam.start - now);
              const soon = exam.start - now < 86_400_000;
              return (
                <li
                  key={`${exam.start}-${exam.syllabus}-${exam.component}`}
                  className={`flex flex-col rounded-2xl border bg-paper p-6 shadow-card ${index === 0 ? 'border-ink/30' : 'border-line'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-line bg-soft/70 px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
                      {exam.level === 'AS' ? 'AS Level' : 'A Level'} · {exam.syllabus}/{exam.component}
                    </span>
                    {index === 0 ? <span className="text-[11px] font-medium text-[#b4543f]">{t('exams.next')}</span> : null}
                  </div>
                  <h3 className="mt-4 font-display text-[23px] leading-[1.15] tracking-[-0.01em]">{exam.title}</h3>
                  <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                    {dateFmt.format(exam.start)} · {timeFmt.format(exam.start)} ({sessionLabel(exam.session)}) · {exam.duration}
                  </p>
                  <div className="mt-auto pt-5">
                    <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted">
                      <Timer className="h-3.5 w-3.5" aria-hidden /> {t('exams.startsIn')}
                    </p>
                    <p
                      className={`mt-1.5 font-display text-[30px] leading-none tabular-nums ${soon ? 'text-[#b4543f]' : 'text-ink'}`}
                      aria-live={index === 0 ? 'polite' : undefined}
                    >
                      {t('exams.countdown', { d: left.d, h: String(left.h).padStart(2, '0'), m: String(left.m).padStart(2, '0'), s: String(left.s).padStart(2, '0') })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] leading-relaxed text-muted">
          <span>{t('exams.noteZone')}</span>
          {Object.entries(EXAM_SOURCES[zone]).map(([series, url]) => (
            <a key={series} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline decoration-line underline-offset-4 hover:text-ink">
              {series} <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ))}
        </p>
      </div>
    </section>
  );
}
