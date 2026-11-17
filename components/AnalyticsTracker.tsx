'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { guessCountry } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

const SESSION_KEY = 'paperwise.analytics.session';

function getSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

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
      session_id: getSessionId(),
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
