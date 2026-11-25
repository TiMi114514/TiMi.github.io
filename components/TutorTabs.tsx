'use client';

import Link from 'next/link';
import { Sparkles, UserRound } from 'lucide-react';
import { useT } from '@/lib/i18n';

export function TutorTabs({ active }: { active: 'ai' | 'human' }) {
  const t = useT();
  const base = 'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] transition-colors';
  return (
    <div className="inline-flex rounded-full border border-line bg-paper p-1">
      <Link
        href="/tutor"
        className={`${base} ${active === 'ai' ? 'bg-ink text-cream' : 'text-muted hover:text-ink'}`}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        {t('tabs.ai')}
      </Link>
      <Link
        href="/tutor/human"
        className={`${base} ${
          active === 'human' ? 'bg-ink text-cream' : 'text-muted hover:text-ink'
        }`}
      >
        <UserRound className="h-3.5 w-3.5" aria-hidden />
        {t('tabs.human')}
      </Link>
    </div>
  );
}
