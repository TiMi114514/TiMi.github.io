/**
 * Typed client for the standard admin data API (supabase/migrations/20261125_admin_api_v1.sql).
 *
 * Contract: every admin_* RPC checks is_admin() server-side and returns jsonb.
 * List endpoints return { items, total, generated_at }. Errors are thrown as
 * AdminApiError so pages can show one consistent message.
 */
import { supabase } from '@/lib/supabase';

export class AdminApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AdminApiError';
    this.code = code;
  }
}

export type ListResult<T> = { items: T[]; total: number; generated_at: string };

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new AdminApiError('Supabase is not configured for this deployment.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    throw new AdminApiError(
      error.code === '42501' ? 'Admin access required.' : error.message,
      error.code,
    );
  }
  return data as T;
}

// ---------- Live visitors ----------

export type VisitorStatus = 'active' | 'idle' | 'offline';

export type LiveVisitor = {
  actor: string;
  kind: 'user' | 'guest';
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  visitor_id: string | null;
  status: VisitorStatus;
  path: string | null;
  ip: string | null;
  country_code: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  fingerprint: string | null;
  fp_components: Record<string, unknown> | null;
  user_agent: string | null;
  language: string | null;
  screen: string | null;
  timezone: string | null;
  first_seen: string;
  last_seen: string;
  heartbeats: number;
  downloads: number;
  same_fingerprint: number;
};

export type LiveVisitorsResult = ListResult<LiveVisitor> & { active: number; idle: number };

export function getLiveVisitors(windowMinutes = 60) {
  return call<LiveVisitorsResult>('admin_live_visitors', { p_window_minutes: windowMinutes });
}

// ---------- Logs ----------

export type LogKind = 'all' | 'page_view' | 'download' | 'admin' | 'email' | 'security';

export type LogEvent = {
  kind: Exclude<LogKind, 'all'>;
  id: string;
  at: string;
  actor: string | null;
  subject: string | null;
  detail: Record<string, unknown> | null;
};

export type LogsResult = ListResult<LogEvent> & { next_before: string | null };

export function getLogs(params: {
  kind?: LogKind;
  search?: string;
  limit?: number;
  before?: string | null;
} = {}) {
  return call<LogsResult>('admin_logs', {
    p_kind: params.kind ?? 'all',
    p_search: params.search || null,
    p_limit: params.limit ?? 100,
    p_before: params.before ?? null,
  });
}

// ---------- Security ----------

export type AuthSession = {
  id: string;
  user_id: string;
  email: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  refreshed_at: string | null;
  updated_at: string | null;
  aal: string | null;
  is_admin: boolean;
};

export type SecurityEvent = {
  id: number;
  kind: string;
  email: string | null;
  user_id: string | null;
  ip: string | null;
  user_agent: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

export type SecurityOverview = {
  sessions: AuthSession[];
  events: SecurityEvent[];
  failed_24h: number;
  signins_24h: number;
  admins: { email: string; created_at: string }[];
  unconfirmed_users: number;
  generated_at: string;
};

export function getSecurityOverview() {
  return call<SecurityOverview>('admin_security_overview');
}

export function revokeSession(sessionId: string) {
  return call<{ revoked: number }>('admin_revoke_session', { p_session_id: sessionId });
}

// ---------- Analytics audience ----------

export type Bucket = { label: string; count: number };

export type Audience = {
  visitors: number;
  signed_in: number;
  regions: Bucket[];
  countries: Bucket[];
  languages: Bucket[];
  user_agents: Bucket[];
  generated_at: string;
};

export function getAudience(days = 30) {
  return call<Audience>('admin_audience', { p_days: days });
}

// ---------- Resource registry ----------

export type ResourceKind = 'integration' | 'mcp_server' | 'secret' | 'workflow' | 'agent';
export type ResourceStatus = 'active' | 'disabled' | 'error' | 'planned';

export type AdminResource = {
  id: string;
  kind: ResourceKind;
  slug: string;
  name: string;
  status: ResourceStatus;
  config: Record<string, unknown>;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export function listResources(kind: ResourceKind | null) {
  return call<ListResult<AdminResource>>('admin_resource_list', { p_kind: kind });
}

export function upsertResource(input: {
  kind: ResourceKind;
  slug: string;
  name: string;
  status?: ResourceStatus;
  config?: Record<string, unknown>;
  notes?: string | null;
}) {
  return call<AdminResource>('admin_resource_upsert', {
    p_kind: input.kind,
    p_slug: input.slug,
    p_name: input.name,
    p_status: input.status ?? 'active',
    p_config: input.config ?? {},
    p_notes: input.notes ?? null,
  });
}

export function deleteResource(kind: ResourceKind, slug: string) {
  return call<{ deleted: number }>('admin_resource_delete', { p_kind: kind, p_slug: slug });
}

/** Endpoint catalogue rendered on the API page. */
export const ADMIN_ENDPOINTS: {
  name: string;
  args: string;
  returns: string;
  access: 'admin' | 'public';
  description: string;
}[] = [
  { name: 'admin_live_visitors', args: 'p_window_minutes int = 60', returns: '{ items: LiveVisitor[], total, active, idle }', access: 'admin', description: 'Visitors seen in the window with IP, region, fingerprint, UA, status and download count.' },
  { name: 'admin_logs', args: "p_kind text = 'all', p_search text, p_limit int = 100, p_before timestamptz", returns: '{ items: LogEvent[], total, next_before }', access: 'admin', description: 'Unified log stream: page_view, download, admin, email, security. Paginate with next_before.' },
  { name: 'admin_security_overview', args: '—', returns: '{ sessions, events, failed_24h, signins_24h, admins, unconfirmed_users }', access: 'admin', description: 'Active auth sessions, recent security events and admin list.' },
  { name: 'admin_revoke_session', args: 'p_session_id uuid', returns: '{ revoked }', access: 'admin', description: 'Delete an auth session (forces sign-out once its token expires).' },
  { name: 'admin_audience', args: 'p_days int = 30', returns: '{ visitors, signed_in, regions, countries, languages, user_agents }', access: 'admin', description: 'Audience breakdown from visitor records.' },
  { name: 'admin_analytics', args: 'p_days int = 7', returns: '{ total_visits, unique_visitors, live_visitors, series, pages, countries, … }', access: 'admin', description: 'Traffic analytics.' },
  { name: 'admin_download_analytics', args: 'p_days int = 30', returns: '{ total_downloads, unique_downloaders, series, top_files, datasets, … }', access: 'admin', description: 'Download analytics.' },
  { name: 'admin_resource_list', args: 'p_kind text (integration | mcp_server | secret | workflow | agent | null)', returns: '{ items: AdminResource[], total }', access: 'admin', description: 'Registry of integrations, MCP servers, secret metadata, workflows and agents.' },
  { name: 'admin_resource_upsert', args: 'p_kind, p_slug, p_name, p_status, p_config jsonb, p_notes', returns: 'AdminResource', access: 'admin', description: 'Create or update a registry entry (audited). Secrets reject value/secret/token fields.' },
  { name: 'admin_resource_delete', args: 'p_kind, p_slug', returns: '{ deleted }', access: 'admin', description: 'Remove a registry entry (audited).' },
  { name: 'admin_list_users', args: '—', returns: 'User[]', access: 'admin', description: 'Auth users with verification status.' },
  { name: 'home_stats', args: '—', returns: '{ download_users, download_files, live_learners, live_guests }', access: 'public', description: 'Home page counters.' },
  { name: 'touch_presence', args: 'p_visitor text, p_path text, p_meta jsonb', returns: 'void', access: 'public', description: 'Visitor heartbeat. IP, country and UA are taken from request headers server-side.' },
  { name: 'log_security_event', args: 'p_kind text, p_email text, p_detail jsonb', returns: 'void', access: 'public', description: 'Records sign-in / sign-up / reset events with IP and UA (rate limited per IP).' },
];
