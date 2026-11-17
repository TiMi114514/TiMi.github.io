'use client';

import { useRef, type CSSProperties, type PointerEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';

/**
 * Paper-stack illustration. The cards follow the pointer with a cheap
 * transform-only parallax (no timers, no network, no layout work).
 */
export function HeroPapers() {
  const stage = useRef<HTMLDivElement | null>(null);
  const frame = useRef<number | null>(null);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse') return;
    const element = stage.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const x = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
    const y = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));

    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      element.style.setProperty('--mx', x.toFixed(3));
      element.style.setProperty('--my', y.toFixed(3));
    });
  }

  function reset() {
    const element = stage.current;
    if (!element) return;
    element.style.setProperty('--mx', '0');
    element.style.setProperty('--my', '0');
  }

  return (
    <div
      ref={stage}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      className="hero-stage relative hidden h-[420px] select-none lg:block"
      aria-hidden
    >
      <div
        className="hero-card absolute left-0 top-28 w-[238px] rounded-xl border border-line bg-white/70 p-5 shadow-card"
        style={{ '--rot': '-9deg', '--depth': '18' } as CSSProperties}
      >
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Mathematics</p>
        <div className="mt-6 space-y-2">
          <div className="h-1.5 w-4/5 rounded-full bg-line/80" />
          <div className="h-1.5 w-3/5 rounded-full bg-line/80" />
          <div className="h-1.5 w-2/3 rounded-full bg-line/80" />
        </div>
        <p className="mt-10 text-[11px] text-muted">Paper 1 · 2024</p>
      </div>

      <div
        className="hero-card absolute left-[112px] top-4 w-[248px] rounded-xl border border-line bg-white/85 p-5 shadow-card"
        style={{ '--rot': '-3deg', '--depth': '26' } as CSSProperties}
      >
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Chemistry</p>
        <div className="mt-6 space-y-2">
          <div className="h-1.5 w-3/4 rounded-full bg-line/80" />
          <div className="h-1.5 w-1/2 rounded-full bg-line/80" />
          <div className="h-1.5 w-2/3 rounded-full bg-line/80" />
          <div className="h-1.5 w-2/5 rounded-full bg-line/80" />
        </div>
        <p className="mt-10 text-[11px] text-muted">Paper 3 · 2025</p>
      </div>

      <div
        className="hero-card absolute right-0 top-20 w-[272px] rounded-xl border border-line bg-white p-5 shadow-float"
        style={{ '--rot': '7deg', '--depth': '34' } as CSSProperties}
      >
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Physics</p>
        <div className="mt-6 space-y-2">
          <div className="h-1.5 w-5/6 rounded-full bg-line/90" />
          <div className="h-1.5 w-3/5 rounded-full bg-line/90" />
          <div className="h-1.5 w-4/5 rounded-full bg-line/90" />
          <div className="h-1.5 w-1/2 rounded-full bg-line/90" />
        </div>
        <p className="mt-10 text-[11px] text-muted">Paper 2 · 2024</p>
      </div>

      <div
        className="hero-card absolute bottom-6 right-2 flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 shadow-card"
        style={{ '--rot': '0deg', '--depth': '10' } as CSSProperties}
      >
        <CheckCircle2 className="h-4 w-4 text-[#3f7d5a]" />
        <span className="text-[12px] text-muted">updated at 2026/11/17</span>
      </div>
    </div>
  );
}
