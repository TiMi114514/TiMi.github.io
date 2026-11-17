'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
};

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase
      .rpc('admin_list_users')
      .then(({ data, error: rpcError }) => {
        if (!active) return;
        if (rpcError) {
          setError(rpcError.message);
          setRows([]);
          return;
        }
        setRows((data as UserRow[] | null) ?? []);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows ?? [];
    return (rows ?? []).filter(
      (row) =>
        row.email.toLowerCase().includes(needle) ||
        row.display_name.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[32px]">App Users</h1>
      <p className="mt-1 text-[13px] text-[#71717a]">
        Every account created through Supabase Auth. Email verification is required before the tutor
        unlocks.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a1a1aa]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by email or name"
            className="w-full rounded-lg border border-[#e4e4e7] bg-white py-2 pl-9 pr-3 text-[13px] outline-none placeholder:text-[#a1a1aa] focus:border-[#a1a1aa]"
          />
        </div>
        <span className="text-[12px] text-[#71717a]">
          {rows === null ? 'Loading…' : `${filtered.length} of ${rows.length}`}
        </span>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[12.5px] text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-[#e4e4e7] bg-white">
        <table className="w-full min-w-[640px] text-left text-[12.5px]">
          <thead className="border-b border-[#e4e4e7] text-[11.5px] uppercase tracking-[0.06em] text-[#a1a1aa]">
            <tr>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Joined</th>
              <th className="px-5 py-3 font-medium">Last sign-in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f1]">
            {rows === null ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[#a1a1aa]">
                  Loading users…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[#a1a1aa]">
                  No users match.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="hover:bg-[#fafafa]">
                  <td className="px-5 py-3 font-medium">{row.email}</td>
                  <td className="px-5 py-3 text-[#52525b]">{row.display_name || '—'}</td>
                  <td className="px-5 py-3">
                    {row.confirmed ? (
                      <span className="rounded-full border border-[#bbf7d0] bg-[#f0fdf4] px-2 py-0.5 text-[11px] text-[#15803d]">
                        Verified
                      </span>
                    ) : (
                      <span className="rounded-full border border-[#fde68a] bg-[#fffbeb] px-2 py-0.5 text-[11px] text-[#b45309]">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[#71717a]">
                    {new Date(row.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-5 py-3 text-[#71717a]">
                    {row.last_sign_in_at
                      ? new Date(row.last_sign_in_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'Never'}
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
