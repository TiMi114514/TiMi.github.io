'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { getRagflowConfig } from '@/lib/ragflow';

type Status = 'idle' | 'running' | 'ok' | 'fail';

type TestState = {
  status: Status;
  message: string;
  ms: number | null;
};

const INITIAL: TestState = { status: 'idle', message: 'Not tested yet', ms: null };

export function ConnectionTests() {
  const [ragflow, setRagflow] = useState<TestState>(INITIAL);
  const [supabaseTest, setSupabaseTest] = useState<TestState>(INITIAL);

  async function testRagflow() {
    setRagflow({ status: 'running', message: 'Contacting RAGFlow…', ms: null });
    const started = performance.now();
    try {
      const cfg = getRagflowConfig();
      const response = await fetch(`${cfg.baseUrl}/api/v1/chats?page=1&page_size=100`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      });
      const ms = Math.round(performance.now() - started);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const count = Array.isArray(json?.data?.chats) ? json.data.chats.length : 0;
      setRagflow({
        status: 'ok',
        message: `${count} assistant${count === 1 ? '' : 's'} visible`,
        ms,
      });
    } catch (error) {
      setRagflow({
        status: 'fail',
        message: error instanceof Error ? error.message : 'Request failed',
        ms: Math.round(performance.now() - started),
      });
    }
  }

  async function testSupabase() {
    setSupabaseTest({ status: 'running', message: 'Contacting Supabase…', ms: null });
    const started = performance.now();
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error('Missing Supabase environment');
      const response = await fetch(`${url}/rest/v1/papers?select=id&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      const ms = Math.round(performance.now() - started);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSupabaseTest({ status: 'ok', message: 'REST API reachable', ms });
    } catch (error) {
      setSupabaseTest({
        status: 'fail',
        message: error instanceof Error ? error.message : 'Request failed',
        ms: Math.round(performance.now() - started),
      });
    }
  }

  useEffect(() => {
    void testRagflow();
    void testSupabase();
  }, []);

  const tests = [
    { label: 'RAGFlow', state: ragflow, run: testRagflow },
    { label: 'Supabase', state: supabaseTest, run: testSupabase },
  ];

  return (
    <section className="rounded-xl border border-[#e4e4e7] bg-white">
      <div className="flex items-center justify-between border-b border-[#e4e4e7] px-5 py-3.5">
        <h2 className="text-[14px] font-semibold">Connection health</h2>
        <span className="text-[11px] text-[#a1a1aa]">Read-only checks</span>
      </div>
      <div className="divide-y divide-[#f0f0f1]">
        {tests.map((test) => (
          <div key={test.label} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {test.state.status === 'running' ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#a1a1aa]" />
              ) : test.state.status === 'ok' ? (
                <CheckCircle2 className="h-4 w-4 text-[#16a34a]" />
              ) : test.state.status === 'fail' ? (
                <XCircle className="h-4 w-4 text-[#dc2626]" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-[#d4d4d8]" />
              )}
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium">{test.label}</p>
                <p className="truncate text-[10.5px] text-[#71717a]">
                  {test.state.message}
                  {test.state.ms !== null ? ` · ${test.state.ms} ms` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void test.run()}
              disabled={test.state.status === 'running'}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#e4e4e7] px-2 py-1 text-[11px] text-[#52525b] hover:bg-[#fafafa] disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" /> Test
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
