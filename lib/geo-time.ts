/**
 * Resolves the visitor's local timezone from their public IP address.
 *
 * The site is a fully static export, so there is no server to read the IP from
 * the request. Instead the browser asks a public geolocation service (ipapi.co
 * first, ipwho.is as a fallback) which returns a timezone for the caller's IP.
 * The result is cached in localStorage for 6 hours so repeat visits do not hit
 * the providers again. If both providers fail (offline, blocked, rate limit)
 * we fall back to the device timezone so the clock never breaks.
 *
 * No IP address is ever sent to our own servers or stored anywhere but the
 * visitor's browser cache (and only the derived timezone is cached).
 */

export type GeoZone = {
  timeZone: string;
  place?: string;
  source: 'ip' | 'browser';
};

const CACHE_KEY = 'differential-quant.geo.tz.v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function readCache(): GeoZone | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GeoZone & { at: number }>;
    if (parsed.source !== 'ip' || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    if (!isValidTimeZone(parsed.timeZone)) return null;
    return {
      timeZone: parsed.timeZone,
      place: typeof parsed.place === 'string' ? parsed.place : undefined,
      source: 'ip',
    };
  } catch {
    return null;
  }
}

function writeCache(zone: GeoZone): void {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ timeZone: zone.timeZone, place: zone.place, source: zone.source, at: Date.now() }),
    );
  } catch {
    /* storage may be unavailable */
  }
}

async function fetchJson(url: string, timeoutMs = 4000): Promise<Record<string, any>> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as Record<string, any>;
  } finally {
    window.clearTimeout(timer);
  }
}

type ZoneAttempt = () => Promise<GeoZone | null>;

const attempts: ZoneAttempt[] = [
  async () => {
    const data = await fetchJson('https://ipapi.co/json/');
    const timeZone = data?.timezone;
    if (!isValidTimeZone(timeZone)) return null;
    const place = [data?.city, data?.country_name].filter(Boolean).join(', ') || undefined;
    return { timeZone, place, source: 'ip' };
  },
  async () => {
    const data = await fetchJson('https://ipwho.is/');
    const timeZone =
      data?.time_zone?.name ??
      data?.timezone?.name ??
      (typeof data?.timezone === 'string' ? data.timezone : undefined);
    if (!isValidTimeZone(timeZone)) return null;
    const place = [data?.city, data?.country].filter(Boolean).join(', ') || undefined;
    return { timeZone, place, source: 'ip' };
  },
];

export async function resolveGeoZone(): Promise<GeoZone> {
  const cached = readCache();
  if (cached) return cached;

  for (const attempt of attempts) {
    try {
      const zone = await attempt();
      if (zone) {
        writeCache(zone);
        return zone;
      }
    } catch {
      /* provider unreachable or rate limited — try the next one */
    }
  }

  return { timeZone: browserTimeZone(), source: 'browser' };
}

export function zoneOffsetLabel(timeZone: string, date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

export function zoneLabel(zone: GeoZone | null): string {
  if (!zone) return 'Local time';
  const where = zone.place ?? zone.timeZone.replace(/_/g, ' ');
  const offset = zoneOffsetLabel(zone.timeZone);
  return offset ? `${where} · ${offset}` : where;
}

export function zoneSourceNote(zone: GeoZone | null): string {
  if (!zone) return 'Looking up your timezone from your IP address…';
  if (zone.source === 'ip') return `Matched from your IP address — ${zoneLabel(zone)}.`;
  return `IP lookup unavailable, using your device timezone — ${zoneLabel(zone)}.`;
}