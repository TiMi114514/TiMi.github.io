'use client';

import Link from 'next/link';
import {
  BookOpen,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { TutorWorkspace } from '@/components/TutorWorkspace';
import { TutorTabs } from '@/components/TutorTabs';
import { useAuth } from '@/components/AuthProvider';
import { useT } from '@/lib/i18n';

const features = [
  { icon: BookOpen, title: 'home.f1t', body: 'home.f1b' },
  { icon: MessageSquareText, title: 'home.f2t', body: 'home.f2b' },
  { icon: ShieldCheck, title: 'home.f3t', body: 'home.f3b' },
] as const;

export default function TutorPage() {
  const { user, loading, verified, configured } = useAuth();
  const t = useT();

  return (
    <div>
      <Header />
      <main className="container-page py-12 sm:py-16">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <TutorTabs active="ai" />
          <p className="text-[12px] text-muted">{t('tutor.sub')}</p>
        </div>
        <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <aside>
            <p className="eyebrow">{t('tutor.eyebrow')}</p>
            <h1 className="mt-4 max-w-[370px] font-display text-[40px] leading-[0.98] tracking-[-0.01em] sm:text-[46px]">
              {t('tutor.title')}
            </h1>
            <p className="mt-5 max-w-[380px] text-[14px] leading-relaxed text-muted">
              {t('tutor.body')}
            </p>

            <ul className="mt-8 space-y-5">
              {features.map((feature) => (
                <li key={feature.title} className="flex gap-3.5">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-paper">
                    <feature.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-medium">{t(feature.title)}</p>
                    <p className="mt-0.5 max-w-[320px] text-[12.5px] leading-relaxed text-muted">
                      {t(feature.body)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </aside>

          <section>
            {!configured ? (
              <div className="card p-8">
                <p className="eyebrow">{t('tutor.notConfiguredEyebrow')}</p>
                <h2 className="mt-3 font-display text-[30px] leading-tight">
                  {t('tutor.notConfiguredTitle')}
                </h2>
                <p className="mt-3 max-w-[440px] text-[13px] leading-relaxed text-muted">
                  {t('tutor.notConfiguredBody')}
                </p>
              </div>
            ) : loading ? (
              <div className="h-[560px] animate-pulse rounded-2xl bg-soft/60" />
            ) : !user ? (
              <div className="card p-8">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-line bg-cream">
                  <LockKeyhole className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <h2 className="mt-4 font-display text-[32px] leading-tight">
                  {t('tutor.signInTitle')}
                </h2>
                <p className="mt-3 max-w-[420px] text-[13.5px] leading-relaxed text-muted">
                  {t('tutor.signInBody')}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/login" className="btn-dark px-5 py-2.5">
                    {t('auth.signIn')}
                  </Link>
                  <Link href="/signup" className="btn-light px-5 py-2.5">
                    {t('signup.create')}
                  </Link>
                </div>
              </div>
            ) : !verified ? (
              <div className="card p-8">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-[#e7d3b0] bg-[#fbf3e2]">
                  <ShieldCheck className="h-[18px] w-[18px] text-[#8a6420]" aria-hidden />
                </span>
                <h2 className="mt-4 font-display text-[32px] leading-tight">
                  {t('tutor.verifyTitle')}
                </h2>
                <p className="mt-3 max-w-[420px] text-[13.5px] leading-relaxed text-muted">
                  {t('tutor.verifyBody', { email: user.email ?? '' })}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/account" className="btn-dark px-5 py-2.5">
                    {t('tutor.resend')}
                  </Link>
                  <Link href="/papers" className="btn-light px-5 py-2.5">
                    {t('tutor.browse')}
                  </Link>
                </div>
              </div>
            ) : (
              <TutorWorkspace />
            )}

            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
              {t('tutor.disclaimer')}
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
