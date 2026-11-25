'use client';

import { useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import {
  getRagflowConfig,
  listRagflowAssistants,
  type RagflowAssistant,
} from '@/lib/ragflow';
import { useT } from '@/lib/i18n';
import { ChatPanel } from './ChatPanel';

const SELECTED_KEY = 'differential-quant.assistant';

export function TutorWorkspace() {
  const [assistants, setAssistants] = useState<RagflowAssistant[] | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const t = useT();

  useEffect(() => {
    let active = true;
    const config = getRagflowConfig();

    listRagflowAssistants(config)
      .then((items) => {
        if (!active) return;
        setAssistants(items);
        if (items.length === 0) return;
        let saved: string | null = null;
        try {
          saved = window.localStorage.getItem(SELECTED_KEY);
        } catch {
          /* ignore */
        }
        const pick =
          items.find((item) => item.id === saved) ||
          items.find((item) => item.label === 'General') ||
          items[0];
        setSelectedId(pick.id);
      })
      .catch(() => {
        if (active) setAssistants([]);
      });

    return () => {
      active = false;
    };
  }, []);

  const selected = assistants?.find((item) => item.id === selectedId) ?? null;

  function choose(id: string) {
    setSelectedId(id);
    try {
      window.localStorage.setItem(SELECTED_KEY, id);
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[12px] text-muted">
          <Database className="h-3.5 w-3.5" aria-hidden />
          <span>{t('workspace.kb')}</span>
          {assistants === null ? (
            <span className="inline-block h-7 w-36 animate-pulse rounded-lg bg-soft/70" />
          ) : assistants.length > 0 ? (
            <select
              value={selectedId}
              onChange={(event) => choose(event.target.value)}
              className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-ink/40"
              aria-label={t('workspace.choose')}
            >
              {assistants.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[12px] text-muted">{t('workspace.default')}</span>
          )}
        </label>
        {selected ? (
          <span className="text-[11px] text-muted">
            {t('workspace.sources', { n: selected.kbNames.length })}
          </span>
        ) : null}
      </div>

      <ChatPanel
        key={selected?.id ?? 'default'}
        chatId={selected?.id}
        datasetIds={selected?.datasetIds}
      />
    </div>
  );
}
