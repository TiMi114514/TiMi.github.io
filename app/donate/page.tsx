'use client';

import { useCallback, useEffect, useState } from 'react';
import { Crown, Heart, MessageCircle, QrCode, RefreshCw } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/components/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { getVisitorId } from '@/lib/session';
import {
  formatMoney,
  getDonationWall,
  qrUrl,
  submitDonation,
  type Currency,
  type DonationWall,
  type PayMethod,
  type TopDonor,
} from '@/lib/donations';

const PRESETS: Record<Currency, number[]> = { CNY: [10, 30, 50, 100], USD: [2, 5, 10, 20] };
const MEDALS = ['bg-[#f5d77a]', 'bg-[#d9dde3]', 'bg-[#e8b48a]'];

function QrImage({ method, label, soon }: { method: 'wechat' | 'alipay'; label: string; soon: string }) {
  const [failed, setFailed] = useState(false);
  const src = qrUrl(method);
  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="grid h-[164px] w-[164px] place-items-center overflow-hidden rounded-xl border border-line bg-white">
        {src && !failed ? (
          <img src={src} alt={label} width={164} height={164} className="h-full w-full object-contain" onError={() => setFailed(true)} />
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-3 text-center text-[11px] text-muted">
            <QrCode className="h-6 w-6" aria-hidden />
            {soon}
          </span>
        )}
      </div>
      <figcaption className="text-[12px] text-muted">{label}</figcaption>
    </figure>
  );
}

export default function DonatePage() {
  const { locale, t } = useI18n();
  const { user } = useAuth();
  const [wall, setWall] = useState<DonationWall | null>(null);
  const [wallError, setWallError] = useState<string | null>(null);
  const [loadingWall, setLoadingWall] = useState(false);

  const [kind, setKind] = useState<'donation' | 'message'>('donation');
  const [currency, setCurrency] = useState<Currency>('CNY');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayMethod>('wechat');
  const [name, setName] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const fallback = (user?.user_metadata?.display_name as string | undefined) || '';
    if (fallback) setName((current) => current || fallback);
  }, [user]);

  useEffect(() => {
    if (locale !== 'zh-CN' && locale !== 'zh-TW') setCurrency((c) => (c === 'CNY' && !amount ? 'USD' : c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const load = useCallback(async () => {
    setLoadingWall(true);
    try {
      setWall(await getDonationWall(30));
      setWallError(null);
    } catch (caught) {
      setWallError(caught instanceof Error ? caught.message : 'Failed to load.');
    } finally {
      setLoadingWall(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(null);
    const value = Number(amount);
    if (kind === 'donation' && !(value > 0)) return setError(t('donate.errAmount'));
    if (kind === 'message' && !message.trim()) return setError(t('donate.errMessage'));
    setBusy(true);
    try {
      const result = await submitDonation({
        kind,
        name: name.trim(),
        anonymous,
        amount: kind === 'donation' ? value : null,
        currency: kind === 'donation' ? currency : null,
        method: kind === 'donation' ? method : null,
        message: message.trim(),
        reference: reference.trim(),
        visitor: getVisitorId(),
      });
      setDone(kind === 'donation' ? t('donate.thanksDonation', { id: result.public_id }) : t('donate.thanksMessage', { id: result.public_id }));
      setAmount('');
      setMessage('');
      setReference('');
      if (kind === 'message') void load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  }

  function money(value: number, cur: Currency) {
    return formatMoney(value, cur, locale);
  }

  function totalLabel(cny: number, usd: number) {
    const parts = [];
    if (cny > 0) parts.push(money(cny, 'CNY'));
    if (usd > 0) parts.push(money(usd, 'USD'));
    return parts.length ? parts.join(' + ') : money(0, currency);
  }

  function topName(donor: TopDonor) {
    return donor.name || t('donate.anonymous');
  }

  const stats = wall?.stats;

  return (
    <div>
      <Header />
      <main className="container-page py-14 sm:py-20">
        <div className="mx-auto max-w-[1040px]">
          <p className="eyebrow">{t('donate.eyebrow')}</p>
          <h1 className="mt-3 font-display text-[46px] leading-none tracking-[-0.01em] sm:text-[54px]">{t('donate.title')}</h1>
          <p className="mt-4 max-w-[620px] text-[14px] leading-relaxed text-muted">{t('donate.intro')}</p>

          {/* Stats */}
          <div className="mt-9 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              [t('donate.stat.donors'), stats ? stats.donors_30d.toLocaleString(locale) : '—'],
              [t('donate.stat.raised'), stats ? totalLabel(stats.cny_30d, stats.usd_30d) : '—'],
              [t('donate.stat.gifts'), stats ? stats.gifts_all.toLocaleString(locale) : '—'],
              [t('donate.stat.messages'), stats ? stats.messages.toLocaleString(locale) : '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-line bg-paper px-4 py-3.5">
                <p className="text-[11.5px] text-muted">{label}</p>
                <p className="mt-1.5 font-display text-[24px] leading-tight tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {/* Top 3 */}
          <section className="mt-5 rounded-2xl border border-line bg-paper p-5 sm:p-7">
            <h2 className="flex items-center gap-2 font-display text-[24px] leading-none">
              <Crown className="h-5 w-5 text-[#b8860b]" aria-hidden /> {t('donate.topTitle')}
            </h2>
            {wall && wall.top.length === 0 ? (
              <p className="mt-4 text-[13px] text-muted">{t('donate.topEmpty')}</p>
            ) : (
              <ol className="mt-5 grid gap-3 md:grid-cols-3">
                {(wall?.top ?? [null, null, null]).map((donor, index) => (
                  <li key={index} className="flex items-center gap-3 rounded-xl border border-line bg-cream/50 px-4 py-3.5">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-[17px] text-ink ${MEDALS[index]}`}>
                      {index + 1}
                    </span>
                    {donor ? (
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium">{topName(donor)}</p>
                        <p className="text-[12px] text-muted">
                          {totalLabel(donor.cny, donor.usd)} · {t('donate.gifts', { n: donor.gifts })}
                        </p>
                      </div>
                    ) : (
                      <span className="h-8 w-32 animate-pulse rounded bg-soft" />
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <div className="mt-5 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            {/* QR codes */}
            <section className="rounded-2xl border border-line bg-paper p-5 sm:p-7">
              <h2 className="font-display text-[22px] leading-none">{t('donate.payTitle')}</h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{t('donate.payHint')}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-6">
                <QrImage method="wechat" label={t('donate.wechat')} soon={t('donate.noQr')} />
                <QrImage method="alipay" label={t('donate.alipay')} soon={t('donate.noQr')} />
              </div>
            </section>

            {/* Form */}
            <form onSubmit={submit} className="rounded-2xl border border-line bg-paper p-5 sm:p-7">
              <h2 className="font-display text-[22px] leading-none">{t('donate.formTitle')}</h2>
              <div className="mt-4 inline-flex rounded-full border border-line bg-cream/60 p-1">
                {(['donation', 'message'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setKind(value);
                      setError(null);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] transition-colors ${kind === value ? 'bg-ink text-cream' : 'text-muted hover:text-ink'}`}
                  >
                    {value === 'donation' ? <Heart className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
                    {value === 'donation' ? t('donate.tabDonation') : t('donate.tabMessage')}
                  </button>
                ))}
              </div>

              <div className="mt-5 space-y-4">
                {kind === 'donation' ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                      <label className="block space-y-1.5 text-[12.5px] text-muted">
                        <span>{t('donate.amount')}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          step="0.01"
                          required
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="input"
                          placeholder={currency === 'CNY' ? '¥' : '$'}
                        />
                      </label>
                      <label className="block space-y-1.5 text-[12.5px] text-muted">
                        <span>{t('donate.currency')}</span>
                        <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="input">
                          <option value="CNY">CNY ¥</option>
                          <option value="USD">USD $</option>
                        </select>
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {PRESETS[currency].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAmount(String(preset))}
                          className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${Number(amount) === preset ? 'border-ink bg-ink text-cream' : 'border-line text-muted hover:text-ink'}`}
                        >
                          {money(preset, currency)}
                        </button>
                      ))}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1.5 text-[12.5px] text-muted">
                        <span>{t('donate.method')}</span>
                        <select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} className="input">
                          {(['wechat', 'alipay', 'paypal', 'other'] as const).map((value) => (
                            <option key={value} value={value}>
                              {t(`donate.method.${value}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-1.5 text-[12.5px] text-muted">
                        <span>{t('donate.reference')}</span>
                        <input value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} className="input" placeholder={t('donate.referencePh')} />
                      </label>
                    </div>
                  </>
                ) : null}

                <label className="block space-y-1.5 text-[12.5px] text-muted">
                  <span>{t('donate.name')}</span>
                  <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="input" placeholder={t('donate.namePh')} />
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-cream/40 px-3.5 py-2.5">
                  <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="mt-0.5 h-4 w-4 accent-ink" />
                  <span>
                    <span className="block text-[13px] text-ink">{t('donate.anonymousLabel')}</span>
                    <span className="block text-[11.5px] text-muted">{t('donate.anonymousHint')}</span>
                  </span>
                </label>

                <label className="block space-y-1.5 text-[12.5px] text-muted">
                  <span>{kind === 'message' ? t('donate.messageRequired') : t('donate.message')}</span>
                  <textarea
                    rows={3}
                    maxLength={300}
                    value={message}
                    required={kind === 'message'}
                    onChange={(e) => setMessage(e.target.value)}
                    className="input resize-y"
                    placeholder={t('donate.messagePh')}
                  />
                  <span className="block text-right text-[10.5px] text-muted/80">{message.length}/300</span>
                </label>

                {error ? <p className="rounded-xl border border-[#e7c9c1] bg-[#fbeeea] px-3 py-2 text-[12.5px] text-[#8a3b2a]">{error}</p> : null}
                {done ? <p className="rounded-xl border border-[#cfe1d4] bg-[#eef5ef] px-3 py-2 text-[12.5px] text-[#3f7d5a]">{done}</p> : null}

                <button type="submit" disabled={busy} className="btn-dark w-full py-3">
                  {kind === 'donation' ? <Heart className="h-4 w-4" aria-hidden /> : <MessageCircle className="h-4 w-4" aria-hidden />}
                  {busy ? t('donate.submitting') : t('donate.submit')}
                </button>
              </div>
            </form>
          </div>

          {/* Wall */}
          <section className="mt-5 rounded-2xl border border-line bg-paper p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-[24px] leading-none">{t('donate.wallTitle')}</h2>
              <button type="button" onClick={() => void load()} disabled={loadingWall} className="btn-light px-3.5 py-1.5 text-[12px]">
                <RefreshCw className={`h-3.5 w-3.5 ${loadingWall ? 'animate-spin' : ''}`} aria-hidden /> {t('donate.refresh')}
              </button>
            </div>
            {wallError ? <p className="mt-4 text-[12.5px] text-[#8a3b2a]">{wallError}</p> : null}
            {wall === null && !wallError ? (
              <div className="mt-5 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-soft/60" />
                ))}
              </div>
            ) : wall && wall.recent.length === 0 ? (
              <p className="mt-4 text-[13px] text-muted">{t('donate.wallEmpty')}</p>
            ) : (
              <ul className="mt-5 divide-y divide-line/70">
                {(wall?.recent ?? []).map((entry) => (
                  <li key={entry.id} className="flex gap-3 py-3.5">
                    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${entry.kind === 'donation' ? 'bg-[#fbe4dc] text-[#b4543f]' : 'bg-soft text-muted'}`}>
                      {entry.kind === 'donation' ? <Heart className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
                        <span className="font-medium">{entry.name || t('donate.anonymous')}</span>
                        <span className="text-muted">
                          {entry.kind === 'donation' && entry.amount && entry.currency
                            ? t('donate.donated', { amount: money(entry.amount, entry.currency) })
                            : t('donate.leftMessage')}
                        </span>
                        <span className="font-mono text-[10.5px] text-muted/70">#{entry.id}</span>
                      </p>
                      {entry.message ? <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink/90">{entry.message}</p> : null}
                      <p className="mt-1 text-[11px] text-muted">
                        {new Date(entry.at).toLocaleString(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="mt-4 text-[11.5px] leading-relaxed text-muted">{t('donate.note')}</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
