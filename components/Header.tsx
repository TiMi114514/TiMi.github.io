'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Pomodoro } from './Pomodoro';
import { useAuth } from './AuthProvider';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useT } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nav: { href: string; label: MessageKey }[] = [
  { href: '/papers', label: 'nav.papers' },
  { href: '/tutor', label: 'nav.tutors' },
  { href: '/pomodoro', label: 'nav.pomodoro' },
  { href: '/donate', label: 'nav.donate' },
];

export function Header() {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { user, loading, signOut, isAdmin } = useAuth();
  const t = useT();

  const displayName =
    (user?.user_metadata?.display_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    '';

  async function handleSignOut() {
    await signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-cream/90 backdrop-blur">
      <div className="container-page flex h-[72px] items-center justify-between gap-3 sm:gap-6">
        <Link
          href="/"
          prefetch={false}
          className="group flex items-center gap-2.5"
          aria-label={t('nav.home')}
        >
          <img
            src={`${basePath}/brand-mark.png`}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-lg object-cover transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105"
          />
          <span className="hidden whitespace-nowrap font-display text-[17px] tracking-[-0.01em] transition-colors group-hover:text-[#2b2921] min-[420px]:inline sm:text-[20px]">
            A-Level Hub
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-[13px] text-muted md:flex">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href.replace(/\/$/, ''));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? 'text-ink' : 'transition-colors hover:text-ink'}
              >
                {t(item.label)}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 text-[13px] sm:gap-3">
          <LanguageSwitcher />
          <Pomodoro />
          {loading ? (
            <span className="h-8 w-24 animate-pulse rounded-full bg-soft" />
          ) : user ? (
            <>
              {isAdmin ? (
                <Link
                  href="/admin"
                  className="hidden rounded-full border border-line bg-paper/70 px-3 py-2 text-[12.5px] text-ink transition-all duration-200 hover:-translate-y-0.5 hover:bg-white sm:inline-flex"
                >
                  {t('nav.admin')}
                </Link>
              ) : null}
              <span className="hidden max-w-[160px] truncate text-muted sm:inline">
                {displayName}
              </span>
              <button onClick={handleSignOut} className="btn-outline">
                {t('nav.signOut')}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden text-muted transition-colors hover:text-ink sm:inline">
                {t('nav.signIn')}
              </Link>
              <Link href="/signup" className="btn-dark px-4 py-2">
                {t('nav.getStarted')}
              </Link>
            </>
          )}
        </div>
      </div>

      <nav className="border-t border-line/50 md:hidden">
        <div className="container-page flex items-center gap-6 overflow-x-auto py-2.5 text-[12.5px] text-muted">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href.replace(/\/$/, ''));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 ${active ? 'text-ink' : 'hover:text-ink'}`}
              >
                {t(item.label)}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
