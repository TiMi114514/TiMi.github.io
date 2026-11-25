'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/ui';
import { ResourceRegistry, type FieldDef } from '@/components/admin/ResourceRegistry';
import { Badge } from '@/components/admin/ui';
import type { AdminResource } from '@/lib/admin-api';

const fields: FieldDef[] = [
  { key: 'category', label: 'Category', placeholder: 'Email / SMTP, Hosting, AI…', column: true },
  { key: 'url', label: 'Endpoint URL', type: 'url', placeholder: 'https://…', column: true },
  { key: 'docs', label: 'Docs URL', type: 'url', placeholder: 'https://…' },
  { key: 'health_url', label: 'Health check URL', type: 'url', placeholder: 'https://…/health', help: 'Pinged from your browser (needs CORS). Leave empty to skip.' },
  { key: 'owner', label: 'Owner', placeholder: 'Who manages it' },
];

function HealthCheck({ resource }: { resource: AdminResource }) {
  const url = typeof resource.config.health_url === 'string' ? resource.config.health_url : '';
  const [state, setState] = useState<'idle' | 'ok' | 'fail' | 'checking'>('idle');
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    setState('checking');
    const started = performance.now();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    fetch(url, { mode: 'cors', cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!alive) return;
        setMs(Math.round(performance.now() - started));
        setState(response.ok ? 'ok' : 'fail');
      })
      .catch(() => alive && setState('fail'))
      .finally(() => window.clearTimeout(timer));
    return () => {
      alive = false;
      controller.abort();
    };
  }, [url]);

  if (!url) return <span className="text-[11px] text-[#a1a1aa]">—</span>;
  if (state === 'checking') return <Badge tone="gray">checking…</Badge>;
  if (state === 'ok') return <Badge tone="green">up · {ms} ms</Badge>;
  return <Badge tone="red">unreachable</Badge>;
}

export default function AdminIntegrationsPage() {
  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Every external service this site depends on, in one registry. Entries are stored in Supabase (admin_resources, kind = integration) and every change is written to the audit log."
      />
      <ResourceRegistry kind="integration" noun="integration" fields={fields} renderExtra={(r) => <HealthCheck resource={r} />} />
    </div>
  );
}
