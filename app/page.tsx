'use client';

import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { HeroPapers } from '@/components/HeroPapers';
import { HomeStats } from '@/components/HomeStats';
import { PaperCard } from '@/components/PaperCard';
import { samplePapers } from '@/lib/papers';
import { useT, type MessageKey } from '@/lib/i18n';

function renderTemplate(template: string, slots: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const match = /^\{(\w+)\}$/.exec(part);
    if (match && match[1] in slots) return <Fragment key={i}>{slots[match[1]]}</Fragment>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function TutorMock() {
  const t = useT();
  return (
    <div className="card overflow-hidden" aria-hidden>
      <div className="flex items-center justify-between border-b border-line/80 px-5 py-3.5">
        <span className="font-display text-[17px]">{t('home.mockTitle')}</span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3f7d5a]" />
          {t('home.mockConnected')}
        </span>
      </div>
      <div className="space-y-4 bg-paper px-5 py-5">
        <div className="flex justify-end">
          <p className="max-w-[80%] rounded-2xl rounded-br-md bg-ink px-4 py-3 text-[13px] leading-relaxed text-cream">
            {t('home.mockQ')}
          </p>
        </div>
        <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-cream/50 px-4 py-3 text-[13px] leading-relaxed">
          <p>{t('home.mockA')}</p>
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line/70 pt-3">
            <span className="rounded-md border border-line bg-paper px-2 py-1 text-[11px] text-muted">
              {t('home.mockCite')}
            </span>
            <span className="rounded-md border border-line bg-paper px-2 py-1 text-[11px] text-muted">
              2023 · {t('type.paper', { n: 2 })} · Q4
            </span>
          </div>
        </div>
      </div>
      <div className="border-t border-line/80 px-4 py-3 text-[12.5px] text-muted">
        {t('home.mockFollow')}
      </div>
    </div>
  );
}

const tutorFeatures: { icon: typeof BookOpen; title: MessageKey; body: MessageKey }[] = [
  { icon: BookOpen, title: 'home.f1t', body: 'home.f1b' },
  { icon: MessageSquareText, title: 'home.f2t', body: 'home.f2b' },
  { icon: ShieldCheck, title: 'home.f3t', body: 'home.f3b' },
];

export default function HomePage() {
  const t = useT();
  const featured = samplePapers.slice(0, 3);

  return (
    <div>
      <Header />

      <main>
        {/* Hero */}
        <section className="container-page pb-16 pt-14 sm:pt-20 lg:pb-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.12fr_0.88fr]">
            <div className="animate-fade-up">
              <p className="eyebrow">{t('home.eyebrow')}</p>
              <h1 className="mt-5 font-display text-[clamp(38px,8.2vw,64px)] leading-[0.98] tracking-[-0.02em]">
                {t('home.title1')}
                <br />
                {renderTemplate(t('home.title2'), {
                  em: <em className="italic">{t('home.titleEm')}</em>,
                })}
                <br />
                {t('home.title3')}
              </h1>
              <p className="mt-7 max-w-[490px] text-[14.5px] leading-relaxed text-muted">
                {t('home.intro')}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/papers" className="btn-dark px-5 py-3">
                  {t('home.browse')}
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link href="/tutor" className="btn-light px-5 py-3">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  {t('home.ask')}
                </Link>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-2 text-[12px] text-muted">
                <span>{t('home.free')}</span>
                <span className="hidden text-line sm:inline">·</span>
                <span>{t('home.verified')}</span>
                <span className="hidden text-line sm:inline">·</span>
                <span>{t('home.citations')}</span>
              </div>
            </div>

            <div className="animate-fade-up">
              <HeroPapers />
            </div>
          </div>

          <div className="mt-12">
            <HomeStats />
          </div>
        </section>

        {/* Archive preview */}
        <section className="border-t border-line/60">
          <div className="container-page py-16 sm:py-20">
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="eyebrow">{t('home.archiveEyebrow')}</p>
                <h2 className="mt-3 font-display text-[38px] leading-none tracking-[-0.01em] sm:text-[44px]">
                  {t('home.recent')}
                </h2>
              </div>
              <Link
                href="/papers"
                className="hidden items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink sm:flex"
              >
                {t('home.allPapers')} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {featured.map((paper) => (
                <PaperCard key={paper.id} paper={paper} />
              ))}
            </div>

            <div className="mt-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <p className="text-[12px] text-muted">{t('home.sampleNote')}</p>
              <Link
                href="/papers"
                className="flex items-center gap-1.5 text-[12.5px] text-muted transition-colors hover:text-ink sm:hidden"
              >
                {t('home.allPapers')} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        {/* AI tutor */}
        <section className="border-t border-line/60">
          <div className="container-page grid gap-12 py-16 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
            <div>
              <p className="eyebrow">{t('home.tutorsEyebrow')}</p>
              <h2 className="mt-4 max-w-[430px] font-display text-[38px] leading-[1.0] tracking-[-0.01em] sm:text-[44px]">
                {t('home.tutorTitle')}
              </h2>
              <p className="mt-5 max-w-[420px] text-[14px] leading-relaxed text-muted">
                {t('home.tutorBody')}
              </p>

              <ul className="mt-8 space-y-5">
                {tutorFeatures.map((feature) => (
                  <li key={feature.title} className="flex gap-3.5">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-paper">
                      <feature.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[13.5px] font-medium">{t(feature.title)}</p>
                      <p className="mt-0.5 max-w-[340px] text-[12.5px] leading-relaxed text-muted">
                        {t(feature.body)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/tutor" className="btn-dark px-5 py-3">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  {t('home.openAi')}
                </Link>
                <Link href="/tutor/human" className="btn-light px-5 py-3">
                  <UserRound className="h-4 w-4" aria-hidden />
                  {t('home.bookHuman')}
                </Link>
              </div>
            </div>

            <TutorMock />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
