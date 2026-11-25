'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Panel,
  formatWhen,
  inputClass,
  statusTone,
  useAdminData,
} from '@/components/admin/ui';
import {
  deleteResource,
  listResources,
  upsertResource,
  type AdminResource,
  type ResourceKind,
  type ResourceStatus,
} from '@/lib/admin-api';

export type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'number' | 'url' | 'list' | 'bool' | 'select';
  options?: string[];
  help?: string;
  /** Show this field as a column in the table. */
  column?: boolean;
};

const STATUSES: ResourceStatus[] = ['active', 'planned', 'disabled', 'error'];

type Draft = {
  slug: string;
  name: string;
  status: ResourceStatus;
  notes: string;
  config: Record<string, string>;
  extraJson: string;
};

function toDraft(resource: AdminResource | null, fields: FieldDef[]): Draft {
  const config: Record<string, string> = {};
  const rest: Record<string, unknown> = { ...(resource?.config ?? {}) };
  for (const field of fields) {
    const value = rest[field.key];
    delete rest[field.key];
    if (value === undefined || value === null) config[field.key] = '';
    else if (Array.isArray(value)) config[field.key] = value.join(', ');
    else config[field.key] = String(value);
  }
  return {
    slug: resource?.slug ?? '',
    name: resource?.name ?? '',
    status: resource?.status ?? 'active',
    notes: resource?.notes ?? '',
    config,
    extraJson: Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '',
  };
}

function fromDraft(draft: Draft, fields: FieldDef[]): Record<string, unknown> {
  const extra = draft.extraJson.trim() ? (JSON.parse(draft.extraJson) as Record<string, unknown>) : {};
  const config: Record<string, unknown> = { ...extra };
  for (const field of fields) {
    const raw = (draft.config[field.key] ?? '').trim();
    if (!raw) continue;
    if (field.type === 'number') config[field.key] = Number(raw);
    else if (field.type === 'bool') config[field.key] = raw === 'true';
    else if (field.type === 'list') config[field.key] = raw.split(',').map((item) => item.trim()).filter(Boolean);
    else config[field.key] = raw;
  }
  return config;
}

export function displayValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function ResourceRegistry({
  kind,
  noun,
  fields,
  renderExtra,
  forbidden,
}: {
  kind: ResourceKind;
  noun: string;
  fields: FieldDef[];
  /** Extra per-row cell (e.g. health check, rotation warning). */
  renderExtra?: (resource: AdminResource) => ReactNode;
  /** Keys that must never be saved (secrets). */
  forbidden?: string[];
}) {
  const { data, error, loading, reload } = useAdminData(() => listResources(kind), [kind]);
  const [editing, setEditing] = useState<AdminResource | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const columns = useMemo(() => fields.filter((field) => field.column), [fields]);

  function open(resource: AdminResource | 'new') {
    setEditing(resource);
    setDraft(toDraft(resource === 'new' ? null : resource, fields));
    setFormError(null);
  }

  function close() {
    setEditing(null);
    setDraft(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setFormError(null);
    try {
      const config = fromDraft(draft, fields);
      const bad = (forbidden ?? []).filter((key) => key in config);
      if (bad.length) throw new Error(`Do not store ${bad.join(', ')} here — record metadata only.`);
      await upsertResource({
        kind,
        slug: draft.slug.trim().toLowerCase(),
        name: draft.name.trim(),
        status: draft.status,
        config,
        notes: draft.notes.trim() || null,
      });
      close();
      await reload();
    } catch (caught) {
      setFormError(caught instanceof SyntaxError ? 'Extra config must be valid JSON.' : caught instanceof Error ? caught.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(resource: AdminResource) {
    if (!window.confirm(`Delete ${noun} "${resource.name}"?`)) return;
    try {
      await deleteResource(kind, resource.slug);
      await reload();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'Delete failed.');
    }
  }

  const items = data?.items ?? [];

  return (
    <>
      <ErrorBox message={error} />

      <Panel
        className="mt-4"
        title={`${items.length} ${noun}${items.length === 1 ? '' : 's'}`}
        right={
          <div className="flex items-center gap-2">
            <Button onClick={() => void reload()} disabled={loading}>
              Refresh
            </Button>
            <Button variant="dark" onClick={() => open('new')}>
              <Plus className="h-3.5 w-3.5" /> Add {noun}
            </Button>
          </div>
        }
      >
        {data === null ? (
          <Empty>Loading…</Empty>
        ) : items.length === 0 ? (
          <Empty>No {noun}s yet. Add one to start the registry.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[12px]">
              <thead className="border-b border-[#e4e4e7] bg-[#fafafa] text-[11px] uppercase tracking-[0.04em] text-[#71717a]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  {columns.map((field) => (
                    <th key={field.key} className="px-4 py-2.5 font-medium">
                      {field.label}
                    </th>
                  ))}
                  {renderExtra ? <th className="px-4 py-2.5 font-medium">Check</th> : null}
                  <th className="px-4 py-2.5 font-medium">Updated</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f1]">
                {items.map((resource) => (
                  <tr key={resource.id} className="align-top hover:bg-[#fafafa]">
                    <td className="max-w-[260px] px-4 py-2.5">
                      <p className="font-medium">{resource.name}</p>
                      <p className="font-mono text-[10.5px] text-[#a1a1aa]">{resource.slug}</p>
                      {resource.notes ? <p className="mt-1 text-[11px] leading-relaxed text-[#71717a]">{resource.notes}</p> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={statusTone(resource.status)}>{resource.status}</Badge>
                    </td>
                    {columns.map((field) => {
                      const value = displayValue(resource.config[field.key]);
                      return (
                        <td key={field.key} className="max-w-[240px] break-words px-4 py-2.5 text-[11.5px] text-[#3f3f46]">
                          {field.type === 'url' && value !== '—' ? (
                            <a href={value} target="_blank" rel="noreferrer" className="underline decoration-[#d4d4d8] underline-offset-2 hover:text-[#18181b]">
                              {value}
                            </a>
                          ) : (
                            value
                          )}
                        </td>
                      );
                    })}
                    {renderExtra ? <td className="px-4 py-2.5">{renderExtra(resource)}</td> : null}
                    <td className="whitespace-nowrap px-4 py-2.5 text-[11px] text-[#71717a]">
                      {formatWhen(resource.updated_at)}
                      <p className="text-[10.5px] text-[#a1a1aa]">{resource.updated_by ?? resource.created_by ?? ''}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <button type="button" onClick={() => open(resource)} className="rounded-md p-1.5 text-[#71717a] hover:bg-[#f4f4f5] hover:text-[#18181b]" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => void remove(resource)} className="rounded-md p-1.5 text-[#71717a] hover:bg-[#fef2f2] hover:text-[#b91c1c]" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editing && draft ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={close}>
          <form
            onSubmit={save}
            onClick={(event) => event.stopPropagation()}
            className="flex h-full w-full max-w-[460px] flex-col overflow-y-auto border-l border-[#e4e4e7] bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#e4e4e7] px-5 py-4">
              <h2 className="text-[15px] font-semibold">
                {editing === 'new' ? `Add ${noun}` : `Edit ${noun}`}
              </h2>
              <button type="button" onClick={close} className="rounded-md p-1 text-[#71717a] hover:bg-[#f4f4f5]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3.5 px-5 py-4 text-[12px]">
              <label className="block space-y-1">
                <span className="text-[#71717a]">Name</span>
                <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} />
              </label>
              <label className="block space-y-1">
                <span className="text-[#71717a]">Slug (lowercase id)</span>
                <input
                  required
                  pattern="[a-z0-9][a-z0-9._\-]{0,63}"
                  disabled={editing !== 'new'}
                  value={draft.slug}
                  onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                  className={`${inputClass} font-mono disabled:bg-[#fafafa]`}
                  placeholder="e.g. resend-smtp"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[#71717a]">Status</span>
                <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ResourceStatus })} className={inputClass}>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              {fields.map((field) => (
                <label key={field.key} className="block space-y-1">
                  <span className="text-[#71717a]">{field.label}</span>
                  {field.type === 'bool' || field.type === 'select' ? (
                    <select
                      value={draft.config[field.key] ?? ''}
                      onChange={(e) => setDraft({ ...draft, config: { ...draft.config, [field.key]: e.target.value } })}
                      className={inputClass}
                    >
                      <option value="">—</option>
                      {(field.type === 'bool' ? ['true', 'false'] : field.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={draft.config[field.key] ?? ''}
                      onChange={(e) => setDraft({ ...draft, config: { ...draft.config, [field.key]: e.target.value } })}
                      placeholder={field.placeholder}
                      className={inputClass}
                    />
                  )}
                  {field.help ? <span className="block text-[10.5px] text-[#a1a1aa]">{field.help}</span> : null}
                </label>
              ))}
              <label className="block space-y-1">
                <span className="text-[#71717a]">Notes</span>
                <textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={`${inputClass} resize-y`} />
              </label>
              <label className="block space-y-1">
                <span className="text-[#71717a]">Extra config (JSON, optional)</span>
                <textarea
                  rows={4}
                  value={draft.extraJson}
                  onChange={(e) => setDraft({ ...draft, extraJson: e.target.value })}
                  className={`${inputClass} resize-y font-mono text-[11px]`}
                  placeholder='{"key": "value"}'
                />
              </label>
              {formError ? <p className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[11.5px] text-[#b91c1c]">{formError}</p> : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#e4e4e7] px-5 py-3">
              <Button onClick={close}>Cancel</Button>
              <Button type="submit" variant="dark" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
