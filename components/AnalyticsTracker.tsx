'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { guessCountry } from '@/lib/analytics';
import { getBrowserSessionId, getVisitorId } from '@/lib/session';
import { supabase } from '@/lib/supabase';

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

    function beat() {
      if (document.visibilityState !== 'visible') return;
      const path = pathRef.current ?? '/';
      if (path.startsWith('/admin')) return;
      void client
        .rpc('touch_presence', { p_visitor: getVisitorId(), p_path: path })
        .then(({ error }) => {
          if (error && process.env.NODE_ENV !== 'production') {
            console.debug('presence skipped:', error.message);
          }
        });
    }

    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [user?.id]);

  return null;
}
