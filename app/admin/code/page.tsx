'use client';

import { useEffect, useState } from 'react';
import { Code2, Terminal } from 'lucide-react';
import { CopyButton } from '@/components/admin/CopyButton';
import { getRagflowConfig, type RagflowConfig } from '@/lib/ragflow';

export default function AdminCodePage() {
  const [cfg, setCfg] = useState<RagflowConfig | null>(null);

  useEffect(() => {
    setCfg(getRagflowConfig());
  }, []);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://<project>.supabase.co';
  const base = cfg?.baseUrl || 'https://<ragflow-host>';

  const snippets = [
    {
      title: 'Supabase client',
      language: 'ts',
      code: `import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  '${supabaseUrl}',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);`,
    },
    {
      title: 'Sign up + email verification',
      language: 'ts',
      code: `const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: \`\${window.location.origin}/auth/callback\`,
  },
});`,
    },
    {
      title: 'RAGFlow tutor answer',
      language: 'ts',
      code: `const response = await fetch(
  '${base}/api/v1/chats_openai/{chat_id}/chat/completions',
  {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${RAGFLOW_API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: '<llm_id>',
      messages: [{ role: 'user', content: question }],
      stream: false,
    }),
  },
);
const answer = await response.json();`,
    },
    {
      title: 'Targeted archive search',
      language: 'ts',
      code: `const params = new URLSearchParams({
  page: '1',
  page_size: '100',
  keywords: '9700_w19',
});

const response = await fetch(
  '${base}/api/v1/datasets/<dataset_id>/documents?' + params,
  { headers: { Authorization: \`Bearer \${RAGFLOW_API_KEY}\` } },
);
const { data } = await response.json();`,
    },
    {
      title: 'Download a paper',
      language: 'ts',
      code: `const response = await fetch(
  '${base}/api/v1/datasets/<dataset_id>/documents/<document_id>',
  { headers: { Authorization: \`Bearer \${RAGFLOW_API_KEY}\` } },
);
const blob = await response.blob();
const url = URL.createObjectURL(blob);

const anchor = document.createElement('a');
anchor.href = url;
anchor.download = 'paper.pdf';
anchor.click();
URL.revokeObjectURL(url);`,
    },
  ];

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[32px]">Code</h1>
      <p className="mt-1 text-[13px] text-[#71717a]">
        Copy-ready snippets for the services this deployment actually uses.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Framework', value: 'Next.js 15 · static export' },
          { label: 'Auth / data', value: 'Supabase' },
          { label: 'Retrieval / AI', value: 'RAGFlow' },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-[#e4e4e7] bg-white px-4 py-3">
            <p className="text-[11px] text-[#a1a1aa]">{item.label}</p>
            <p className="mt-1 text-[12.5px] font-medium">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {snippets.map((snippet) => (
          <section key={snippet.title} className="overflow-hidden rounded-xl border border-[#e4e4e7] bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-[#e4e4e7] px-4 py-3">
              <h2 className="flex items-center gap-2 text-[12.5px] font-semibold">
                <Code2 className="h-3.5 w-3.5 text-[#71717a]" /> {snippet.title}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-[#a1a1aa]">
                  {snippet.language}
                </span>
                <CopyButton text={snippet.code} />
              </div>
            </div>
            <pre className="max-h-[300px] overflow-auto bg-[#fafafa] p-4 text-[10.5px] leading-relaxed text-[#3f3f46]">
              {snippet.code}
            </pre>
          </section>
        ))}
      </div>

      <section className="mt-4 rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">
          <Terminal className="h-4 w-4 text-[#71717a]" /> Environment variables
        </h2>
        <div className="mt-3 space-y-1.5 font-mono text-[11px] text-[#52525b]">
          {[
            'NEXT_PUBLIC_SUPABASE_URL',
            'NEXT_PUBLIC_SUPABASE_ANON_KEY',
            'NEXT_PUBLIC_RAGFLOW_BASE_URL',
            'NEXT_PUBLIC_RAGFLOW_API_KEY',
            'NEXT_PUBLIC_RAGFLOW_CHAT_ID',
            'NEXT_PUBLIC_RAGFLOW_DATASET_ID',
          ].map((name) => (
            <div key={name} className="flex items-center justify-between gap-2">
              <span>{name}</span>
              <span className="text-[10px] text-[#16a34a]">configured at build time</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[#a1a1aa]">
          GitHub Pages builds these into the static bundle. Change them in the repository Actions
          variables and redeploy.
        </p>
      </section>
    </div>
  );
}
