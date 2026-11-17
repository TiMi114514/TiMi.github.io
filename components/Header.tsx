'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

const nav = [
  { href: '/papers', label: 'Past papers' },
  { href: '/tutor', label: 'AI tutor' },
  { href: '/#how-it-works', label: 'How it works' },
];

export function Header() {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { user, loading, signOut, isAdmin } = useAuth();

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
      <div className="container-page flex h-[72px] items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Paperwise home">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-ink font-display text-[19px] leading-none text-cream">
            P
          </span>
          <span className="font-display text-[20px] tracking-[-0.01em]">Paperwise</span>
        </Link>

        <nav className="hidden items-center gap-8 text-[13px] text-muted md:flex">
          {nav.map((item) => {
            const active =
              item.href !== '/#how-it-works' && pathname.startsWith(item.href.replace(/\/$/, ''));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? 'text-ink' : 'transition-colors hover:text-ink'}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 text-[13px]">
          {loading ? (
            <span className="h-8 w-24 animate-pulse rounded-full bg-soft" />
          ) : user ? (
            <>
              {isAdmin ? (
                <Link
                  href="/admin"
                  className="hidden rounded-full border border-line bg-paper/70 px-3 py-2 text-[12.5px] text-ink transition-colors hover:bg-white sm:inline-flex"
                >
                  Admin
                </Link>
              ) : null}
              <span className="hidden max-w-[160px] truncate text-muted sm:inline">
                {displayName}
              </span>
              <button onClick={handleSignOut} className="btn-outline">
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden text-muted transition-colors hover:text-ink sm:inline">
                Sign in
              </Link>
              <Link href="/signup" className="btn-dark px-4 py-2">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>

      <nav className="border-t border-line/50 md:hidden">
        <div className="container-page flex items-center gap-6 overflow-x-auto py-2.5 text-[12.5px] text-muted">
          {nav.map((item) => {
            const active =
              item.href !== '/#how-it-works' && pathname.startsWith(item.href.replace(/\/$/, ''));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 ${active ? 'text-ink' : 'hover:text-ink'}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
