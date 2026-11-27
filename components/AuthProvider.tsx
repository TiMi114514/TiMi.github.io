'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { authConfigured, supabase } from '@/lib/supabase';

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  verified: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const user = session?.user ?? null;

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // A redemption code entered at sign-up is redeemed on the first signed-in visit.
  useEffect(() => {
    if (!supabase || !user) return;
    let pending: string | null = null;
    try {
      pending = window.localStorage.getItem('alevel-hub.pending-redeem');
    } catch {
      /* storage unavailable */
    }
    if (!pending) return;
    void supabase.rpc('redeem_code', { p_code: pending }).then(({ error }) => {
      try {
        window.localStorage.removeItem('alevel-hub.pending-redeem');
        window.sessionStorage.setItem('alevel-hub.redeem-result', error ? 'err:' + error.message : 'ok');
      } catch {
        /* storage unavailable */
      }
    });
  }, [user?.id]);

  useEffect(() => {
    if (!supabase || !user) {
      setIsAdmin(false);
      return;
    }

    let active = true;

    supabase
      .rpc('is_admin')
      .then(
        ({ data, error }) => {
          if (!active) return;
          setIsAdmin(!error && data === true);
        },
        () => {
          if (active) setIsAdmin(false);
        },
      );

    return () => {
      active = false;
    };
  }, [user?.id]);

  const value = useMemo<AuthState>(() => {
    return {
      user,
      session,
      loading,
      configured: authConfigured,
      verified: Boolean(user?.email_confirmed_at || user?.confirmed_at),
      isAdmin,
      signOut: async () => {
        if (!supabase) return;
        await supabase.rpc('log_security_event', { p_kind: 'sign_out', p_email: user?.email ?? null }).then(
          () => undefined,
          () => undefined,
        );
        await supabase.auth.signOut();
      },
      refresh: async () => {
        if (!supabase) return;
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
      },
    };
  }, [user, session, loading, isAdmin]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
