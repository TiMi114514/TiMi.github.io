'use client';

import Link from 'next/link';
import { Download, FileText } from 'lucide-react';
import type { Paper } from '@/lib/types';
import { useT } from '@/lib/i18n';
import { DownloadLabel, useDownloads } from './DownloadProvider';

export function PaperCard({
  paper,
  cta = 'view',
  onDownload,
  busy = false,
}: {
  paper: Paper;
  cta?: 'view' | 'download';
  onDownload?: () => void;
  busy?: boolean;
}) {
  const t = useT();
  const downloads = useDownloads();
  const meta =
    [paper.questions ? t('card.questions', { n: paper.questions }) : null, paper.size]
      .filter(Boolean)
      .join(' · ') || t('card.pdf');

  return (
    <article className="flex h-full flex-col rounded-2xl border border-line bg-paper p-6 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-float">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full border border-line bg-soft/70 px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
          {paper.subject}
        </span>
        {paper.year ? <span className="text-[13px] text-muted">{paper.year}</span> : null}
      </div>

      <h3 className="mt-5 font-display text-[25px] leading-[1.1] tracking-[-0.01em]">
        {paper.title}
      </h3>

      {paper.type ? <p className="mt-2 text-[13px] text-muted">{paper.type}</p> : null}

      <div className="mt-6 flex items-center gap-1.5 text-[12px] text-muted">
        <FileText className="h-3.5 w-3.5" aria-hidden />
        <span>{meta}</span>
      </div>

      <div className="mt-auto pt-5">
        {cta === 'download' ? (
          <button
            type="button"
            onClick={onDownload}
            onPointerEnter={() => downloads.prefetch(paper)}
            onTouchStart={() => downloads.prefetch(paper)}
            disabled={busy}
            className="btn w-full border border-line bg-paper py-2.5 text-[13px] text-ink hover:bg-cream"
          >
            <DownloadLabel docId={paper.ragflowDocId} idle={t('card.download')} />
          </button>
        ) : (
          <Link
            href="/papers"
            className="btn w-full border border-line bg-paper py-2.5 text-[13px] text-ink hover:bg-cream"
          >
            <Download className="h-4 w-4" aria-hidden />
            {t('card.view')}
          </Link>
        )}
      </div>
    </article>
  );
}
