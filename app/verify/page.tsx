'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/components/AuthProvider';
import { appUrl, supabase } from '@/lib/supabase';

export default function VerifyPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = window.sessionStorage.getItem('paperwise.pendingEmail');
    if (stored) setEmail(stored);
  }, []);

  useEffect(() => {
    if (!loading && user) router.replace('/account');
  }, [loading, user, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    if (!supabase || !email.trim() || cooldown > 0) return;
    setBusy(true);
    setStatus(null);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: appUrl('/auth/callback') },
    });
    setBusy(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    setStatus('Verification email sent again. It can take a minute to arrive.');
    setCooldown(45);
  }

  async function checkAgain() {
    await refresh();
    setStatus('Still waiting for confirmation. Open the link in your inbox first.');
  }

  return (
    <div>
      <Header />
      <main className="container-page flex min-h-[calc(100vh-72px)] items-start justify-center py-16">
        <div className="w-full max-w-[460px]">
          <span className="grid h-11 w-11 place-items-center rounded-full border border-line bg-paper">
            <MailCheck className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="mt-5 font-display text-[40px] leading-none tracking-[-0.01em]">
            Check your inbox
          </h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
            We sent a verification link{email ? <> to <span className="text-ink">{email}</span></> : ''}.
            Open it on this device and you&apos;ll be signed in automatically.
          </p>

          <div className="mt-7 space-y-3">
            <label className="block space-y-1.5 text-[12.5px] text-muted">
              <span>Email used to sign up</span>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>

            {status ? (
              <p className="rounded-xl border border-line bg-paper px-3 py-2 text-[12.5px] leading-relaxed text-muted">
                {status}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={resend}
                disabled={busy || cooldown > 0}
                className="btn-dark px-5 py-2.5"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : busy ? 'Sending…' : 'Resend email'}
              </button>
              <button type="button" onClick={checkAgain} className="btn-light px-5 py-2.5">
                I&apos;ve verified
              </button>
            </div>
          </div>

          <p className="mt-8 text-[12.5px] leading-relaxed text-muted">
            Nothing arrived? Check spam, or{' '}
            <Link href="/login" className="link-underline text-ink">
              sign in
            </Link>{' '}
            if you have already confirmed your address.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
