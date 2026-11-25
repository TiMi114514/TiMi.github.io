'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Globe, XCircle } from 'lucide-react';
import { CopyButton } from '@/components/admin/CopyButton';
import { ResourceRegistry, type FieldDef } from '@/components/admin/ResourceRegistry';
import { Badge, Button, PageHeader, Panel, inputClass } from '@/components/admin/ui';
import type { AdminResource } from '@/lib/admin-api';

const GITHUB_PAGES_IPS = ['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153'];
const PAGES_HOST = 'timi114514.github.io';
const REPO = 'TiMi114514/TiMi.github.io';

type DnsAnswer = { name: string; type: number; TTL: number; data: string };
const TYPE_NAMES: Record<number, string> = { 1: 'A', 5: 'CNAME', 16: 'TXT', 28: 'AAAA', 15: 'MX', 2: 'NS', 257: 'CAA' };

/** DNS-over-HTTPS: AliDNS first (reachable in mainland China), Cloudflare as fallback. */
async function resolve(name: string, type: string): Promise<DnsAnswer[]> {
  const providers = [
    `https://dns.alidns.com/resolve?name=${encodeURIComponent(name)}&type=${type}`,
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
  ];
  for (const url of providers) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/dns-json' }, cache: 'no-store' });
      if (!response.ok) continue;
      const data = (await response.json()) as { Answer?: DnsAnswer[] };
      return data.Answer ?? [];
    } catch {
      /* try next provider */
    }
  }
  throw new Error('DNS lookup failed');
}

type Check = {
  records: { type: string; data: string; ttl: number }[];
  pointsToPages: boolean;
  https: 'ok' | 'fail';
  httpsMs: number | null;
  ns: string[];
};

async function inspect(domain: string): Promise<Check> {
  const [a, aaaa, cname, ns, txt, caa] = await Promise.all(
    ['A', 'AAAA', 'CNAME', 'NS', 'TXT', 'CAA'].map((type) => resolve(domain, type).catch(() => [] as DnsAnswer[])),
  );
  const records = [...cname, ...a, ...aaaa, ...txt, ...caa].map((r) => ({
    type: TYPE_NAMES[r.type] ?? String(r.type),
    data: r.data.replace(/\.$/, ''),
    ttl: r.TTL,
  }));
  const pointsToPages =
    a.some((r) => GITHUB_PAGES_IPS.includes(r.data)) ||
    cname.some((r) => r.data.replace(/\.$/, '').toLowerCase().endsWith('github.io'));

  let https: Check['https'] = 'fail';
  let httpsMs: number | null = null;
  const started = performance.now();
  try {
    // no-cors: we only learn that TLS + HTTP succeeded, which is what we want.
    await fetch(`https://${domain}/`, { mode: 'no-cors', cache: 'no-store' });
    https = 'ok';
    httpsMs = Math.round(performance.now() - started);
  } catch {
    https = 'fail';
  }
  return {
    records,
    pointsToPages,
    https,
    httpsMs,
    ns: ns.map((r) => r.data.replace(/\.$/, '')),
  };
}

function DomainCheck({ domain }: { domain: string }) {
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setCheck(null);
    setError(null);
    inspect(domain)
      .then((result) => alive && setCheck(result))
      .catch((caught) => alive && setError(caught instanceof Error ? caught.message : 'Check failed'));
    return () => {
      alive = false;
    };
  }, [domain]);

  if (error) return <Badge tone="red">{error}</Badge>;
  if (!check) return <Badge tone="gray">checking…</Badge>;
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge tone={check.records.length ? 'green' : 'red'}>{check.records.length ? 'DNS resolves' : 'no DNS records'}</Badge>
      <Badge tone={check.pointsToPages ? 'green' : 'amber'}>{check.pointsToPages ? 'points to GitHub Pages' : 'not GitHub Pages'}</Badge>
      <Badge tone={check.https === 'ok' ? 'green' : 'red'}>{check.https === 'ok' ? `HTTPS ok · ${check.httpsMs} ms` : 'HTTPS failed'}</Badge>
    </div>
  );
}

const fields: FieldDef[] = [
  { key: 'domain', label: 'Domain', placeholder: 'alevelhub.com or www.alevelhub.com', column: true },
  { key: 'role', label: 'Role', type: 'select', options: ['primary', 'redirect', 'api', 'email', 'staging'], column: true },
  { key: 'registrar', label: 'Registrar', placeholder: 'Tencent Cloud / Aliyun / Cloudflare / Namecheap', column: true },
  { key: 'expires_at', label: 'Expires (YYYY-MM-DD)', placeholder: '2027-11-25', column: true },
  { key: 'icp', label: 'ICP filing (备案号)', placeholder: '京ICP备XXXXXXXX号 — required for servers in mainland China' },
  { key: 'dns_provider', label: 'DNS provider', placeholder: 'DNSPod / Cloudflare' },
];

function ExpiryBadge({ resource }: { resource: AdminResource }) {
  const domain = typeof resource.config.domain === 'string' ? resource.config.domain : '';
  const expires = typeof resource.config.expires_at === 'string' ? Date.parse(resource.config.expires_at) : NaN;
  const days = Number.isNaN(expires) ? null : Math.ceil((expires - Date.now()) / 86_400_000);
  return (
    <div className="flex flex-col items-start gap-1">
      {days === null ? null : days < 0 ? (
        <Badge tone="red">expired</Badge>
      ) : days < 30 ? (
        <Badge tone="red">renew in {days}d</Badge>
      ) : (
        <Badge tone="green">{days}d left</Badge>
      )}
      {domain ? <DomainCheck domain={domain} /> : <Badge tone="gray">no domain set</Badge>}
    </div>
  );
}

export default function AdminDomainsPage() {
  const [lookup, setLookup] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [result, setResult] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    const domain = lookup.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
    if (!domain) return;
    setBusy(true);
    setError(null);
    setActive(domain);
    try {
      setResult(await inspect(domain));
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : 'Lookup failed');
    } finally {
      setBusy(false);
    }
  }

  const dnsRecords = [
    { type: 'A', host: '@', value: GITHUB_PAGES_IPS.join('\n') },
    { type: 'AAAA', host: '@', value: '2606:50c0:8000::153\n2606:50c0:8001::153\n2606:50c0:8002::153\n2606:50c0:8003::153' },
    { type: 'CNAME', host: 'www', value: `${PAGES_HOST}` },
  ];

  return (
    <div>
      <PageHeader
        title="Domains"
        description="Domains that serve this site, with live DNS and HTTPS checks, expiry reminders and the records needed to point a custom domain at GitHub Pages."
        actions={
          <a
            href={`https://github.com/${REPO}/settings/pages`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e4e7] bg-white px-3 py-2 text-[12px] text-[#3f3f46] hover:bg-[#fafafa]"
          >
            <ExternalLink className="h-3.5 w-3.5" /> GitHub Pages settings
          </a>
        }
      />

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel title={<span className="flex items-center gap-2"><Globe className="h-4 w-4 text-[#71717a]" /> Current site</span>}>
          <div className="space-y-2 p-5 text-[12px]">
            <div className="flex justify-between gap-3">
              <span className="text-[#71717a]">Live URL</span>
              <a href={`https://${PAGES_HOST}/TiMi.github.io/`} target="_blank" rel="noreferrer" className="font-mono text-[11.5px] underline decoration-[#d4d4d8] underline-offset-2">
                https://{PAGES_HOST}/TiMi.github.io/
              </a>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#71717a]">Host</span>
              <span>GitHub Pages (static export)</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#71717a]">Base path</span>
              <span className="font-mono text-[11.5px]">{process.env.NEXT_PUBLIC_BASE_PATH || '(none)'}</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-[#71717a]">Status</span>
              <DomainCheck domain={PAGES_HOST} />
            </div>
          </div>
        </Panel>

        <Panel title="Look up any domain">
          <form onSubmit={run} className="flex gap-2 p-5 pb-3">
            <input value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="example.com" className={inputClass} />
            <Button type="submit" variant="dark" disabled={busy}>
              {busy ? 'Checking…' : 'Check'}
            </Button>
          </form>
          <div className="px-5 pb-5">
            {error ? <p className="text-[12px] text-[#b91c1c]">{error}</p> : null}
            {result && active ? (
              <div className="space-y-2 text-[12px]">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{active}</span>
                  {result.pointsToPages ? (
                    <span className="inline-flex items-center gap-1 text-[#15803d]"><CheckCircle2 className="h-3.5 w-3.5" /> GitHub Pages</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[#b45309]"><XCircle className="h-3.5 w-3.5" /> not GitHub Pages</span>
                  )}
                  <Badge tone={result.https === 'ok' ? 'green' : 'red'}>{result.https === 'ok' ? `HTTPS ${result.httpsMs} ms` : 'HTTPS failed'}</Badge>
                </p>
                {result.ns.length ? <p className="text-[11px] text-[#71717a]">Nameservers: {result.ns.join(', ')}</p> : null}
                <div className="divide-y divide-[#f0f0f1] rounded-lg border border-[#e4e4e7]">
                  {result.records.length === 0 ? (
                    <p className="px-3 py-3 text-[11.5px] text-[#a1a1aa]">No records found.</p>
                  ) : (
                    result.records.map((record, index) => (
                      <div key={index} className="grid grid-cols-[60px_1fr_60px] gap-2 px-3 py-1.5 text-[11.5px]">
                        <span className="font-mono text-[#71717a]">{record.type}</span>
                        <span className="break-all font-mono">{record.data}</span>
                        <span className="text-right text-[#a1a1aa]">{record.ttl}s</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : !error ? (
              <p className="text-[11.5px] text-[#a1a1aa]">Resolves A, AAAA, CNAME, NS, TXT and CAA via DNS-over-HTTPS and tests HTTPS.</p>
            ) : null}
          </div>
        </Panel>
      </div>

      <h2 className="mt-8 text-[16px] font-semibold">Your domains</h2>
      <ResourceRegistry kind="domain" noun="domain" fields={fields} renderExtra={(resource) => <ExpiryBadge resource={resource} />} />

      <Panel className="mt-4" title="Connect a custom domain to GitHub Pages">
        <ol className="list-decimal space-y-2 px-5 py-4 pl-10 text-[12px] leading-relaxed text-[#52525b]">
          <li>Buy a domain (Tencent Cloud, Aliyun, Cloudflare, Namecheap…) and open its DNS settings.</li>
          <li>Add the records below. For a subdomain only (e.g. <span className="font-mono">www</span>), the CNAME is enough.</li>
          <li>
            In GitHub → Settings → Pages → Custom domain, enter the domain and wait for the DNS check, then tick{' '}
            <em>Enforce HTTPS</em> (the certificate can take up to an hour).
          </li>
          <li>
            Set the GitHub Actions variable <span className="font-mono">NEXT_PUBLIC_BASE_PATH</span> to an empty value and redeploy —
            a custom domain serves the site from <span className="font-mono">/</span>, not <span className="font-mono">/TiMi.github.io</span>.
          </li>
          <li>
            In Supabase → Authentication → URL Configuration, change the Site URL and add the new domain to Redirect URLs, otherwise
            verification and reset emails link back to the old address.
          </li>
          <li>If the site later moves to a server in mainland China, the domain needs an ICP filing (备案) first.</li>
        </ol>
        <div className="overflow-x-auto border-t border-[#e4e4e7]">
          <table className="w-full min-w-[560px] text-left text-[12px]">
            <thead className="bg-[#fafafa] text-[11px] uppercase tracking-[0.04em] text-[#71717a]">
              <tr>
                <th className="px-5 py-2.5 font-medium">Type</th>
                <th className="px-5 py-2.5 font-medium">Host</th>
                <th className="px-5 py-2.5 font-medium">Value</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f1]">
              {dnsRecords.map((record) => (
                <tr key={record.type} className="align-top">
                  <td className="px-5 py-2.5 font-mono">{record.type}</td>
                  <td className="px-5 py-2.5 font-mono">{record.host}</td>
                  <td className="whitespace-pre px-5 py-2.5 font-mono text-[11.5px]">{record.value}</td>
                  <td className="px-5 py-2.5 text-right">
                    <CopyButton text={record.value} />
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
