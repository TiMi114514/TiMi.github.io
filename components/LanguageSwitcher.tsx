'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { LOCALES, useI18n } from '@/lib/i18n';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = LOCALES.find((item) => item.code === locale) ?? LOCALES[2];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-paper/70 px-2.5 text-[12px] text-ink transition-colors hover:bg-white"
        aria-label={t('nav.language')}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t('nav.language')}
      >
        <Globe className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden lg:inline">{current.label}</span>
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label={t('nav.language')}
          className="absolute right-0 top-full z-50 mt-2 w-[168px] overflow-hidden rounded-xl border border-line bg-paper py-1 shadow-float"
        >
          {LOCALES.map((item) => (
            <li key={item.code}>
              <button
                type="button"
                role="option"
                aria-selected={item.code === locale}
                lang={item.code}
                onClick={() => {
                  setLocale(item.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-[12.5px] transition-colors hover:bg-cream ${
                  item.code === locale ? 'text-ink' : 'text-muted'
                }`}
              >
                {item.label}
                {item.code === locale ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
