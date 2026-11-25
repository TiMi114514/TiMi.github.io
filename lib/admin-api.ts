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

// ---------- App users ----------

export type AppUser = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  is_admin: boolean;
  last_active: string | null;
  status: VisitorStatus;
  ip: string | null;
  country_code: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  user_agent: string | null;
  downloads: number;
  last_download_at: string | null;
};

export function getAppUsers(search?: string) {
  return call<ListResult<AppUser>>('admin_users', { p_search: search || null, p_limit: 500 });
}

export type UserPresence = Omit<LiveVisitor, 'kind' | 'user_id' | 'email' | 'display_name' | 'downloads' | 'same_fingerprint'>;

export type UserDetail = {
  user: {
    id: string;
    email: string;
    display_name: string;
    created_at: string;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
    confirmed: boolean;
    provider: string | null;
    is_admin: boolean;
  };
  presence: UserPresence[];
  sessions: {
    id: string;
    ip: string | null;
    user_agent: string | null;
    created_at: string;
    refreshed_at: string | null;
    updated_at: string | null;
    not_after: string | null;
    aal: string | null;
  }[];
  downloads: { at: string; file: string | null; paper_id: string | null; dataset?: string | null; source: string }[];
  download_count: number;
  page_views: { at: string; path: string; referrer: string | null; country: string | null }[];
  page_view_count: number;
  security_events: { at: string; kind: string; ip: string | null; user_agent: string | null }[];
  tutor_requests: { at: string; subject: string; status: string }[];
  teacher_application: { at: string; subjects: string | null; status: string } | null;
  generated_at: string;
};

export function getUserDetail(userId: string) {
  return call<UserDetail>('admin_user_detail', { p_user_id: userId });
}

export type IpLocation = {
  ip: string;
  country?: string;
  region?: string;
  city?: string;
  isp?: string;
  org?: string;
  asn?: number;
  timezone?: string;
};

const ipCache = new Map<string, Promise<IpLocation | null>>();

/** Resolve an arbitrary IP to a place (ipwho.is, CORS-enabled). Cached per page load. */
export function lookupIp(ip: string, lang = 'zh-CN'): Promise<IpLocation | null> {
  const key = `${ip}|${lang}`;
  const cached = ipCache.get(key);
  if (cached) return cached;
  const promise = fetch(`https://ipwho.is/${encodeURIComponent(ip)}?lang=${lang}`, { cache: 'force-cache' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data: Record<string, any> | null) => {
      if (!data || data.success === false) return null;
      return {
        ip,
        country: data.country,
        region: data.region,
        city: data.city,
        isp: data.connection?.isp,
        org: data.connection?.org,
        asn: data.connection?.asn,
        timezone: data.timezone?.id,
      } as IpLocation;
    })
    .catch(() => null);
  ipCache.set(key, promise);
  return promise;
}

// ---------- Resource registry ----------

export type ResourceKind = 'integration' | 'mcp_server' | 'secret' | 'workflow' | 'agent' | 'domain';
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
  { name: 'admin_resource_list', args: 'p_kind text (integration | mcp_server | secret | workflow | agent | domain | null)', returns: '{ items: AdminResource[], total }', access: 'admin', description: 'Registry of integrations, MCP servers, secret metadata, workflows and agents.' },
  { name: 'admin_resource_upsert', args: 'p_kind, p_slug, p_name, p_status, p_config jsonb, p_notes', returns: 'AdminResource', access: 'admin', description: 'Create or update a registry entry (audited). Secrets reject value/secret/token fields.' },
  { name: 'admin_resource_delete', args: 'p_kind, p_slug', returns: '{ deleted }', access: 'admin', description: 'Remove a registry entry (audited).' },
  { name: 'admin_users', args: 'p_search text, p_limit int = 500', returns: '{ items: AppUser[], total }', access: 'admin', description: 'Accounts with status, last IP / location, last active and download count.' },
  { name: 'admin_user_detail', args: 'p_user_id uuid', returns: '{ user, presence, sessions, downloads, page_views, security_events, … }', access: 'admin', description: 'Everything known about one account.' },
  { name: 'admin_list_users', args: '—', returns: 'User[]', access: 'admin', description: 'Legacy: auth users with verification status (use admin_users).' },
  { name: 'admin_donations', args: "p_status text ('messages' = messages awaiting review), p_limit int = 200", returns: '{ items, total, pending, pending_messages }', access: 'admin', description: 'Donations with message, IP and UA for review.' },
  { name: 'admin_donation_review', args: 'p_id bigint, p_status text', returns: 'Donation', access: 'admin', description: 'Confirm, reject or hide a donation payment (audited).' },
  { name: 'admin_donation_message_review', args: "p_id bigint, p_status text ('approved' | 'rejected' | 'pending')", returns: 'Donation', access: 'admin', description: 'Moderate a donation message; only approved messages are published (audited).' },
  { name: 'donation_wall', args: 'p_limit int = 30', returns: '{ stats, top, recent }', access: 'public', description: 'Public donate page: 30-day stats, top 3 donors, recent confirmed gifts. Messages only if approved. No IPs or emails.' },
  { name: 'submit_donation', args: 'p_kind, p_name, p_anonymous, p_amount, p_currency, p_method, p_message, p_reference, p_visitor', returns: '{ public_id, status }', access: 'public', description: 'Donor form. Payment and message both start pending until an admin reviews them. 6 per IP per hour.' },
  { name: 'home_stats', args: '—', returns: '{ download_users, download_files, live_learners, live_guests }', access: 'public', description: 'Home page counters.' },
  { name: 'touch_presence', args: 'p_visitor text, p_path text, p_meta jsonb', returns: 'void', access: 'public', description: 'Visitor heartbeat. IP, country and UA are taken from request headers server-side.' },
  { name: 'log_security_event', args: 'p_kind text, p_email text, p_detail jsonb', returns: 'void', access: 'public', description: 'Records sign-in / sign-up / reset events with IP and UA (rate limited per IP).' },
];
