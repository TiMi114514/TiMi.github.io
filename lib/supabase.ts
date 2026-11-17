import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'implicit',
        },
      })
    : null;

export const authConfigured = Boolean(url && anonKey);

/** Absolute URL inside the deployed app, including GitHub Pages basePath. */
export function appUrl(path = ''): string {
  if (typeof window === 'undefined') return path;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const clean = path.replace(/^\//, '');
  return `${window.location.origin}${basePath}/${clean}`;
}
