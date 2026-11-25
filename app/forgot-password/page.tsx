'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { appUrl, supabase } from '@/lib/supabase';
import { logSecurityEvent } from '@/lib/security-events';
import { useT } from '@/lib/i18n';

export default function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setError(t('auth.notConfigured'));
      return;
    }
    setBusy(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: appUrl('/auth/reset'),
    });
    setBusy(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    logSecurityEvent('password_reset_requested', email.trim());
    setSent(true);
  }

  return (
    <div>
      <Header />
      <main className="container-page flex min-h-[calc(100vh-72px)] items-start justify-center py-16">
        <div className="w-full max-w-[440px]">
          {sent ? (
            <>
              <span className="grid h-11 w-11 place-items-center rounded-full border border-line bg-paper">
                <MailCheck className="h-5 w-5" aria-hidden />
              </span>
              <h1 className="mt-5 font-display text-[38px] leading-[1.02] tracking-[-0.01em]">
                {t('forgot.checkInbox')}
              </h1>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                {t('forgot.ifExists').split(/(\{\w+\})/).map((part, index) =>
                  part === '{email}' ? (
                    <span key={index} className="text-ink">
                      {email}
                    </span>
                  ) : (
                    part
                  ),
                )}
              </p>
              <p className="mt-4 rounded-xl border border-line bg-paper px-3.5 py-3 text-[12px] leading-relaxed text-muted">
                {t('forgot.expires')}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/login" className="btn-dark px-5 py-2.5">
                  {t('forgot.back')}
                </Link>
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="btn-light px-5 py-2.5"
                >
                  {t('forgot.different')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow">{t('forgot.eyebrow')}</p>
              <h1 className="mt-3 font-display text-[42px] leading-none tracking-[-0.01em]">
                {t('forgot.title')}
              </h1>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                {t('forgot.body')}
              </p>

              <form onSubmit={submit} className="mt-8 space-y-4">
                <label className="block space-y-1.5 text-[12.5px] text-muted">
                  <span>{t('auth.email')}</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    className="input"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </label>

                {error ? (
                  <p className="rounded-xl border border-[#e7c9c1] bg-[#fbeeea] px-3 py-2 text-[12.5px] leading-relaxed text-[#8a3b2a]">
                    {error}
                  </p>
                ) : null}

                <button type="submit" disabled={busy} className="btn-dark w-full py-3">
                  {busy ? t('forgot.sending') : t('forgot.send')}
                </button>
              </form>

              <p className="mt-6 text-[13px] text-muted">
                {t('forgot.remembered')}{' '}
                <Link href="/login" className="link-underline text-ink">
                  {t('auth.signIn')}
                </Link>
              </p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
