'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ChatPanel } from '@/components/ChatPanel';
import { ConnectionSettings } from '@/components/ConnectionSettings';
import { useAuth } from '@/components/AuthProvider';
import { getRagflowConfig } from '@/lib/ragflow';

const features = [
  {
    icon: BookOpen,
    title: 'Grounded in your course',
    body: 'Answers are drawn from the indexed study material, with the source shown.',
  },
  {
    icon: MessageSquareText,
    title: 'Ask in plain language',
    body: 'Paste a question, a diagram description, or ask for a worked solution step by step.',
  },
  {
    icon: ShieldCheck,
    title: 'Sources you can check',
    body: 'Every reply lists the chapters and past papers it used, so you can verify it.',
  },
];

export default function TutorPage() {
  const { user, loading, verified, configured } = useAuth();
  const [version, setVersion] = useState(0);
  const [ragReady, setRagReady] = useState(false);

  useEffect(() => {
    const rag = getRagflowConfig();
    setRagReady(Boolean(rag.baseUrl && rag.apiKey && rag.chatId));
  }, [version]);

  return (
    <div>
      <Header />
      <main className="container-page py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <aside>
            <p className="eyebrow">AI tutor</p>
            <h1 className="mt-4 max-w-[360px] font-display text-[44px] leading-[1.0] tracking-[-0.01em] sm:text-[50px]">
              Stuck at 11pm? Ask it like you&apos;d ask a tutor.
            </h1>
            <p className="mt-5 max-w-[380px] text-[14px] leading-relaxed text-muted">
              The tutor runs on your RAGFlow knowledge base, so the explanations match how the
              course actually teaches it.
            </p>

            <ul className="mt-8 space-y-5">
              {features.map((feature) => (
                <li key={feature.title} className="flex gap-3.5">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-paper">
                    <feature.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-medium">{feature.title}</p>
                    <p className="mt-0.5 max-w-[320px] text-[12.5px] leading-relaxed text-muted">
                      {feature.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <ConnectionSettings onSaved={() => setVersion((value) => value + 1)} />
            </div>

            {!ragReady ? (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-[#e7d3b0] bg-[#fbf3e2] px-3.5 py-3 text-[12px] leading-relaxed text-[#6d5320]">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                RAGFlow isn&apos;t fully configured yet. Add the chat assistant id in connection
                settings to start a session.
              </p>
            ) : null}
          </aside>

          <section>
            {!configured ? (
              <div className="card p-8">
                <p className="eyebrow">Not configured</p>
                <h2 className="mt-3 font-display text-[30px] leading-tight">
                  Add your Supabase keys to enable accounts
                </h2>
                <p className="mt-3 max-w-[440px] text-[13px] leading-relaxed text-muted">
                  This deployment is missing NEXT_PUBLIC_SUPABASE_URL and
                  NEXT_PUBLIC_SUPABASE_ANON_KEY. Set them in your environment (or GitHub Actions
                  variables) and redeploy.
                </p>
              </div>
            ) : loading ? (
              <div className="h-[560px] animate-pulse rounded-2xl bg-soft/60" />
            ) : !user ? (
              <div className="card p-8">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-line bg-cream">
                  <LockKeyhole className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <h2 className="mt-4 font-display text-[32px] leading-tight">
                  Sign in to ask the tutor
                </h2>
                <p className="mt-3 max-w-[420px] text-[13.5px] leading-relaxed text-muted">
                  The tutor uses your email-verified account so answers stay tied to your course
                  access. Browsing the archive stays free.
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
                <h2 className="mt-4 font-display text-[32px] leading-tight">
                  Verify your email first
                </h2>
                <p className="mt-3 max-w-[420px] text-[13.5px] leading-relaxed text-muted">
                  We sent a confirmation link to {user.email}. Open it, then come back — verified
                  accounts get the tutor and downloads.
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
              <ChatPanel key={version} />
            )}

            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
              Answers are generated from your knowledge base. Always check the cited source before
              relying on a result.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
