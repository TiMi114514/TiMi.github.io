import type { CSSProperties } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Download,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { PaperCard } from '@/components/PaperCard';
import { samplePapers } from '@/lib/papers';

function HeroPapers() {
  return (
    <div className="relative hidden h-[420px] lg:block" aria-hidden>
      <div
        className="float-card float-card-delay-1 absolute left-0 top-28 w-[238px] rounded-xl border border-line bg-white/70 p-5 shadow-card"
        style={{ '--rot': '-9deg' } as CSSProperties}
      >
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Mathematics</p>
        <div className="mt-6 space-y-2">
          <div className="h-1.5 w-4/5 rounded-full bg-line/80" />
          <div className="h-1.5 w-3/5 rounded-full bg-line/80" />
          <div className="h-1.5 w-2/3 rounded-full bg-line/80" />
        </div>
        <p className="mt-10 text-[11px] text-muted">Paper 1 · 2024</p>
      </div>

      <div
        className="float-card float-card-delay-2 absolute left-[112px] top-4 w-[248px] rounded-xl border border-line bg-white/85 p-5 shadow-card"
        style={{ '--rot': '-3deg' } as CSSProperties}
      >
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Chemistry</p>
        <div className="mt-6 space-y-2">
          <div className="h-1.5 w-3/4 rounded-full bg-line/80" />
          <div className="h-1.5 w-1/2 rounded-full bg-line/80" />
          <div className="h-1.5 w-2/3 rounded-full bg-line/80" />
          <div className="h-1.5 w-2/5 rounded-full bg-line/80" />
        </div>
        <p className="mt-10 text-[11px] text-muted">Paper 3 · 2025</p>
      </div>

      <div
        className="float-card absolute right-0 top-20 w-[272px] rounded-xl border border-line bg-white p-5 shadow-float"
        style={{ '--rot': '7deg' } as CSSProperties}
      >
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Physics</p>
        <div className="mt-6 space-y-2">
          <div className="h-1.5 w-5/6 rounded-full bg-line/90" />
          <div className="h-1.5 w-3/5 rounded-full bg-line/90" />
          <div className="h-1.5 w-4/5 rounded-full bg-line/90" />
          <div className="h-1.5 w-1/2 rounded-full bg-line/90" />
        </div>
        <p className="mt-10 text-[11px] text-muted">Paper 2 · 2024</p>
      </div>

      <div className="float-soft absolute bottom-6 right-2 flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 shadow-card">
        <CheckCircle2 className="h-4 w-4 text-[#3f7d5a]" />
        <span className="text-[12px] text-muted">Answered from your notes</span>
      </div>
    </div>
  );
}

function TutorMock() {
  return (
    <div className="card overflow-hidden" aria-hidden>
      <div className="flex items-center justify-between border-b border-line/80 px-5 py-3.5">
        <span className="font-display text-[17px]">Tutor session</span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3f7d5a]" />
          knowledge base connected
        </span>
      </div>
      <div className="space-y-4 bg-paper px-5 py-5">
        <div className="flex justify-end">
          <p className="max-w-[80%] rounded-2xl rounded-br-md bg-ink px-4 py-3 text-[13px] leading-relaxed text-cream">
            In the 2023 paper, Q4 asks why the magnetic flux stays constant. I don&apos;t get it.
          </p>
        </div>
        <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-cream/50 px-4 py-3 text-[13px] leading-relaxed">
          <p>
            Think of the loop entering the field region. The flux only changes while the loop is{' '}
            <em>partially</em> inside — once it&apos;s fully within a uniform field, the area exposed
            to the field stops changing, so flux is constant and the induced EMF is zero.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line/70 pt-3">
            <span className="rounded-md border border-line bg-paper px-2 py-1 text-[11px] text-muted">
              Ch. 7 — Electromagnetic induction
            </span>
            <span className="rounded-md border border-line bg-paper px-2 py-1 text-[11px] text-muted">
              2023 · Paper 2 · Q4
            </span>
          </div>
        </div>
      </div>
      <div className="border-t border-line/80 px-4 py-3 text-[12.5px] text-muted">
        Ask a follow-up…
      </div>
    </div>
  );
}

const tutorFeatures = [
  {
    icon: BookOpen,
    title: 'Grounded in your course',
    body: "Every answer is drawn from the indexed study material, not the open web.",
  },
  {
    icon: MessageSquareText,
    title: 'Ask in plain language',
    body: 'Paste a question, a diagram description, or ask for a worked solution step by step.',
  },
  {
    icon: ShieldCheck,
    title: 'Sources you can check',
    body: 'Each reply lists the chapters and past papers it used, so you can verify it.',
  },
];

const steps = [
  {
    number: '01',
    title: 'Browse the archive',
    body: 'Past papers, mark schemes and question packs — organised by subject and year.',
  },
  {
    number: '02',
    title: 'Verify your email',
    body: 'A one-time check keeps the archive and the tutor available to real students.',
  },
  {
    number: '03',
    title: 'Ask the tutor',
    body: 'Ask the AI tutor any question, or book a human tutor when you want a person — answers come with sources.',
  },
];

export default function HomePage() {
  const featured = samplePapers.slice(0, 3);

  return (
    <div>
      <Header />

      <main>
        {/* Hero */}
        <section className="container-page pb-16 pt-14 sm:pt-20 lg:pb-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.12fr_0.88fr]">
            <div className="animate-fade-up">
              <p className="eyebrow">Past papers · AI + human tutors</p>
              <h1 className="mt-5 font-display text-[clamp(38px,8.2vw,64px)] leading-[0.98] tracking-[-0.02em]">
                Every past paper.
                <br />
                Every question
                <br />
                <em className="italic">answered.</em>
              </h1>
              <p className="mt-7 max-w-[480px] text-[14.5px] leading-relaxed text-muted">
                Maths, sciences, economics, law and professional subjects — one archive. Download
                the papers, ask the AI tutor about anything you get stuck on, or book a human tutor
                when you want a person. Answers come with the source shown.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/papers" className="btn-dark px-5 py-3">
                  Browse past papers
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link href="/tutor" className="btn-light px-5 py-3">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Ask the tutor
                </Link>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-2 text-[12px] text-muted">
                <span>Free to browse</span>
                <span className="hidden text-line sm:inline">·</span>
                <span>Email-verified accounts</span>
                <span className="hidden text-line sm:inline">·</span>
                <span>Answers with citations</span>
              </div>
            </div>

            <div className="animate-fade-up">
              <HeroPapers />
            </div>
          </div>
        </section>

        {/* Archive preview */}
        <section className="border-t border-line/60">
          <div className="container-page py-16 sm:py-20">
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="eyebrow">The archive</p>
                <h2 className="mt-3 font-display text-[38px] leading-none tracking-[-0.01em] sm:text-[44px]">
                  Recently added papers
                </h2>
              </div>
              <Link
                href="/papers"
                className="hidden items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink sm:flex"
              >
                All papers <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {featured.map((paper) => (
                <PaperCard key={paper.id} paper={paper} />
              ))}
            </div>

            <div className="mt-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <p className="text-[12px] text-muted">
                Sample layout — the papers you upload will appear here.
              </p>
              <Link
                href="/papers"
                className="flex items-center gap-1.5 text-[12.5px] text-muted transition-colors hover:text-ink sm:hidden"
              >
                All papers <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        {/* AI tutor */}
        <section className="border-t border-line/60">
          <div className="container-page grid gap-12 py-16 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
            <div>
              <p className="eyebrow">Tutors</p>
              <h2 className="mt-4 max-w-[430px] font-display text-[38px] leading-[1.0] tracking-[-0.01em] sm:text-[44px]">
                Stuck at 11pm? Ask it like you&apos;d ask a tutor.
              </h2>
              <p className="mt-5 max-w-[420px] text-[14px] leading-relaxed text-muted">
                The AI tutor runs on your knowledge base, so the explanations match how the course
                actually teaches it. Prefer a person? Book a human tutor for a live walkthrough.
              </p>

              <ul className="mt-8 space-y-5">
                {tutorFeatures.map((feature) => (
                  <li key={feature.title} className="flex gap-3.5">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-paper">
                      <feature.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[13.5px] font-medium">{feature.title}</p>
                      <p className="mt-0.5 max-w-[340px] text-[12.5px] leading-relaxed text-muted">
                        {feature.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/tutor" className="btn-dark px-5 py-3">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Open the AI tutor
                </Link>
                <Link href="/tutor/human" className="btn-light px-5 py-3">
                  <UserRound className="h-4 w-4" aria-hidden />
                  Book a human tutor
                </Link>
              </div>
            </div>

            <TutorMock />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-line/60">
          <div className="container-page py-16 sm:py-20">
            <p className="eyebrow">How it works</p>
            <h2 className="mt-3 font-display text-[34px] leading-none tracking-[-0.01em] sm:text-[40px]">
              Three steps, no clutter.
            </h2>

            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              {steps.map((step) => (
                <div key={step.number} className="border-t border-ink/80 pt-4">
                  <p className="font-display text-[13px] text-muted">{step.number}</p>
                  <h3 className="mt-2 font-display text-[24px] leading-tight">{step.title}</h3>
                  <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-muted">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-14 flex flex-col items-start justify-between gap-5 rounded-2xl border border-line bg-paper px-6 py-7 sm:flex-row sm:items-center">
              <div>
                <h3 className="font-display text-[26px] leading-tight">Ready when you are.</h3>
                <p className="mt-1 text-[13px] text-muted">
                  Create an account, verify your email, and start with the archive.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/signup" className="btn-dark px-5 py-2.5">
                  Create account
                </Link>
                <Link href="/papers" className="btn-light px-5 py-2.5">
                  <Download className="h-4 w-4" aria-hidden /> Browse papers
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
