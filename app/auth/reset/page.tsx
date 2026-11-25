'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

export default function ResetPasswordPage() {
  const router = useRouter();
  const t = useT();
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
      setError(t('reset.short'));
      return;
    }
    if (password !== confirm) {
      setError(t('reset.mismatch'));
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
              <h1 className="font-display text-[38px] leading-tight">{t('reset.expiredTitle')}</h1>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                {t('reset.expiredBody')}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/forgot-password" className="btn-dark px-5 py-2.5">
                  {t('reset.requestNew')}
                </Link>
                <Link href="/login" className="btn-light px-5 py-2.5">
                  {t('auth.signIn')}
                </Link>
              </div>
            </>
          ) : !ready ? (
            <>
              <h1 className="font-display text-[36px] leading-tight">{t('reset.checking')}</h1>
              <p className="mt-3 text-[13.5px] text-muted">
                {t('reset.checkingBody')}
              </p>
              <span className="mt-8 block h-1.5 w-40 animate-pulse rounded-full bg-soft" />
            </>
          ) : (
            <>
              <p className="eyebrow">{t('reset.eyebrow')}</p>
              <h1 className="mt-3 font-display text-[42px] leading-none tracking-[-0.01em]">
                {t('reset.title')}
              </h1>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                {t('reset.body')}
              </p>

              <form onSubmit={submit} className="mt-8 space-y-4">
                <label className="block space-y-1.5 text-[12.5px] text-muted">
                  <span>{t('reset.newPw')}</span>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="input"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t('auth.atLeast8')}
                  />
                </label>
                <label className="block space-y-1.5 text-[12.5px] text-muted">
                  <span>{t('reset.confirm')}</span>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="input"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder={t('reset.confirmPh')}
                  />
                </label>

                {error ? (
                  <p className="rounded-xl border border-[#e7c9c1] bg-[#fbeeea] px-3 py-2 text-[12.5px] leading-relaxed text-[#8a3b2a]">
                    {error}
                  </p>
                ) : null}

                <button type="submit" disabled={busy} className="btn-dark w-full py-3">
                  {busy ? t('reset.saving') : t('reset.save')}
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
