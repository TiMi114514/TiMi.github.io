'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type PaperRow = {
  id: string;
  title: string;
  subject: string;
  year: number | null;
  paper_type: string | null;
  file_url: string | null;
  file_size: string | null;
  questions_count: number | null;
  published: boolean;
  created_at: string;
};

const emptyForm = {
  title: '',
  subject: '',
  year: '',
  paper_type: '',
  file_url: '',
};

export default function AdminDataPage() {
  const [rows, setRows] = useState<PaperRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('papers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setMessage(error.message);
      setRows([]);
      return;
    }
    setRows((data as PaperRow[] | null) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows ?? [];
    if (!needle) return list;
    return list.filter(
      (row) =>
        row.title.toLowerCase().includes(needle) ||
        row.subject.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  async function addPaper(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (!form.title.trim() || !form.subject.trim()) {
      setMessage('Title and subject are required.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.from('papers').insert({
      title: form.title.trim(),
      subject: form.subject.trim(),
      year: form.year ? Number(form.year) : null,
      paper_type: form.paper_type.trim() || null,
      file_url: form.file_url.trim() || null,
      published: true,
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setForm(emptyForm);
    setMessage('Paper added.');
    await load();
  }

  async function togglePublished(row: PaperRow) {
    if (!supabase) return;
    const { error } = await supabase
      .from('papers')
      .update({ published: !row.published })
      .eq('id', row.id);
    if (error) setMessage(error.message);
    else await load();
  }

  async function removePaper(row: PaperRow) {
    if (!supabase) return;
    if (!window.confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('papers').delete().eq('id', row.id);
    if (error) setMessage(error.message);
    else await load();
  }

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[32px]">Data</h1>
      <p className="mt-1 text-[13px] text-[#71717a]">
        Curated papers stored in Supabase. These appear when RAGFlow is unreachable.
      </p>

      <form onSubmit={addPaper} className="mt-5 rounded-xl border border-[#e4e4e7] bg-white p-4">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <Plus className="h-4 w-4 text-[#71717a]" /> Add a paper
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input
            required
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Title"
            className="rounded-lg border border-[#e4e4e7] px-3 py-2 text-[12.5px] outline-none focus:border-[#a1a1aa]"
          />
          <input
            required
            value={form.subject}
            onChange={(event) => setForm({ ...form, subject: event.target.value })}
            placeholder="Subject"
            className="rounded-lg border border-[#e4e4e7] px-3 py-2 text-[12.5px] outline-none focus:border-[#a1a1aa]"
          />
          <input
            value={form.year}
            onChange={(event) => setForm({ ...form, year: event.target.value })}
            placeholder="Year"
            inputMode="numeric"
            className="rounded-lg border border-[#e4e4e7] px-3 py-2 text-[12.5px] outline-none focus:border-[#a1a1aa]"
          />
          <input
            value={form.paper_type}
            onChange={(event) => setForm({ ...form, paper_type: event.target.value })}
            placeholder="Paper type"
            className="rounded-lg border border-[#e4e4e7] px-3 py-2 text-[12.5px] outline-none focus:border-[#a1a1aa]"
          />
          <input
            value={form.file_url}
            onChange={(event) => setForm({ ...form, file_url: event.target.value })}
            placeholder="File URL (optional)"
            className="rounded-lg border border-[#e4e4e7] px-3 py-2 text-[12.5px] outline-none focus:border-[#a1a1aa]"
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-[#a1a1aa]">
            RAGFlow papers are managed in RAGFlow itself; this table is the fallback archive.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-lg bg-[#18181b] px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Adding…' : 'Add paper'}
          </button>
        </div>
      </form>

      {message ? (
        <p className="mt-3 rounded-lg border border-[#e4e4e7] bg-white px-4 py-2 text-[12px] text-[#52525b]">
          {message}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a1a1aa]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search papers"
            className="w-full rounded-lg border border-[#e4e4e7] bg-white py-2 pl-9 pr-3 text-[13px] outline-none placeholder:text-[#a1a1aa] focus:border-[#a1a1aa]"
          />
        </div>
        <span className="text-[12px] text-[#71717a]">
          {rows === null ? 'Loading…' : `${filtered.length} of ${rows.length}`}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[#e4e4e7] bg-white">
        <table className="w-full min-w-[720px] text-left text-[12.5px]">
          <thead className="border-b border-[#e4e4e7] text-[11.5px] uppercase tracking-[0.06em] text-[#a1a1aa]">
            <tr>
              <th className="px-5 py-3 font-medium">Title</th>
              <th className="px-5 py-3 font-medium">Subject</th>
              <th className="px-5 py-3 font-medium">Year</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">File</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f1]">
            {rows === null ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-[#a1a1aa]">
                  Loading papers…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-[#a1a1aa]">
                  No papers match.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="hover:bg-[#fafafa]">
                  <td className="max-w-[260px] truncate px-5 py-3 font-medium">{row.title}</td>
                  <td className="px-5 py-3 text-[#52525b]">{row.subject}</td>
                  <td className="px-5 py-3 text-[#71717a]">{row.year ?? '—'}</td>
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={() => void togglePublished(row)}
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${
                        row.published
                          ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]'
                          : 'border-[#e4e4e7] bg-[#fafafa] text-[#71717a]'
                      }`}
                    >
                      {row.published ? 'Published' : 'Draft'}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-[#71717a]">
                    {row.file_url ? (
                      <a
                        href={row.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-[#d4d4d8] underline-offset-2"
                      >
                        Open
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void removePaper(row)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-[#b91c1c] hover:bg-[#fef2f2]"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
