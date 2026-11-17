'use client';

import { useEffect, useState } from 'react';
import { Check, Settings2 } from 'lucide-react';
import {
  getRagflowConfig,
  saveRagflowConfig,
  type RagflowConfig,
} from '@/lib/ragflow';

export function ConnectionSettings({ onSaved }: { onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RagflowConfig>({
    baseUrl: '',
    apiKey: '',
    chatId: '',
    datasetId: '',
    mode: 'native',
    model: '',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(getRagflowConfig());
  }, []);

  function update<K extends keyof RagflowConfig>(key: K, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function save() {
    const next = saveRagflowConfig(draft);
    setDraft(next);
    setSaved(true);
    setOpen(false);
    onSaved?.();
  }

  return (
    <div className="rounded-2xl border border-line bg-paper/70">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[12.5px] text-muted transition-colors hover:text-ink"
      >
        <span className="flex items-center gap-2">
          <Settings2 className="h-4 w-4" aria-hidden />
          Connection settings
          {saved ? (
            <span className="flex items-center gap-1 text-[11.5px] text-[#3f7d5a]">
              <Check className="h-3.5 w-3.5" /> saved
            </span>
          ) : null}
        </span>
        <span className="text-[11px] uppercase tracking-[0.14em]">{open ? 'Close' : 'Edit'}</span>
      </button>

      {open ? (
        <div className="grid gap-3 border-t border-line/70 px-4 py-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-[12px] text-muted">
            <span>API base URL</span>
            <input
              className="input"
              value={draft.baseUrl}
              onChange={(event) => update('baseUrl', event.target.value)}
              placeholder="http://localhost:9380"
              spellCheck={false}
            />
          </label>
          <label className="space-y-1.5 text-[12px] text-muted">
            <span>API key</span>
            <input
              className="input"
              value={draft.apiKey}
              onChange={(event) => update('apiKey', event.target.value)}
              placeholder="ragflow-…"
              type="password"
              spellCheck={false}
            />
          </label>
          <label className="space-y-1.5 text-[12px] text-muted">
            <span>Chat assistant id</span>
            <input
              className="input"
              value={draft.chatId}
              onChange={(event) => update('chatId', event.target.value)}
              placeholder="from RAGFlow → Chat"
              spellCheck={false}
            />
          </label>
          <label className="space-y-1.5 text-[12px] text-muted">
            <span>Dataset ids (archive, comma-separated)</span>
            <input
              className="input"
              value={draft.datasetId}
              onChange={(event) => update('datasetId', event.target.value)}
              placeholder="dataset id, dataset id"
              spellCheck={false}
            />
          </label>
          <label className="space-y-1.5 text-[12px] text-muted">
            <span>API mode</span>
            <select
              className="input"
              value={draft.mode}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  mode: event.target.value === 'openai' ? 'openai' : 'native',
                }))
              }
            >
              <option value="native">RAGFlow native (citations)</option>
              <option value="openai">OpenAI-compatible</option>
            </select>
          </label>
          <label className="space-y-1.5 text-[12px] text-muted">
            <span>Model id (optional, OpenAI mode)</span>
            <input
              className="input"
              value={draft.model}
              onChange={(event) => update('model', event.target.value)}
              placeholder="auto-discovered from the assistant"
              spellCheck={false}
            />
          </label>
          <div className="sm:col-span-2 flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] leading-relaxed text-muted">
              Saved in this browser only. The key is visible to this browser — use a dedicated
              RAGFlow key. Native mode also returns citation chips.
            </p>
            <button type="button" onClick={save} className="btn-dark shrink-0">
              Save connection
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
