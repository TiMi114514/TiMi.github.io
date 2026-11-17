'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { guessCountry } from '@/lib/analytics';
import { getBrowserSessionId } from '@/lib/session';
import { supabase } from '@/lib/supabase';

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

  return null;
}
