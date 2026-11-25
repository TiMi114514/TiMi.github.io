/** Donations + message wall (supabase/migrations/20261125c_donations.sql). */
import { supabase } from '@/lib/supabase';

export type Currency = 'CNY' | 'USD';
export type PayMethod = 'wechat' | 'alipay' | 'card' | 'paypal' | 'other';

export type PaymentSettings = {
  /** Hosted checkout link for bank cards, e.g. a Stripe Payment Link (https://buy.stripe.com/…). */
  card_url: string;
  card_provider: string;
  /** PayPal.me or hosted button link. */
  paypal_url: string;
};

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const fallback: PaymentSettings = { card_url: '', card_provider: 'Stripe', paypal_url: '' };
  if (!supabase) return fallback;
  const { data, error } = await supabase.rpc('get_public_setting', { p_key: 'donate.payments' });
  if (error || !data) return fallback;
  return { ...fallback, ...(data as Partial<PaymentSettings>) };
}

/**
 * Add the donation id to a hosted checkout link so the payment can be matched
 * in the provider dashboard (Stripe Payment Links read client_reference_id).
 */
export function checkoutUrl(base: string, donationId: string, email?: string | null): string {
  try {
    const url = new URL(base);
    if (url.hostname.endsWith('stripe.com')) {
      url.searchParams.set('client_reference_id', donationId);
      if (email) url.searchParams.set('prefilled_email', email);
    } else {
      url.searchParams.set('ref', donationId);
    }
    return url.toString();
  } catch {
    return base;
  }
}

export type WallEntry = {
  id: string;
  kind: 'donation' | 'message';
  name: string | null;
  amount: number | null;
  currency: Currency | null;
  method: PayMethod | null;
  message: string | null;
  at: string;
};

export type TopDonor = {
  name: string | null;
  cny: number;
  usd: number;
  cny_equiv: number;
  gifts: number;
  last_at: string;
};

export type DonationWall = {
  stats: {
    donors_30d: number;
    gifts_30d: number;
    cny_30d: number;
    usd_30d: number;
    gifts_all: number;
    cny_all: number;
    usd_all: number;
    messages: number;
  };
  top: TopDonor[];
  recent: WallEntry[];
  generated_at: string;
};

export async function getDonationWall(limit = 30): Promise<DonationWall> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('donation_wall', { p_limit: limit });
  if (error) throw new Error(error.message);
  return data as DonationWall;
}

export async function submitDonation(input: {
  kind: 'donation' | 'message';
  name: string;
  anonymous: boolean;
  amount: number | null;
  currency: Currency | null;
  method: PayMethod | null;
  message: string;
  reference: string;
  visitor: string;
}): Promise<{ public_id: string; status: string; kind: string }> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('submit_donation', {
    p_kind: input.kind,
    p_name: input.name || null,
    p_anonymous: input.anonymous,
    p_amount: input.amount,
    p_currency: input.currency,
    p_method: input.method,
    p_message: input.message || null,
    p_reference: input.reference || null,
    p_visitor: input.visitor,
  });
  if (error) throw new Error(error.message);
  return data as { public_id: string; status: string; kind: string };
}

export function formatMoney(amount: number, currency: Currency, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
}

/** Public URL of the payment QR codes uploaded by an admin (site-assets bucket). */
export function qrUrl(method: 'wechat' | 'alipay', version?: string | number): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/site-assets/donate/${method}.png${version ? `?v=${version}` : ''}`;
}
