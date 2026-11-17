'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setExpired(true);
      return;
    }
    let cancelled = false;

    async function waitForRecoverySession() {
      for (let attempt = 0; attempt < 14; attempt += 1) {
        const { data } = await supabase!.auth.getSession();
        if (data.session) {
          if (!cancelled) setReady(true);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      if (!cancelled) setExpired(true);
    }

    void waitForRecoverySession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      setError(updateError.message);
      return;
    }

    const { data: adminFlag } = await supabase.rpc('is_admin');
    router.replace(adminFlag === true ? '/admin' : '/account');
  }

  return (
    <div>
      <Header />
      <main className="container-page flex min-h-[calc(100vh-72px)] items-start justify-center py-16">
        <div className="w-full max-w-[440px]">
          {expired ? (
            <>
              <h1 className="font-display text-[38px] leading-tight">This link has expired</h1>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                Reset links are single-use and short-lived. Request a fresh one and open it on this
                device.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/forgot-password" className="btn-dark px-5 py-2.5">
                  Request a new link
                </Link>
                <Link href="/login" className="btn-light px-5 py-2.5">
                  Sign in
                </Link>
              </div>
            </>
          ) : !ready ? (
            <>
              <h1 className="font-display text-[36px] leading-tight">Checking your link…</h1>
              <p className="mt-3 text-[13.5px] text-muted">
                One moment while we verify the reset token.
              </p>
              <span className="mt-8 block h-1.5 w-40 animate-pulse rounded-full bg-soft" />
            </>
          ) : (
            <>
              <p className="eyebrow">Choose a new password</p>
              <h1 className="mt-3 font-display text-[42px] leading-none tracking-[-0.01em]">
                Reset password
              </h1>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                Pick something you have not used before. You will be signed in automatically.
              </p>

              <form onSubmit={submit} className="mt-8 space-y-4">
                <label className="block space-y-1.5 text-[12.5px] text-muted">
                  <span>New password</span>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="input"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                  />
                </label>
                <label className="block space-y-1.5 text-[12.5px] text-muted">
                  <span>Confirm new password</span>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="input"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="Repeat the password"
                  />
                </label>

                {error ? (
                  <p className="rounded-xl border border-[#e7c9c1] bg-[#fbeeea] px-3 py-2 text-[12.5px] leading-relaxed text-[#8a3b2a]">
                    {error}
                  </p>
                ) : null}

                <button type="submit" disabled={busy} className="btn-dark w-full py-3">
                  {busy ? 'Saving…' : 'Save new password'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
