/**
 * Resolves the visitor's region (province / state + city) and timezone from
 * their public IP address.
 *
 * The site is a static export, so the browser asks public geolocation services
 * directly. Place names are requested in the active UI language where the
 * provider supports it (ipip.net gives simplified Chinese; ipwho.is supports
 * zh / ja / ru / fr / de …). Results are cached per language for 6 hours.
 *
 * The device timezone is never shown. If every provider fails we only show the
 * GMT offset without a place.
 */

import type { Locale } from './i18n';

export type GeoZone = {
  /** IANA timezone resolved from the IP, if any. */
  timeZone?: string;
  region?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  source: 'ip' | 'none';
};

const CACHE_PREFIX = 'alevel-hub.geo.v2.';
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

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value
    .trim()
    // ipwho.is English names: "Shandong Sheng", "Beijing Shi"
    .replace(/\s+(Sheng|Shi|Zizhiqu|Province)$/i, '')
    .trim();
  return text || undefined;
}

function readCache(locale: Locale): GeoZone | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + locale);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GeoZone & { at?: number };
    if (parsed.source !== 'ip' || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    if (parsed.timeZone && !isValidTimeZone(parsed.timeZone)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(locale: Locale, zone: GeoZone): void {
  try {
    window.localStorage.setItem(CACHE_PREFIX + locale, JSON.stringify({ ...zone, at: Date.now() }));
  } catch {
    /* storage may be unavailable */
  }
}

async function fetchJson(url: string, timeoutMs = 4500): Promise<Record<string, any>> {
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

/** ipwho.is language codes. zh-CN returns traditional-style names, which suit zh-TW. */
const IPWHO_LANG: Record<Locale, string> = {
  en: 'en',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-CN',
  ru: 'ru',
  fr: 'fr',
  de: 'de',
  it: 'en',
  ja: 'ja',
};

async function fromIpwho(locale: Locale): Promise<GeoZone | null> {
  const data = await fetchJson(`https://ipwho.is/?lang=${IPWHO_LANG[locale]}`);
  if (data?.success === false) return null;
  const timeZone = data?.timezone?.id;
  return {
    timeZone: isValidTimeZone(timeZone) ? timeZone : undefined,
    region: clean(data?.region),
    city: clean(data?.city),
    country: clean(data?.country),
    countryCode: typeof data?.country_code === 'string' ? data.country_code : undefined,
    source: 'ip',
  };
}

/** ipip.net: simplified Chinese names, no timezone. data.location = [国家, 省, 市, '', ISP] */
async function fromIpip(): Promise<GeoZone | null> {
  const data = await fetchJson('https://myip.ipip.net/json');
  const location = data?.data?.location;
  if (!Array.isArray(location) || !location[0]) return null;
  const [country, region, city] = location as string[];
  const isChina = country === '中国';
  const special: Record<string, string> = {
    香港: 'Asia/Hong_Kong',
    澳门: 'Asia/Macau',
    台湾: 'Asia/Taipei',
  };
  return {
    timeZone: isChina ? (special[region] ?? 'Asia/Shanghai') : undefined,
    region: clean(region),
    city: clean(city),
    country: clean(country),
    countryCode: isChina ? 'CN' : undefined,
    source: 'ip',
  };
}

async function fromIpinfo(): Promise<GeoZone | null> {
  const data = await fetchJson('https://ipinfo.io/json');
  const timeZone = data?.timezone;
  return {
    timeZone: isValidTimeZone(timeZone) ? timeZone : undefined,
    region: clean(data?.region),
    city: clean(data?.city),
    country: clean(data?.country),
    countryCode: typeof data?.country === 'string' ? data.country : undefined,
    source: 'ip',
  };
}

function hasPlace(zone: GeoZone | null): zone is GeoZone {
  return Boolean(zone && (zone.region || zone.city || zone.country));
}

const inflight = new Map<Locale, Promise<GeoZone>>();

export function resolveGeoZone(locale: Locale): Promise<GeoZone> {
  const cached = readCache(locale);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(locale);
  if (pending) return pending;

  const promise = (async (): Promise<GeoZone> => {
    const chain: Array<() => Promise<GeoZone | null>> =
      locale === 'zh-CN'
        ? [fromIpip, () => fromIpwho(locale), fromIpinfo]
        : [() => fromIpwho(locale), fromIpinfo];

    let found: GeoZone | null = null;
    for (const attempt of chain) {
      try {
        const zone = await attempt();
        if (hasPlace(zone)) {
          found = zone;
          break;
        }
      } catch {
        /* provider unreachable or rate limited — try the next one */
      }
    }

    if (found && !found.timeZone) {
      // ipip.net outside China gives no timezone; borrow one from ipwho.is.
      try {
        const extra = await fromIpwho('en');
        if (extra?.timeZone) found = { ...found, timeZone: extra.timeZone };
      } catch {
        /* keep the place without a timezone */
      }
    }

    if (!found) return { source: 'none' };
    writeCache(locale, found);
    return found;
  })().finally(() => inflight.delete(locale));

  inflight.set(locale, promise);
  return promise;
}

/** "GMT+8", "GMT-3:30", "GMT". Uses the IP timezone when known. */
export function zoneOffsetLabel(timeZone?: string, date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      ...(timeZone ? { timeZone } : {}),
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

const CJK_LOCALES: Locale[] = ['zh-CN', 'zh-TW', 'ja'];

/** Region + city, e.g. "山东 济南" or "Jinan, Shandong". Falls back to the country. */
export function placeLabel(zone: GeoZone | null, locale: Locale): string {
  if (!zone || zone.source !== 'ip') return '';
  const parts: string[] = [];
  for (const part of [zone.region, zone.city]) {
    if (!part) continue;
    // "北京" / "北京市", "Beijing" / "Beijing": skip duplicates
    const bare = part.replace(/[市省]$/, '');
    if (parts.some((existing) => existing.replace(/[市省]$/, '') === bare)) continue;
    parts.push(part);
  }
  if (parts.length === 0) return zone.country ?? '';
  return CJK_LOCALES.includes(locale) ? parts.join(' ') : parts.reverse().join(', ');
}

/** "山东 济南 · GMT+8" or just "GMT+8" when no place is known. */
export function zoneLabel(zone: GeoZone | null, locale: Locale): string {
  const place = placeLabel(zone, locale);
  const offset = zoneOffsetLabel(zone?.timeZone);
  return [place, offset].filter(Boolean).join(' · ');
}
