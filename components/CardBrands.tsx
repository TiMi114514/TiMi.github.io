/** Small, dependency-free card brand marks for the donate page. */
export function CardBrands({ className = '' }: { className?: string }) {
  const chip = 'inline-flex h-6 items-center justify-center rounded-[5px] border border-line bg-white px-1.5';
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`} aria-label="Visa, Mastercard, UnionPay, American Express">
      <span className={chip} title="Visa">
        <span className="font-sans text-[11px] font-extrabold italic tracking-tight text-[#1a1f71]">VISA</span>
      </span>
      <span className={chip} title="Mastercard">
        <svg viewBox="0 0 32 20" className="h-4 w-6" aria-hidden>
          <circle cx="12" cy="10" r="7" fill="#eb001b" />
          <circle cx="20" cy="10" r="7" fill="#f79e1b" />
          <path d="M16 4.3a7 7 0 0 1 0 11.4 7 7 0 0 1 0-11.4Z" fill="#ff5f00" />
        </svg>
      </span>
      <span className={chip} title="UnionPay">
        <svg viewBox="0 0 36 20" className="h-4 w-7" aria-hidden>
          <path d="M5 2h9l-4 16H1Z" fill="#e21836" />
          <path d="M13 2h9l-4 16H9Z" fill="#00447c" />
          <path d="M21 2h9l-4 16h-9Z" fill="#007b84" />
          <text x="18" y="13.5" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">UnionPay</text>
        </svg>
      </span>
      <span className={`${chip} bg-[#2e77bc]`} title="American Express">
        <span className="font-sans text-[9px] font-bold tracking-tight text-white">AMEX</span>
      </span>
    </span>
  );
}
