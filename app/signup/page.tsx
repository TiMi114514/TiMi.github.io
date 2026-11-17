'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/components/AuthProvider';
import { appUrl, supabase } from '@/lib/supabase';

export default function SignupPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace('/account');
  }, [loading, user, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setError('Supabase is not configured for this deployment yet.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setBusy(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: name.trim() },
        emailRedirectTo: appUrl('/auth/callback'),
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }

    window.sessionStorage.setItem('paperwise.pendingEmail', email.trim());

    if (data.session) {
      router.replace('/account');
    } else {
      router.replace('/verify');
    }
  }

  return (
    <div>
      <Header />
      <main className="container-page flex min-h-[calc(100vh-72px)] items-start justify-center py-16">
        <div className="w-full max-w-[440px]">
          <p className="eyebrow">Create account</p>
          <h1 className="mt-3 font-display text-[42px] leading-none tracking-[-0.01em]">
            Start with the archive
          </h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
            Free to browse. One email check unlocks downloads and the tutor.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block space-y-1.5 text-[12.5px] text-muted">
              <span>Name</span>
              <input
                required
                autoComplete="name"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
              />
            </label>
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
                minLength={8}
                autoComplete="new-password"
                className="input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </label>

            {error ? (
              <p className="rounded-xl border border-[#e7c9c1] bg-[#fbeeea] px-3 py-2 text-[12.5px] leading-relaxed text-[#8a3b2a]">
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={busy} className="btn-dark w-full py-3">
              {busy ? 'Creating account…' : 'Create account'}
            </button>

            <p className="text-center text-[11.5px] leading-relaxed text-muted">
              We&apos;ll email you a link to verify your address before the archive is unlocked.
            </p>
          </form>

          <p className="mt-6 text-[13px] text-muted">
            Already have an account?{' '}
            <Link href="/login" className="link-underline text-ink">
              Sign in
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
