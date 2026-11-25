'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function Footer() {
  const t = useT();
  return (
    <footer className="mt-24 border-t border-line/70 bg-cream">
      <div className="container-page flex flex-col gap-8 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <Link href="/" prefetch={false} className="group flex items-center gap-2.5">
            <img
              src={`${basePath}/brand-mark.png`}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-lg object-cover transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105"
            />
            <span className="font-display text-[20px]">A-Level Hub</span>
          </Link>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            {t('footer.tagline')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-12 text-[13px] sm:gap-16">
          <div className="space-y-2.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{t('footer.study')}</p>
            <Link href="/papers" className="block transition-colors hover:text-ink">
              {t('nav.papers')}
            </Link>
            <Link href="/tutor" className="block transition-colors hover:text-ink">
              {t('footer.aiTutor')}
            </Link>
            <Link href="/tutor/human" className="block transition-colors hover:text-ink">
              {t('footer.humanTutor')}
            </Link>
            <Link href="/pomodoro" className="block transition-colors hover:text-ink">
              {t('nav.pomodoro')}
            </Link>
          </div>
          <div className="space-y-2.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{t('footer.account')}</p>
            <Link href="/login" className="block transition-colors hover:text-ink">
              {t('nav.signIn')}
            </Link>
            <Link href="/signup" className="block transition-colors hover:text-ink">
              {t('footer.createAccount')}
            </Link>
            <Link href="/account" className="block transition-colors hover:text-ink">
              {t('footer.myAccount')}
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-line/70">
        <div className="container-page flex flex-col gap-2 py-5 text-[11.5px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>{t('footer.rights', { year: new Date().getFullYear() })}</p>
          <p>{t('footer.disclaimer')}</p>
        </div>
      </div>
    </footer>
  );
}
