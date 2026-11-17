export type AnalyticsSeriesPoint = { date: string; visits: number };
export type AnalyticsPage = { path: string; visits: number };
export type AnalyticsCountry = { country: string; visits: number };

export type AdminAnalytics = {
  days: number;
  total_visits: number;
  unique_visitors: number;
  avg_duration: number;
  prev_total_visits: number;
  prev_unique_visitors: number;
  prev_avg_duration: number;
  live_visitors: number;
  series: AnalyticsSeriesPoint[];
  pages: AnalyticsPage[];
  countries: AnalyticsCountry[];
};

export type AdminDownloadAnalytics = {
  days: number;
  total_downloads: number;
  unique_downloaders: number;
  prev_total_downloads: number;
  prev_unique_downloaders: number;
  series: { date: string; downloads: number }[];
  top_files: { name: string; downloads: number }[];
  datasets: { dataset: string; downloads: number }[];
};

const TIMEZONE_COUNTRIES: Record<string, string> = {
  'Asia/Hong_Kong': 'Hong Kong',
  'Asia/Shanghai': 'China',
  'Asia/Chongqing': 'China',
  'Asia/Harbin': 'China',
  'Asia/Urumqi': 'China',
  'Asia/Taipei': 'Taiwan',
  'Asia/Tokyo': 'Japan',
  'Asia/Seoul': 'South Korea',
  'Asia/Singapore': 'Singapore',
  'Asia/Kuala_Lumpur': 'Malaysia',
  'Asia/Bangkok': 'Thailand',
  'Asia/Jakarta': 'Indonesia',
  'Asia/Manila': 'Philippines',
  'Asia/Kolkata': 'India',
  'Asia/Dubai': 'United Arab Emirates',
  'Europe/London': 'United Kingdom',
  'Europe/Paris': 'France',
  'Europe/Berlin': 'Germany',
  'Europe/Madrid': 'Spain',
  'Europe/Rome': 'Italy',
  'Europe/Amsterdam': 'Netherlands',
  'Europe/Stockholm': 'Sweden',
  'Europe/Moscow': 'Russia',
  'America/New_York': 'United States',
  'America/Chicago': 'United States',
  'America/Denver': 'United States',
  'America/Los_Angeles': 'United States',
  'America/Phoenix': 'United States',
  'America/Toronto': 'Canada',
  'America/Vancouver': 'Canada',
  'America/Sao_Paulo': 'Brazil',
  'America/Mexico_City': 'Mexico',
  'Australia/Sydney': 'Australia',
  'Australia/Melbourne': 'Australia',
  'Australia/Perth': 'Australia',
  'Pacific/Auckland': 'New Zealand',
  'Africa/Johannesburg': 'South Africa',
  'Africa/Lagos': 'Nigeria',
  'Africa/Cairo': 'Egypt',
};

/** Coarse, privacy-friendly country estimate from the browser time zone. */
export function guessCountry(): string | null {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return null;
    return TIMEZONE_COUNTRIES[timeZone] ?? timeZone.split('/').pop()?.replace(/_/g, ' ') ?? null;
  } catch {
    return null;
  }
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  const minuteText = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  if (remainder === 0) return minuteText;
  return `${minuteText} ${remainder} second${remainder === 1 ? '' : 's'}`;
}

export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function formatDayLabel(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

export function pageLabel(path: string): string {
  if (path === '/' || path === '') return 'home';
  return path.replace(/^\/+/, '').replace(/\/+$/, '');
}
