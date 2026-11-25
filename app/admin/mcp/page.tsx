'use client';

import { PageHeader, Panel } from '@/components/admin/ui';
import { ResourceRegistry, type FieldDef } from '@/components/admin/ResourceRegistry';
import { CopyButton } from '@/components/admin/CopyButton';
import { ADMIN_ENDPOINTS } from '@/lib/admin-api';

const fields: FieldDef[] = [
  { key: 'transport', label: 'Transport', type: 'select', options: ['stdio', 'streamable-http', 'sse'], column: true },
  { key: 'url', label: 'URL (http / sse)', type: 'url', placeholder: 'https://mcp.example.com/mcp', column: true },
  { key: 'command', label: 'Command (stdio)', placeholder: 'npx -y @modelcontextprotocol/server-postgres', column: true },
  { key: 'tools', label: 'Tools exposed', type: 'list', placeholder: 'query, list_tables', help: 'Comma separated.', column: true },
  { key: 'auth', label: 'Auth', placeholder: 'Bearer token in env MCP_TOKEN (never paste the value)' },
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://<project>.supabase.co';

const exampleConfig = JSON.stringify(
  {
    mcpServers: {
      'alevel-hub-admin': {
        command: 'npx',
        args: ['-y', '@supabase/mcp-server-supabase@latest', '--read-only', '--project-ref=wksdpsmxwybsmtjjipxa'],
        env: { SUPABASE_ACCESS_TOKEN: '<personal access token>' },
      },
    },
  },
  null,
  2,
);

export default function AdminMcpPage() {
  const adminTools = ADMIN_ENDPOINTS.filter((endpoint) => endpoint.access === 'admin');
  return (
    <div>
      <PageHeader
        title="MCP"
        description="Model Context Protocol servers that AI agents can use with this project. Register a server here so the team knows what is connected, how, and which tools it exposes."
      />

      <ResourceRegistry kind="mcp_server" noun="MCP server" fields={fields} forbidden={['token', 'secret', 'value']} />

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Connect an MCP client to this project" right={<CopyButton text={exampleConfig} />}>
          <p className="px-5 pt-4 text-[12px] leading-relaxed text-[#52525b]">
            The official Supabase MCP server gives an agent (Claude, Cursor, DSH…) read-only SQL access. Add this to the
            client&apos;s MCP config; keep the access token in the client, never in this site.
          </p>
          <pre className="m-5 overflow-x-auto rounded-lg bg-[#18181b] p-4 font-mono text-[11px] leading-relaxed text-[#e4e4e7]">{exampleConfig}</pre>
        </Panel>

        <Panel title="Admin RPCs an agent can call" right={`${adminTools.length} tools`}>
          <p className="px-5 pt-4 text-[12px] leading-relaxed text-[#52525b]">
            Any MCP server that speaks PostgREST can call these as tools at <span className="font-mono">{supabaseUrl}/rest/v1/rpc/&lt;name&gt;</span> with
            an admin user&apos;s JWT.
          </p>
          <ul className="divide-y divide-[#f0f0f1] px-5 py-2">
            {adminTools.map((tool) => (
              <li key={tool.name} className="py-2">
                <p className="font-mono text-[11.5px] font-medium">{tool.name}</p>
                <p className="text-[11px] text-[#71717a]">{tool.description}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
