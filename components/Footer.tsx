import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line/70 bg-cream">
      <div className="container-page flex flex-col gap-8 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-ink font-display text-[19px] leading-none text-cream">
              P
            </span>
            <span className="font-display text-[20px]">Paperwise</span>
          </Link>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Past papers and an AI tutor that answers from the course&apos;s own material — with the
            sources shown.
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
            <Link href="/#how-it-works" className="block transition-colors hover:text-ink">
              How it works
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
          <p>© {new Date().getFullYear()} Paperwise. Built with Next.js, Supabase and RAGFlow.</p>
          <p>Answers are generated from your knowledge base. Always check the cited source.</p>
        </div>
      </div>
    </footer>
  );
}
