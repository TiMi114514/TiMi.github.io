'use client';

import { ExternalLink, Play } from 'lucide-react';
import { Badge, Empty, ErrorBox, PageHeader, Panel, RefreshButton, StatCard, formatWhen, statusTone, timeAgo, useAdminData } from '@/components/admin/ui';
import { ResourceRegistry, type FieldDef } from '@/components/admin/ResourceRegistry';

const REPO = 'TiMi114514/TiMi.github.io';

type Run = {
  id: number;
  name: string;
  display_title: string;
  status: string;
  conclusion: string | null;
  event: string;
  head_branch: string;
  head_sha: string;
  run_number: number;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at?: string;
  actor?: { login: string };
};

type Workflow = { id: number; name: string; path: string; state: string; html_url: string };

async function gh<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  });
  if (response.status === 403) throw new Error('GitHub API rate limit reached (60 requests / hour per IP). Try again later.');
  if (!response.ok) throw new Error(`GitHub API ${response.status}`);
  return (await response.json()) as T;
}

function duration(run: Run): string {
  const start = Date.parse(run.run_started_at ?? run.created_at);
  const end = Date.parse(run.updated_at);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—';
  const seconds = Math.round((end - start) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const fields: FieldDef[] = [
  { key: 'provider', label: 'Runs on', type: 'select', options: ['github-actions', 'supabase-cron', 'ragflow', 'manual', 'other'], column: true },
  { key: 'trigger', label: 'Trigger', placeholder: 'push to main, cron 0 3 * * *, manual', column: true },
  { key: 'file', label: 'Definition', placeholder: '.github/workflows/deploy.yml', column: true },
  { key: 'owner', label: 'Owner', placeholder: 'Who maintains it' },
];

export default function AdminWorkflowsPage() {
  const { data, error, loading, reload } = useAdminData(
    async () => {
      const [runs, workflows] = await Promise.all([
        gh<{ workflow_runs: Run[] }>('/actions/runs?per_page=20'),
        gh<{ workflows: Workflow[] }>('/actions/workflows'),
      ]);
      return { runs: runs.workflow_runs, workflows: workflows.workflows };
    },
    [],
    60_000,
  );

  const runs = data?.runs ?? [];
  const success = runs.filter((run) => run.conclusion === 'success').length;
  const failed = runs.filter((run) => run.conclusion === 'failure').length;
  const latest = runs[0];

  return (
    <div>
      <PageHeader
        title="Workflows"
        description={
          <>
            Automated jobs for this project. Live run history comes from the public GitHub Actions API for{' '}
            <span className="font-mono">{REPO}</span>; the registry below documents every job, including ones outside GitHub.
          </>
        }
        actions={
          <>
            <a
              href={`https://github.com/${REPO}/actions`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#18181b] bg-[#18181b] px-3 py-2 text-[12px] text-white hover:bg-[#27272a]"
            >
              <Play className="h-3.5 w-3.5" /> Run on GitHub
            </a>
            <RefreshButton onClick={() => void reload()} loading={loading} />
          </>
        }
      />

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Latest run"
          value={latest ? (latest.conclusion ?? latest.status) : '—'}
          tone={latest?.conclusion === 'success' ? 'green' : latest?.conclusion === 'failure' ? 'red' : 'amber'}
          hint={latest ? timeAgo(latest.created_at) : undefined}
        />
        <StatCard label="Successful (last 20)" value={data ? success : '—'} tone="green" />
        <StatCard label="Failed (last 20)" value={data ? failed : '—'} tone={failed ? 'red' : 'default'} />
        <StatCard label="Workflows" value={data ? data.workflows.length : '—'} hint={data?.workflows.map((w) => w.name).join(', ')} />
      </div>

      <ErrorBox message={error} />

      <Panel className="mt-4" title="Recent runs" right={`${runs.length} runs`}>
        {data === null && !error ? (
          <Empty>Loading…</Empty>
        ) : runs.length === 0 ? (
          <Empty>No runs found.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[12px]">
              <thead className="border-b border-[#e4e4e7] bg-[#fafafa] text-[11px] uppercase tracking-[0.04em] text-[#71717a]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Result</th>
                  <th className="px-4 py-2.5 font-medium">Commit</th>
                  <th className="px-4 py-2.5 font-medium">Workflow</th>
                  <th className="px-4 py-2.5 font-medium">Trigger</th>
                  <th className="px-4 py-2.5 font-medium">Duration</th>
                  <th className="px-4 py-2.5 font-medium">Started</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f1]">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-[#fafafa]">
                    <td className="px-4 py-2.5">
                      <Badge tone={statusTone(run.conclusion ?? run.status)}>{run.conclusion ?? run.status}</Badge>
                    </td>
                    <td className="max-w-[340px] px-4 py-2.5">
                      <p className="truncate font-medium" title={run.display_title}>
                        {run.display_title}
                      </p>
                      <p className="font-mono text-[10.5px] text-[#a1a1aa]">
                        #{run.run_number} · {run.head_branch} · {run.head_sha.slice(0, 7)}
                        {run.actor ? ` · ${run.actor.login}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-[#52525b]">{run.name}</td>
                    <td className="px-4 py-2.5 text-[#52525b]">{run.event}</td>
                    <td className="px-4 py-2.5 tabular-nums">{duration(run)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[#71717a]">{formatWhen(run.created_at)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <a href={run.html_url} target="_blank" rel="noreferrer" className="inline-flex rounded-md p-1.5 text-[#71717a] hover:bg-[#f4f4f5] hover:text-[#18181b]" title="Open on GitHub">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <h2 className="mt-8 text-[16px] font-semibold">Workflow registry</h2>
      <ResourceRegistry kind="workflow" noun="workflow" fields={fields} />
    </div>
  );
}
