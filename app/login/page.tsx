'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace(isAdmin ? '/admin' : '/account');
  }, [loading, user, isAdmin, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setError('Supabase is not configured for this deployment yet.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError(
        /email not confirmed/i.test(signInError.message)
          ? 'Your email is not confirmed yet. Open the verification link we sent you, then try again.'
          : signInError.message,
      );
      setBusy(false);
      return;
    }

    const { data: adminFlag } = await supabase.rpc('is_admin');
    router.replace(adminFlag === true ? '/admin' : '/account');
  }

  return (
    <div>
      <Header />
      <main className="container-page flex min-h-[calc(100vh-72px)] items-start justify-center py-16">
        <div className="w-full max-w-[420px]">
          <p className="eyebrow">Welcome back</p>
          <h1 className="mt-3 font-display text-[42px] leading-none tracking-[-0.01em]">Sign in</h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
            Access the archive, the AI tutor and human tutors, grounded in your course material.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block space-y-1.5 text-[12.5px] text-muted">
              <span>Email</span>
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
            <label className="block space-y-1.5 text-[12.5px] text-muted">
              <span>Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                className="input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
              />
            </label>

            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-[12px] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
              >
                Forgot password?
              </Link>
            </div>

            {error ? (
              <p className="rounded-xl border border-[#e7c9c1] bg-[#fbeeea] px-3 py-2 text-[12.5px] leading-relaxed text-[#8a3b2a]">
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={busy} className="btn-dark w-full py-3">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-[13px] text-muted">
            New here?{' '}
            <Link href="/signup" className="link-underline text-ink">
              Create an account
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
