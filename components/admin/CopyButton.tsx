'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyButton({
  text,
  label = 'Copy',
  className = '',
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`inline-flex items-center gap-1 rounded-md border border-[#e4e4e7] bg-white px-2 py-1 text-[11px] text-[#52525b] transition-colors hover:bg-[#fafafa] ${className}`}
    >
      {copied ? <Check className="h-3 w-3 text-[#16a34a]" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : label}
    </button>
  );
}
