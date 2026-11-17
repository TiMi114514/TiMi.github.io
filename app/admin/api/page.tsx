'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Server } from 'lucide-react';
import { ConnectionTests } from '@/components/admin/ConnectionTests';
import { CopyButton } from '@/components/admin/CopyButton';
import { getRagflowConfig, type RagflowConfig } from '@/lib/ragflow';

export default function AdminApiPage() {
  const [cfg, setCfg] = useState<RagflowConfig | null>(null);

  useEffect(() => {
    setCfg(getRagflowConfig());
  }, []);

  const base = cfg?.baseUrl ?? '';
  const keyMasked = cfg?.apiKey
    ? `${cfg.apiKey.slice(0, 8)}…${cfg.apiKey.slice(-4)}`
    : 'not set';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'not set';
  const datasetIds = (cfg?.datasetId ?? process.env.NEXT_PUBLIC_RAGFLOW_DATASET_ID ?? '')
    .split(',')
    .filter(Boolean);

  const endpoints = [
    {
      method: 'GET',
      path: '/api/v1/datasets?page=1&page_size=100',
      description: 'List knowledge bases and document counts',
    },
    {
      method: 'GET',
      path: '/api/v1/datasets/{dataset_id}/documents?page=1&page_size=100&keywords=9990',
      description: 'Targeted filename search inside a dataset',
    },
    {
      method: 'GET',
      path: '/api/v1/chats?page=1&page_size=100',
      description: 'List DQ assistants',
    },
    {
      method: 'POST',
      path: '/api/v1/chats_openai/{chat_id}/chat/completions',
      description: 'OpenAI-compatible tutor answer (no chain of thought)',
    },
    {
      method: 'POST',
      path: '/api/v1/retrieval',
      description: 'Retrieve cited chunks for an answer',
    },
  ];

  const chatSample = `curl -X POST "${base}/api/v1/chats_openai/<chat_id>/chat/completions" \\
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "<llm_id>",
    "messages": [{"role": "user", "content": "Explain Faraday's law"}],
    "stream": false
  }'`;

  const searchSample = `curl "${base}/api/v1/datasets/<dataset_id>/documents?page=1&page_size=100&keywords=9700_w19" \\
  -H "Authorization: Bearer $RAGFLOW_API_KEY"`;

  const supabaseSample = `curl "${supabaseUrl}/rest/v1/papers?select=*&published=eq.true" \\
  -H "apikey: $SUPABASE_ANON_KEY" \\
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"`;

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[32px]">API</h1>
      <p className="mt-1 text-[13px] text-[#71717a]">
        The connection this dashboard uses and read-only requests you can test.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-[#e4e4e7] bg-white">
          <div className="flex items-center gap-2 border-b border-[#e4e4e7] px-5 py-3.5">
            <Server className="h-4 w-4 text-[#71717a]" />
            <h2 className="text-[14px] font-semibold">RAGFlow</h2>
          </div>
          <div className="space-y-2.5 p-5 text-[12px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#71717a]">Base URL</span>
              <span className="truncate font-mono text-[11px]">{base || 'not set'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#71717a]">API key</span>
              <span className="font-mono text-[11px]">{keyMasked}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#71717a]">Chat id</span>
              <span className="truncate font-mono text-[11px]">{cfg?.chatId || 'not set'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#71717a]">Fallback datasets</span>
              <span>{datasetIds.length}</span>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-[#e4e4e7] bg-white">
          <div className="flex items-center gap-2 border-b border-[#e4e4e7] px-5 py-3.5">
            <KeyRound className="h-4 w-4 text-[#71717a]" />
            <h2 className="text-[14px] font-semibold">Supabase</h2>
          </div>
          <div className="space-y-2.5 p-5 text-[12px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#71717a]">Project URL</span>
              <span className="truncate font-mono text-[11px]">{supabaseUrl}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#71717a]">Auth</span>
              <span>email + password</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#71717a]">Archive tables</span>
              <span>papers, downloads, page_views</span>
            </div>
            <p className="pt-1 text-[11px] leading-relaxed text-[#a1a1aa]">
              The anon key is public by design; row-level security decides what it can read.
            </p>
          </div>
        </section>
      </div>

      <div className="mt-4">
        <ConnectionTests />
      </div>

      <section className="mt-4 overflow-hidden rounded-xl border border-[#e4e4e7] bg-white">
        <div className="border-b border-[#e4e4e7] px-5 py-3.5">
          <h2 className="text-[14px] font-semibold">RAGFlow endpoints</h2>
        </div>
        <div className="divide-y divide-[#f0f0f1]">
          {endpoints.map((endpoint) => (
            <div key={endpoint.path} className="flex flex-wrap items-center gap-2 px-5 py-3">
              <span className="rounded bg-[#f4f4f5] px-1.5 py-0.5 font-mono text-[10px] text-[#52525b]">
                {endpoint.method}
              </span>
              <code className="min-w-0 flex-1 truncate text-[11.5px]">{endpoint.path}</code>
              <span className="w-full text-[11px] text-[#a1a1aa] sm:w-auto">
                {endpoint.description}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {[
          { title: 'Chat completion', code: chatSample },
          { title: 'Filename search', code: searchSample },
          { title: 'Supabase papers', code: supabaseSample },
        ].map((sample) => (
          <section key={sample.title} className="rounded-xl border border-[#e4e4e7] bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-[#e4e4e7] px-4 py-3">
              <h2 className="text-[12.5px] font-semibold">{sample.title}</h2>
              <CopyButton text={sample.code} />
            </div>
            <pre className="max-h-[220px] overflow-auto bg-[#fafafa] p-4 text-[10.5px] leading-relaxed text-[#3f3f46]">
              {sample.code}
            </pre>
          </section>
        ))}
      </div>
    </div>
  );
}
