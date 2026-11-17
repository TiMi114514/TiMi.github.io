'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Download, LogOut, MailWarning } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/components/AuthProvider';
import { appUrl, supabase } from '@/lib/supabase';

type DownloadRow = {
  id: string | number;
  paper_title: string | null;
  created_at: string;
};

export default function AccountPage() {
  const router = useRouter();
  const { user, loading, verified, signOut, refresh } = useAuth();
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<DownloadRow[] | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!supabase || !user) return;
    let active = true;
    supabase
      .from('downloads')
      .select('id, paper_title, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (active) setHistory((data as DownloadRow[] | null) ?? []);
      });
    return () => {
      active = false;
    };
  }, [user]);

  async function resend() {
    if (!supabase || !user?.email) return;
    setResending(true);
    setNotice(null);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: user.email,
      options: { emailRedirectTo: appUrl('/auth/callback') },
    });
    setResending(false);
    setNotice(
      error
        ? error.message
        : 'Verification email sent. Open the link in your inbox to confirm your address.',
    );
  }

  async function handleSignOut() {
    await signOut();
    router.push('/');
  }

  if (loading || !user) {
    return (
      <div>
        <Header />
        <main className="container-page py-24">
          <div className="mx-auto h-40 w-full max-w-[520px] animate-pulse rounded-2xl bg-soft/70" />
        </main>
        <Footer />
      </div>
    );
  }

  const name =
    (user.user_metadata?.display_name as string | undefined) || user.email?.split('@')[0] || 'Student';
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <div>
      <Header />
      <main className="container-page py-14 sm:py-20">
        <div className="mx-auto max-w-[760px]">
          <p className="eyebrow">My account</p>
          <h1 className="mt-3 font-display text-[42px] leading-none tracking-[-0.01em]">
            {name}
          </h1>

          <div className="mt-8 card p-6">
            <div className="flex flex-wrap items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-ink font-display text-[24px] text-cream">
                {initial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px]">{user.email}</p>
                <div className="mt-1.5 flex items-center gap-2 text-[12px]">
                  {verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#cfe1d4] bg-[#eef5ef] px-2 py-0.5 text-[#3f7d5a]">
                      <BadgeCheck className="h-3.5 w-3.5" /> Email verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#e7d3b0] bg-[#fbf3e2] px-2 py-0.5 text-[#8a6420]">
                      <MailWarning className="h-3.5 w-3.5" /> Email not verified
                    </span>
                  )}
                  <span className="text-muted">
                    joined{' '}
                    {new Date(user.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            </div>

            {!verified ? (
              <div className="mt-6 rounded-xl border border-[#e7d3b0] bg-[#fbf3e2] px-4 py-3">
                <p className="text-[13px] leading-relaxed text-[#6d5320]">
                  Verify your email to unlock downloads and the AI tutor.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={resend}
                    disabled={resending}
                    className="btn-dark px-4 py-2"
                  >
                    {resending ? 'Sending…' : 'Resend verification email'}
                  </button>
                  <button type="button" onClick={() => refresh()} className="btn-outline">
                    I&apos;ve verified
                  </button>
                </div>
                {notice ? (
                  <p className="mt-3 text-[12px] leading-relaxed text-[#6d5320]">{notice}</p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3 border-t border-line/70 pt-5">
              <Link href="/papers" className="btn-light px-4 py-2">
                <Download className="h-4 w-4" aria-hidden /> Browse papers
              </Link>
              <Link href="/tutor" className="btn-light px-4 py-2">
                Open the tutor
              </Link>
              <button type="button" onClick={handleSignOut} className="btn-outline ml-auto">
                <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
              </button>
            </div>
          </div>

          <div className="mt-10">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow">History</p>
                <h2 className="mt-2 font-display text-[26px] leading-none">Recent downloads</h2>
              </div>
            </div>

            <div className="mt-4 divide-y divide-line/70 rounded-2xl border border-line bg-paper">
              {history === null ? (
                <p className="px-5 py-4 text-[13px] text-muted">Loading…</p>
              ) : history.length === 0 ? (
                <p className="px-5 py-4 text-[13px] text-muted">
                  Nothing yet — papers you download will show up here.
                </p>
              ) : (
                history.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 text-[13px]"
                  >
                    <span className="truncate">{row.paper_title || 'Past paper'}</span>
                    <span className="shrink-0 text-[12px] text-muted">
                      {new Date(row.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
