'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CalendarClock,
  LockKeyhole,
  Mail,
  Send,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { TutorTabs } from '@/components/TutorTabs';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

type TutorRequest = {
  id: string;
  subject: string;
  question: string;
  status: 'pending' | 'contacted' | 'closed';
  preferred_at: string | null;
  created_at: string;
};

const subjects = [
  'Mathematics',
  'Further Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Economics',
  'Computer Science',
  'Law',
  'Other',
];

const statusStyles: Record<TutorRequest['status'], string> = {
  pending: 'border-[#fde68a] bg-[#fffbeb] text-[#b45309]',
  contacted: 'border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]',
  closed: 'border-line bg-soft/60 text-muted',
};

export default function HumanTutorPage() {
  const { user, loading, verified, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState(subjects[0]);
  const [question, setQuestion] = useState('');
  const [preferredAt, setPreferredAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<TutorRequest[] | null>(null);

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email]);

  useEffect(() => {
    if (!supabase || !user) {
      setRequests(null);
      return;
    }
    let active = true;
    supabase
      .from('human_tutor_requests')
      .select('id, subject, question, status, preferred_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (active) setRequests((data as TutorRequest[] | null) ?? []);
      });
    return () => {
      active = false;
    };
  }, [user]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !user) return;
    if (!question.trim()) {
      setError('Describe the question or topic you want help with.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: insertError } = await supabase.from('human_tutor_requests').insert({
      user_id: user.id,
      email: email.trim() || user.email || '',
      subject,
      question: question.trim(),
      preferred_at: preferredAt ? new Date(preferredAt).toISOString() : null,
      status: 'pending',
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setQuestion('');
    setPreferredAt('');
    setNotice('Request sent. A human tutor will reply by email within one working day.');

    const { data } = await supabase
      .from('human_tutor_requests')
      .select('id, subject, question, status, preferred_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    setRequests((data as TutorRequest[] | null) ?? []);
  }

  return (
    <div>
      <Header />
      <main className="container-page py-12 sm:py-16">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <TutorTabs active="human" />
          <p className="text-[12px] text-muted">One-to-one help from a person</p>
        </div>

        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <aside>
            <p className="eyebrow">Human tutor</p>
            <h1 className="mt-4 max-w-[380px] font-display text-[40px] leading-[0.98] tracking-[-0.01em] sm:text-[46px]">
              Prefer a person? Book a human tutor.
            </h1>
            <p className="mt-5 max-w-[390px] text-[14px] leading-relaxed text-muted">
              Send the question you are working on and a verified tutor will walk you through it
              over a scheduled session or by email.
            </p>

            <ul className="mt-8 space-y-5">
              <li className="flex gap-3.5">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-paper">
                  <CalendarClock className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-[13.5px] font-medium">1:1 walkthrough</p>
                  <p className="mt-0.5 max-w-[320px] text-[12.5px] leading-relaxed text-muted">
                    Pick a time that suits you and work through the question step by step.
                  </p>
                </div>
              </li>
              <li className="flex gap-3.5">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-paper">
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-[13.5px] font-medium">Verified teachers</p>
                  <p className="mt-0.5 max-w-[320px] text-[12.5px] leading-relaxed text-muted">
                    Teachers apply when they sign up and are reviewed by the Differential Quant
                    team before they take students.
                  </p>
                </div>
              </li>
              <li className="flex gap-3.5">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-paper">
                  <Mail className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-[13.5px] font-medium">Reply by email</p>
                  <p className="mt-0.5 max-w-[320px] text-[12.5px] leading-relaxed text-muted">
                    Every request gets a reply within one working day.
                  </p>
                </div>
              </li>
            </ul>
          </aside>

          <section>
            {!configured ? (
              <div className="card p-8">
                <p className="eyebrow">Not configured</p>
                <h2 className="mt-3 font-display text-[28px] leading-tight">
                  Add your Supabase keys to enable requests
                </h2>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">
                  Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy.
                </p>
              </div>
            ) : loading ? (
              <div className="h-[420px] animate-pulse rounded-2xl bg-soft/60" />
            ) : !user ? (
              <div className="card p-8">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-line bg-cream">
                  <LockKeyhole className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <h2 className="mt-4 font-display text-[30px] leading-tight">
                  Sign in to request a human tutor
                </h2>
                <p className="mt-3 max-w-[420px] text-[13.5px] leading-relaxed text-muted">
                  Requests are tied to your verified account so the tutor can reply to the right
                  person.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/login" className="btn-dark px-5 py-2.5">
                    Sign in
                  </Link>
                  <Link href="/signup" className="btn-light px-5 py-2.5">
                    Create account
                  </Link>
                </div>
              </div>
            ) : !verified ? (
              <div className="card p-8">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-[#e7d3b0] bg-[#fbf3e2]">
                  <ShieldCheck className="h-[18px] w-[18px] text-[#8a6420]" aria-hidden />
                </span>
                <h2 className="mt-4 font-display text-[30px] leading-tight">
                  Verify your email first
                </h2>
                <p className="mt-3 max-w-[420px] text-[13.5px] leading-relaxed text-muted">
                  We sent a confirmation link to {user.email}. Open it, then come back to request a
                  human tutor.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/account" className="btn-dark px-5 py-2.5">
                    Resend verification
                  </Link>
                  <Link href="/papers" className="btn-light px-5 py-2.5">
                    Browse papers
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <form onSubmit={submit} className="card p-6 sm:p-7">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-cream">
                      <UserRound className="h-4 w-4" aria-hidden />
                    </span>
                    <div>
                      <h2 className="font-display text-[22px] leading-none">Request a session</h2>
                      <p className="mt-1 text-[11.5px] text-muted">
                        Tell the tutor what you are stuck on.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    <label className="block space-y-1.5 text-[12.5px] text-muted">
                      <span>Subject</span>
                      <select
                        value={subject}
                        onChange={(event) => setSubject(event.target.value)}
                        className="input"
                      >
                        {subjects.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-1.5 text-[12.5px] text-muted">
                      <span>Question or topic</span>
                      <textarea
                        required
                        rows={5}
                        value={question}
                        onChange={(event) => setQuestion(event.target.value)}
                        placeholder="Paste the question, the paper reference, or describe what you want to work through."
                        className="input resize-y"
                      />
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block space-y-1.5 text-[12.5px] text-muted">
                        <span>Preferred time (optional)</span>
                        <input
                          type="datetime-local"
                          value={preferredAt}
                          onChange={(event) => setPreferredAt(event.target.value)}
                          className="input"
                        />
                      </label>
                      <label className="block space-y-1.5 text-[12.5px] text-muted">
                        <span>Contact email</span>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className="input"
                        />
                      </label>
                    </div>
                  </div>

                  {error ? (
                    <p className="mt-4 rounded-xl border border-[#e7c9c1] bg-[#fbeeea] px-3 py-2 text-[12.5px] leading-relaxed text-[#8a3b2a]">
                      {error}
                    </p>
                  ) : null}

                  {notice ? (
                    <p className="mt-4 rounded-xl border border-[#cfe1d4] bg-[#eef5ef] px-3 py-2 text-[12.5px] leading-relaxed text-[#3f7d5a]">
                      {notice}
                    </p>
                  ) : null}

                  <button type="submit" disabled={busy} className="btn-dark mt-5 w-full py-3">
                    <Send className="h-4 w-4" aria-hidden />
                    {busy ? 'Sending…' : 'Send request'}
                  </button>
                </form>

                <div className="mt-6">
                  <h3 className="text-[12px] font-medium uppercase tracking-[0.16em] text-muted">
                    Your requests
                  </h3>
                  <div className="mt-3 divide-y divide-line/70 rounded-2xl border border-line bg-paper">
                    {requests === null ? (
                      <p className="px-5 py-4 text-[12.5px] text-muted">Loading…</p>
                    ) : requests.length === 0 ? (
                      <p className="px-5 py-4 text-[12.5px] text-muted">
                        No requests yet. Your first one will appear here.
                      </p>
                    ) : (
                      requests.map((request) => (
                        <div key={request.id} className="px-5 py-3.5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-[13px] font-medium">{request.subject}</p>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] capitalize ${
                                statusStyles[request.status]
                              }`}
                            >
                              {request.status}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">
                            {request.question}
                          </p>
                          <p className="mt-1.5 text-[10.5px] text-muted/80">
                            {new Date(request.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                            {request.preferred_at
                              ? ` · preferred ${new Date(request.preferred_at).toLocaleString(
                                  undefined,
                                  { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
                                )}`
                              : ''}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
