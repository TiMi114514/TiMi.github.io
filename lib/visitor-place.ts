/**
 * One shared IP lookup for the visitor's country + timezone, used to pick the UI
 * language at sign-up and the Cambridge exam zone. Reuses the cached geo lookup
 * from the Pomodoro clock (lib/geo-time), so it costs no extra request.
 */
import { resolveGeoZone } from './geo-time';
import { zoneFor, DEFAULT_ZONE } from './exam-zones';
import type { ExamZone } from './exam-timetable';
import type { Locale } from './i18n';

export type VisitorPlace = { country: string | null; timezone: string | null };

// Mainland China needs ipip.net's Chinese provider; it also returns country/timezone.
export async function getVisitorPlace(): Promise<VisitorPlace> {
  try {
    const geo = await resolveGeoZone('en');
    let country = geo.countryCode?.toUpperCase() ?? null;
    if (!country && geo.country) {
      const n = geo.country.toLowerCase();
      if (n === 'china' || n === '中国') country = 'CN';
      else if (n.includes('hong kong') || n === '香港') country = 'HK';
      else if (n.includes('macau') || n.includes('macao') || n === '澳门') country = 'MO';
      else if (n.includes('taiwan') || n === '台湾') country = 'TW';
    }
    return { country, timezone: geo.timeZone ?? null };
  } catch {
    return { country: null, timezone: null };
  }
}

/** Country -> best supported UI language. Anything not listed stays English. */
const LOCALE_BY_COUNTRY: Record<string, Locale> = {
  CN: 'zh-CN', SG: 'en',
  TW: 'zh-TW', HK: 'zh-TW', MO: 'zh-TW',
  JP: 'ja',
  RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru',
  FR: 'fr', MC: 'fr', BE: 'fr', LU: 'fr', SN: 'fr', CI: 'fr', CM: 'fr', ML: 'fr', NE: 'fr', BF: 'fr', BJ: 'fr', TG: 'fr',
  GA: 'fr', CG: 'fr', CD: 'fr', GN: 'fr', MG: 'fr', HT: 'fr', TN: 'fr', MA: 'fr', DZ: 'fr',
  DE: 'de', AT: 'de', LI: 'de', CH: 'de',
  IT: 'it', SM: 'it', VA: 'it',
};

export function localeForCountry(country: string | null | undefined): Locale | null {
  return country ? LOCALE_BY_COUNTRY[country.toUpperCase()] ?? 'en' : null;
}

export function examZoneFor(place: VisitorPlace): ExamZone {
  return zoneFor(place.timezone, place.country) ?? DEFAULT_ZONE;
}

// ---------------------------------------------------------------- exam zone preference (browser)
const ZONE_KEY = 'alevel-hub.exam-zone';

export function readSavedZone(): ExamZone | null {
  try {
    const v = Number(window.localStorage.getItem(ZONE_KEY));
    return v >= 1 && v <= 6 ? (v as ExamZone) : null;
  } catch {
    return null;
  }
}

export function saveZone(zone: ExamZone): void {
  try {
    window.localStorage.setItem(ZONE_KEY, String(zone));
  } catch {
    /* storage unavailable */
  }
}
