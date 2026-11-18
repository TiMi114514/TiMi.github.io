import Link from 'next/link';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line/70 bg-cream">
      <div className="container-page flex flex-col gap-8 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <Link href="/" prefetch={false} className="group flex items-center gap-2.5">
            <img
              src={`${basePath}/brand-mark.png`}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-lg object-cover transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105"
            />
            <span className="font-display text-[20px]">A-Level Hub</span>
          </Link>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            CIE AS &amp; A Level past papers, an AI tutor grounded in the course material, and human
            tutors when you want a person — the whole syllabus broken into small, solvable pieces.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-12 text-[13px] sm:gap-16">
          <div className="space-y-2.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Study</p>
            <Link href="/papers" className="block transition-colors hover:text-ink">
              Past papers
            </Link>
            <Link href="/tutor" className="block transition-colors hover:text-ink">
              AI tutor
            </Link>
            <Link href="/tutor/human" className="block transition-colors hover:text-ink">
              Human tutor
            </Link>
            <Link href="/pomodoro" className="block transition-colors hover:text-ink">
              Pomodoro
            </Link>
          </div>
          <div className="space-y-2.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Account</p>
            <Link href="/login" className="block transition-colors hover:text-ink">
              Sign in
            </Link>
            <Link href="/signup" className="block transition-colors hover:text-ink">
              Create account
            </Link>
            <Link href="/account" className="block transition-colors hover:text-ink">
              My account
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-line/70">
        <div className="container-page flex flex-col gap-2 py-5 text-[11.5px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} A-Level Hub. Built with Next.js, Supabase and RAGFlow.</p>
          <p>Answers are generated from your knowledge base. Always check the cited source.</p>
        </div>
      </div>
    </footer>
  );
}
