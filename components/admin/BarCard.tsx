'use client';

export type BarRow = { label: string; value: number };

export function BarCard({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: BarRow[];
  emptyLabel: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <section className="rounded-xl border border-[#e4e4e7] bg-white">
      <div className="flex items-center justify-between px-5 pt-4">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <span className="select-none text-[16px] leading-none tracking-[0.1em] text-[#a1a1aa]">···</span>
      </div>

      <div className="space-y-2 p-4">
        {rows.length === 0 ? (
          <p className="px-1 py-8 text-center text-[12px] text-[#a1a1aa]">{emptyLabel}</p>
        ) : (
          rows.map((row) => (
            <div key={row.label} className="flex items-center gap-2">
              <div className="relative h-8 min-w-0 flex-1 overflow-hidden rounded-md bg-[#f4f4f5]">
                <div
                  className="absolute inset-y-0 left-0 rounded-md bg-[#ffb48a] transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.max(16, (row.value / max) * 100)}%` }}
                />
                <span className="absolute inset-y-0 left-3 flex max-w-[calc(100%-12px)] items-center truncate text-[12.5px] text-[#3f3f46]">
                  {row.label}
                </span>
              </div>
              <span className="w-7 shrink-0 text-right text-[12px] text-[#52525b]">{row.value}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
