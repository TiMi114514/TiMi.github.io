'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

/** Shared building blocks so every console page looks and behaves the same. */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[32px]">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-[13px] text-[#71717a]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  right,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-[#e4e4e7] bg-white ${className}`}>
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-[#e4e4e7] px-5 py-3.5">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {right ? <div className="text-[11px] text-[#a1a1aa]">{right}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'green' | 'amber' | 'red';
}) {
  const dot =
    tone === 'green' ? 'bg-[#22c55e]' : tone === 'amber' ? 'bg-[#f59e0b]' : tone === 'red' ? 'bg-[#ef4444]' : 'bg-[#a1a1aa]';
  return (
    <div className="rounded-xl border border-[#e4e4e7] bg-white px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-[11.5px] text-[#71717a]">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </p>
      <p className="mt-1.5 text-[24px] font-semibold tabular-nums leading-none">{value}</p>
      {hint ? <p className="mt-1.5 text-[11px] text-[#a1a1aa]">{hint}</p> : null}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  green: 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]',
  amber: 'border-[#fde68a] bg-[#fffbeb] text-[#b45309]',
  red: 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]',
  blue: 'border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]',
  gray: 'border-[#e4e4e7] bg-[#fafafa] text-[#52525b]',
};

export function Badge({ tone = 'gray', children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof BADGE_TONES {
  if (['active', 'success', 'connected', 'ok', 'sign_in', 'approved'].includes(status)) return 'green';
  if (['idle', 'planned', 'pending', 'queued', 'in_progress', 'password_reset_requested'].includes(status)) return 'amber';
  if (['error', 'failure', 'failed', 'sign_in_failed', 'rejected', 'cancelled'].includes(status)) return 'red';
  return 'gray';
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[12.5px] text-[#b91c1c]">
      {message}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-[12px] text-[#a1a1aa]">{children}</p>;
}

export function Button({
  children,
  onClick,
  disabled,
  variant = 'light',
  type = 'button',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'light' | 'dark' | 'danger';
  type?: 'button' | 'submit';
  title?: string;
}) {
  const styles =
    variant === 'dark'
      ? 'border-[#18181b] bg-[#18181b] text-white hover:bg-[#27272a]'
      : variant === 'danger'
        ? 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c] hover:bg-[#fee2e2]'
        : 'border-[#e4e4e7] bg-white text-[#3f3f46] hover:bg-[#fafafa]';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] transition-colors disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <Button onClick={onClick} disabled={loading}>
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
    </Button>
  );
}

export const inputClass =
  'w-full rounded-lg border border-[#e4e4e7] bg-white px-3 py-2 text-[12.5px] outline-none placeholder:text-[#a1a1aa] focus:border-[#a1a1aa]';

/**
 * Load data from an admin endpoint, optionally polling while the tab is visible.
 * Returns { data, error, loading, reload }.
 */
export function useAdminData<T>(loader: () => Promise<T>, deps: unknown[] = [], pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loaderRef.current();
      setData(result);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    if (!pollMs) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, pollMs);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, pollMs, ...deps]);

  return { data, error, loading, reload, setData };
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const csv = [header, ...rows]
    .map((line) => line.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Very small UA parser: browser + OS + device type, good enough for a console table. */
export function parseUserAgent(ua: string | null | undefined): { browser: string; os: string; device: string } {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
  const browser =
    /Edg\/([\d]+)/.exec(ua)?.[0].replace('Edg/', 'Edge ') ||
    /OPR\/([\d]+)/.exec(ua)?.[0].replace('OPR/', 'Opera ') ||
    /MicroMessenger\/([\d.]+)/.exec(ua)?.[0].replace('MicroMessenger/', 'WeChat ') ||
    /QQBrowser\/([\d]+)/.exec(ua)?.[0].replace('QQBrowser/', 'QQ Browser ') ||
    /Firefox\/([\d]+)/.exec(ua)?.[0].replace('Firefox/', 'Firefox ') ||
    (/Chrome\/([\d]+)/.test(ua) && !/Chromium/.test(ua)
      ? `Chrome ${/Chrome\/([\d]+)/.exec(ua)?.[1]}`
      : /Version\/([\d.]+).*Safari/.test(ua)
        ? `Safari ${/Version\/([\d.]+)/.exec(ua)?.[1]}`
        : /curl\//.test(ua)
          ? 'curl'
          : 'Other');
  const os = /Windows NT 10/.test(ua)
    ? 'Windows 10/11'
    : /Windows NT/.test(ua)
      ? 'Windows'
      : /iPhone|iPad|iPod/.test(ua)
        ? `iOS ${(/OS (\d+)_/.exec(ua)?.[1] ?? '')}`.trim()
        : /Android/.test(ua)
          ? `Android ${(/Android ([\d.]+)/.exec(ua)?.[1] ?? '')}`.trim()
          : /Mac OS X/.test(ua)
            ? 'macOS'
            : /HarmonyOS/.test(ua)
              ? 'HarmonyOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : 'Other';
  const device = /iPad|Tablet/.test(ua) ? 'Tablet' : /Mobi|iPhone|Android/.test(ua) ? 'Mobile' : 'Desktop';
  return { browser, os, device };
}
