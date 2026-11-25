'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bot, ExternalLink, RefreshCw } from 'lucide-react';
import { CopyButton } from '@/components/admin/CopyButton';
import { ResourceRegistry, type FieldDef } from '@/components/admin/ResourceRegistry';

const agentFields: FieldDef[] = [
  { key: 'provider', label: 'Provider', type: 'select', options: ['ragflow', 'openai', 'deepseek', 'anthropic', 'qwen', 'other'], column: true },
  { key: 'model', label: 'Model', placeholder: 'deepseek-chat, qwen-max…', column: true },
  { key: 'endpoint', label: 'Endpoint', type: 'url', placeholder: 'https://…', column: true },
  { key: 'datasets', label: 'Knowledge bases', type: 'list', placeholder: 'Biology 9700, Chemistry 9701' },
  { key: 'purpose', label: 'Purpose', placeholder: 'What this agent is for' },
];
import { fetchArchivePreview, getRagflowConfig, listRagflowAssistants, type RagflowAssistant } from '@/lib/ragflow';

export default function AdminAgentsPage() {
  const [assistants, setAssistants] = useState<RagflowAssistant[] | null>(null);
  const [datasetCounts, setDatasetCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const cfg = getRagflowConfig();
      const [items, preview] = await Promise.all([
        listRagflowAssistants(cfg),
        fetchArchivePreview().catch(() => null),
      ]);
      setAssistants(items);
      setDatasetCounts(
        Object.fromEntries((preview?.datasets ?? []).map((item) => [item.id, item.count])),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load assistants.');
      setAssistants([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const totalDocs = useMemo(() => {
    const ids = new Set<string>();
    for (const assistant of assistants ?? []) {
      for (const id of assistant.datasetIds) ids.add(id);
    }
    return Array.from(ids).reduce((sum, id) => sum + (datasetCounts[id] ?? 0), 0);
  }, [assistants, datasetCounts]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[32px]">Agents</h1>
          <p className="mt-1 text-[13px] text-[#71717a]">
            The RAGFlow assistants behind the AI tutor. Each one is named <code>DQ · Subject</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e4e7] bg-white px-3 py-2 text-[12px] text-[#52525b] hover:bg-[#fafafa] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[12.5px] text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#e4e4e7] bg-white px-4 py-3">
          <p className="text-[11px] text-[#a1a1aa]">Assistants</p>
          <p className="mt-1 text-[22px] font-semibold leading-none">
            {assistants === null ? '—' : assistants.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#e4e4e7] bg-white px-4 py-3">
          <p className="text-[11px] text-[#a1a1aa]">Unique linked documents</p>
          <p className="mt-1 text-[22px] font-semibold leading-none">
            {assistants === null ? '—' : totalDocs.toLocaleString('en-US')}
          </p>
        </div>
        <div className="rounded-xl border border-[#e4e4e7] bg-white px-4 py-3">
          <p className="text-[11px] text-[#a1a1aa]">Catalog pattern</p>
          <p className="mt-1 text-[12.5px] font-medium">DQ · Subject</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {assistants === null ? (
          <div className="h-40 animate-pulse rounded-xl bg-[#e4e4e7]/60" />
        ) : assistants.length === 0 ? (
          <div className="rounded-xl border border-[#e4e4e7] bg-white px-5 py-10 text-center text-[12.5px] text-[#a1a1aa]">
            No assistants returned. Create a chat assistant in RAGFlow named{' '}
            <code>DQ · Chemistry</code> and refresh.
          </div>
        ) : (
          assistants.map((assistant) => (
            <section key={assistant.id} className="rounded-xl border border-[#e4e4e7] bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg border border-[#e4e4e7] bg-[#fafafa]">
                    <Bot className="h-4 w-4 text-[#52525b]" />
                  </span>
                  <div>
                    <h2 className="text-[14px] font-semibold">{assistant.name}</h2>
                    <p className="mt-0.5 text-[11px] text-[#71717a]">
                      {assistant.kbNames.length > 0
                        ? assistant.kbNames.join(', ')
                        : `${assistant.datasetIds.length} dataset link${
                            assistant.datasetIds.length === 1 ? '' : 's'
                          }`}
                    </p>
                  </div>
                </div>
                <span className="rounded-full border border-[#bbf7d0] bg-[#f0fdf4] px-2 py-0.5 text-[10.5px] text-[#15803d]">
                  ready
                </span>
              </div>

              <div className="mt-3 space-y-1.5 text-[11.5px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#71717a]">Assistant id</span>
                  <span className="truncate font-mono text-[10.5px]">{assistant.id}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#71717a]">Documents</span>
                  <span>
                    {assistant.datasetIds.reduce(
                      (sum, id) => sum + (datasetCounts[id] ?? 0),
                      0,
                    ).toLocaleString('en-US')}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <CopyButton text={assistant.id} label="Copy id" />
                <Link
                  href="/tutor"
                  className="inline-flex items-center gap-1 rounded-md border border-[#e4e4e7] px-2 py-1 text-[11px] text-[#52525b] hover:bg-[#fafafa]"
                >
                  <ExternalLink className="h-3 w-3" /> Open tutor
                </Link>
              </div>
            </section>
          ))
        )}
      </div>

      <h2 className="mt-8 text-[16px] font-semibold">Agent registry</h2>
      <p className="mt-1 text-[12px] text-[#71717a]">
        Document every AI agent the project uses — RAGFlow assistants above are discovered automatically; add other
        models, prompts or bots here so the team has one list.
      </p>
      <ResourceRegistry kind="agent" noun="agent" fields={agentFields} forbidden={['api_key', 'token', 'secret']} />

      <section className="mt-4 rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h2 className="text-[13px] font-semibold">Adding an assistant</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[11.5px] leading-relaxed text-[#52525b]">
          <li>Create or parse a dataset in RAGFlow and wait until it has parsed chunks.</li>
          <li>Create a chat assistant named <code>DQ · Subject</code> and bind the dataset.</li>
          <li>Return here and refresh; the assistant appears in the tutor selector automatically.</li>
        </ol>
      </section>
    </div>
  );
}
