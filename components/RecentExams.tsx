'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ExternalLink, Timer } from 'lucide-react';
import { EXAMS, EXAM_SOURCES, type ExamRow } from '@/lib/exam-timetable';
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

const ZONE = 'Asia/Shanghai';

function upcoming(now: number, count: number): Upcoming[] {
  const out: Upcoming[] = [];
  for (const row of EXAMS) {
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

/** Next three AS & A Level sittings (Cambridge Zone 5, Shanghai time) with live countdowns. */
export function RecentExams() {
  const { locale, t } = useI18n();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Recompute the list only when an exam starts, not every second.
  const minute = now === null ? null : Math.floor(now / 60_000);
  const items = useMemo(() => (minute === null ? [] : upcoming(minute * 60_000, 3)), [minute]);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { timeZone: ZONE, weekday: 'short', month: 'short', day: 'numeric' }),
    [locale],
  );
  const timeFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hour12: false }),
    [locale],
  );

  const sessionLabel = (s: Upcoming['session']) =>
    s === 'AM' ? t('exams.session.am') : s === 'PM' ? t('exams.session.pm') : t('exams.session.ev');

  return (
    <section className="border-t border-line/60">
      <div className="container-page py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{t('exams.eyebrow')}</p>
            <h2 className="mt-3 font-display text-[38px] leading-none tracking-[-0.01em] sm:text-[44px]">
              {t('exams.title')}
            </h2>
            <p className="mt-3 max-w-[560px] text-[13px] leading-relaxed text-muted">{t('exams.subtitle')}</p>
          </div>
        </div>

        {now === null ? (
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[210px] animate-pulse rounded-2xl bg-soft/60" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-line px-6 py-10 text-center text-[13px] text-muted">
            {t('exams.none')}
          </p>
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
                    {index === 0 ? (
                      <span className="text-[11px] font-medium text-[#b4543f]">{t('exams.next')}</span>
                    ) : null}
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
                      {t('exams.countdown', {
                        d: left.d,
                        h: String(left.h).padStart(2, '0'),
                        m: String(left.m).padStart(2, '0'),
                        s: String(left.s).padStart(2, '0'),
                      })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] leading-relaxed text-muted">
          <span>{t('exams.note')}</span>
          {Object.entries(EXAM_SOURCES).map(([series, url]) => (
            <a
              key={series}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline decoration-line underline-offset-4 hover:text-ink"
            >
              {series} <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ))}
        </p>
      </div>
    </section>
  );
}
