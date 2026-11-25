'use client';

import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Badge, PageHeader, Panel } from '@/components/admin/ui';
import { ResourceRegistry, type FieldDef } from '@/components/admin/ResourceRegistry';
import type { AdminResource } from '@/lib/admin-api';

const fields: FieldDef[] = [
  { key: 'location', label: 'Where it is stored', placeholder: 'GitHub Actions secret NAME / Password manager / Supabase', column: true },
  { key: 'scope', label: 'Scope / permissions', placeholder: 'Contents write, read-only…', column: true },
  { key: 'last4', label: 'Last 4 characters', placeholder: 'e.g. 4f2S', help: 'Only to tell keys apart. Never paste the full value.', column: true },
  { key: 'rotated_at', label: 'Last rotated (YYYY-MM-DD)', placeholder: '2026-11-25' },
  { key: 'rotate_every_days', label: 'Rotate every (days)', type: 'number', placeholder: '90', help: '0 = no rotation needed (public keys).' },
  { key: 'exposed_in_bundle', label: 'Shipped to the browser?', type: 'bool' },
  { key: 'expires_at', label: 'Expires (YYYY-MM-DD)', placeholder: 'optional' },
];

function RotationCheck({ resource }: { resource: AdminResource }) {
  const every = Number(resource.config.rotate_every_days ?? 0);
  const rotated = typeof resource.config.rotated_at === 'string' ? Date.parse(resource.config.rotated_at) : NaN;
  const expires = typeof resource.config.expires_at === 'string' ? Date.parse(resource.config.expires_at) : NaN;
  const day = 86_400_000;

  if (!Number.isNaN(expires) && expires - Date.now() < 14 * day) {
    return <Badge tone="red">{expires < Date.now() ? 'expired' : 'expires soon'}</Badge>;
  }
  if (!every) return <Badge tone="gray">no rotation</Badge>;
  if (Number.isNaN(rotated)) return <Badge tone="amber">rotation date unknown</Badge>;
  const due = rotated + every * day;
  const left = Math.ceil((due - Date.now()) / day);
  if (left < 0) return <Badge tone="red">overdue {-left}d</Badge>;
  if (left < 14) return <Badge tone="amber">due in {left}d</Badge>;
  return <Badge tone="green">ok · {left}d left</Badge>;
}

export default function AdminSecretsPage() {
  return (
    <div>
      <PageHeader
        title="Secrets"
        description="An inventory of every credential the project uses — where it lives, what it can do and when it must be rotated. Values are never stored here."
      />

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="flex gap-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[12px] leading-relaxed text-[#991b1b]">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This page only stores metadata. The database rejects entries containing <span className="font-mono">value</span>,{' '}
            <span className="font-mono">secret</span> or <span className="font-mono">token</span> fields. Keep real values in GitHub Actions
            secrets, Supabase or a password manager.
          </p>
        </div>
        <div className="flex gap-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[12px] leading-relaxed text-[#92400e]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Anything starting with <span className="font-mono">NEXT_PUBLIC_</span> is bundled into the static site and visible to every visitor.
            Mark those as &ldquo;shipped to the browser&rdquo; and give them the smallest possible permissions.
          </p>
        </div>
      </div>

      <ResourceRegistry
        kind="secret"
        noun="secret"
        fields={fields}
        forbidden={['value', 'secret', 'token']}
        renderExtra={(resource) => <RotationCheck resource={resource} />}
      />

      <Panel className="mt-4" title="Environment variables used by the build">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[12px]">
            <thead className="border-b border-[#e4e4e7] bg-[#fafafa] text-[11px] uppercase tracking-[0.04em] text-[#71717a]">
              <tr>
                <th className="px-5 py-2.5 font-medium">Variable</th>
                <th className="px-5 py-2.5 font-medium">Set in</th>
                <th className="px-5 py-2.5 font-medium">In this build</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f1]">
              {[
                ['NEXT_PUBLIC_SUPABASE_URL', 'Actions variable', process.env.NEXT_PUBLIC_SUPABASE_URL],
                ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Actions variable', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
                ['NEXT_PUBLIC_RAGFLOW_BASE_URL', 'Actions variable', process.env.NEXT_PUBLIC_RAGFLOW_BASE_URL],
                ['NEXT_PUBLIC_RAGFLOW_API_KEY', 'Actions secret', process.env.NEXT_PUBLIC_RAGFLOW_API_KEY],
                ['NEXT_PUBLIC_RAGFLOW_CHAT_ID', 'Actions variable', process.env.NEXT_PUBLIC_RAGFLOW_CHAT_ID],
                ['NEXT_PUBLIC_RAGFLOW_DATASET_ID', 'Actions variable', process.env.NEXT_PUBLIC_RAGFLOW_DATASET_ID],
                ['NEXT_PUBLIC_BASE_PATH', 'Actions variable', process.env.NEXT_PUBLIC_BASE_PATH],
              ].map(([name, where, value]) => (
                <tr key={name}>
                  <td className="px-5 py-2.5 font-mono text-[11.5px]">{name}</td>
                  <td className="px-5 py-2.5 text-[#71717a]">{where}</td>
                  <td className="px-5 py-2.5">
                    {value ? (
                      <Badge tone="green">set · …{String(value).slice(-4)}</Badge>
                    ) : name === 'NEXT_PUBLIC_BASE_PATH' ? (
                      <Badge tone="gray">empty</Badge>
                    ) : (
                      <Badge tone="red">missing</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
