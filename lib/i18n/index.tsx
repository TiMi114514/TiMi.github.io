'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en, { type MessageKey, type Messages } from './en';
import zhCN from './zh-CN';
import zhTW from './zh-TW';
import ru from './ru';
import fr from './fr';
import de from './de';
import it from './it';
import ja from './ja';

export const LOCALES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'ja', label: '日本語' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];

const DICTIONARIES: Record<Locale, Messages> = {
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ru,
  fr,
  de,
  it,
  ja,
};

const STORAGE_KEY = 'alevel-hub.locale';

export type Vars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
};

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALES.some((item) => item.code === value);
}

/** Map a browser language tag (zh-HK, de-AT, pt-BR …) onto a supported locale. */
export function matchLocale(tag: string | undefined | null): Locale | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();
  if (lower.startsWith('zh')) {
    return /hant|tw|hk|mo/.test(lower) ? 'zh-TW' : 'zh-CN';
  }
  const base = lower.split('-')[0];
  return isLocale(base) ? base : null;
}

function detectLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of candidates) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return 'en';
}

export function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

function makeT(locale: Locale): Translate {
  const dict = DICTIONARIES[locale] ?? en;
  return (key, vars) => format(dict[key] ?? en[key] ?? key, vars);
}

const I18nContext = createContext<I18nValue>({
  locale: 'en',
  setLocale: () => undefined,
  t: makeT('en'),
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale, t: makeT(locale) }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

export function useT(): Translate {
  return useContext(I18nContext).t;
}

export type { MessageKey };
