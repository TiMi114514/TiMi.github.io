'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { guessCountry } from '@/lib/analytics';
import { getBrowserSessionId, getVisitorId } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { getFingerprint } from '@/lib/fingerprint';
import { resolveGeoZone } from '@/lib/geo-time';

const HEARTBEAT_MS = 60_000;

/**
 * Privacy-friendly page view counter: stores only the path, an anonymous
 * session id, an optional user id, the referrer and a coarse country guess
 * from the browser time zone. No IP addresses, no cookies.
 */
export function AnalyticsTracker() {
  const pathname = usePathname();
  const { user } = useAuth();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase || !pathname) return;
    if (pathname.startsWith('/admin') || pathname.startsWith('/auth')) return;
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;

    const row = {
      path: pathname,
      session_id: getBrowserSessionId(),
      user_id: user?.id ?? null,
      country: guessCountry(),
      referrer: typeof document !== 'undefined' ? document.referrer || null : null,
    };

    void supabase
      .from('page_views')
      .insert(row)
      .then(({ error }) => {
        if (error && process.env.NODE_ENV !== 'production') {
          console.debug('analytics skipped:', error.message);
        }
      });
  }, [pathname, user?.id]);

  // Live presence heartbeat: counts signed-in users and guests alike.
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let meta: Record<string, unknown> | null = null;
    let metaSent = false;

    async function buildMeta(): Promise<Record<string, unknown>> {
      const [fp, geo] = await Promise.all([
        getFingerprint().catch(() => null),
        resolveGeoZone('en').catch(() => null),
      ]);
      return {
        fingerprint: fp?.hash,
        fp_components: fp?.components,
        region: geo?.region,
        city: geo?.city,
        country: geo?.country,
        country_code: geo?.countryCode,
        language: navigator.language,
        screen: `${window.screen.width}x${window.screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    }

    async function beat() {
      if (document.visibilityState !== 'visible') return;
      const path = pathRef.current ?? '/';
      if (path.startsWith('/admin')) return;
      if (!meta) meta = await buildMeta();
      const { error } = await client.rpc('touch_presence', {
        p_visitor: getVisitorId(),
        p_path: path,
        // Full metadata on the first beat, then only the small fields.
        p_meta: metaSent ? { fingerprint: meta.fingerprint } : meta,
      });
      if (!error) metaSent = true;
      else if (process.env.NODE_ENV !== 'production') {
        console.debug('presence skipped:', error.message);
      }
    }

    const run = () => void beat();
    run();
    const timer = window.setInterval(run, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', run);
    };
  }, [user?.id]);

  return null;
}
