'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setFailed(true);
      return;
    }

    let cancelled = false;

    async function waitForSession() {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const { data } = await supabase!.auth.getSession();
        if (data.session) {
          if (!cancelled) router.replace('/account');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      if (!cancelled) setFailed(true);
    }

    void waitForSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div>
      <Header />
      <main className="container-page flex min-h-[calc(100vh-72px)] items-center justify-center py-16">
        <div className="w-full max-w-[440px] text-center">
          {failed ? (
            <>
              <h1 className="font-display text-[36px] leading-tight">This link has expired</h1>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                Verification links are single-use. Sign in to request a fresh one from your account
                page.
              </p>
              <div className="mt-7 flex justify-center gap-3">
                <Link href="/login" className="btn-dark px-5 py-2.5">
                  Sign in
                </Link>
                <Link href="/verify" className="btn-light px-5 py-2.5">
                  Resend email
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display text-[36px] leading-tight">Signing you in…</h1>
              <p className="mt-3 text-[13.5px] text-muted">
                Confirming your email and opening your account.
              </p>
              <span className="mx-auto mt-8 block h-1.5 w-40 animate-pulse rounded-full bg-soft" />
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
