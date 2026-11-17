'use client';

import { formatDayLabel } from '@/lib/analytics';
import type { AnalyticsSeriesPoint } from '@/lib/analytics';

export function TrafficChart({
  series,
  label = 'Visits over time',
}: {
  series: AnalyticsSeriesPoint[];
  label?: string;
}) {
  const width = 900;
  const height = 250;
  const padX = 8;
  const padTop = 12;
  const padBottom = 30;

  const points = series.length > 0 ? series : [{ date: '', visits: 0 }];
  const max = Math.max(1, ...points.map((point) => point.visits));
  const innerWidth = width - padX * 2;
  const innerHeight = height - padTop - padBottom;

  const x = (index: number) => {
    if (points.length <= 1) return padX + innerWidth / 2;
    return padX + (index / (points.length - 1)) * innerWidth;
  };
  const y = (visits: number) => padTop + (1 - visits / max) * innerHeight;

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point.visits)}`).join(' ');
  const area = `${line} L ${x(points.length - 1)} ${height - padBottom} L ${x(0)} ${height - padBottom} Z`;

  const labelIndexes = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])).filter(
    (index) => index >= 0 && index < points.length,
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-[240px] w-full"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id="traffic-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {[0, 1, 2, 3, 4].map((tick) => {
        const tickY = padTop + (tick / 4) * innerHeight;
        return (
          <line
            key={tick}
            x1={padX}
            x2={width - padX}
            y1={tickY}
            y2={tickY}
            stroke="#e4e4e7"
            strokeWidth="1"
          />
        );
      })}

      <path d={area} fill="url(#traffic-fill)" />
      <path d={line} fill="none" stroke="#f97316" strokeWidth="2.2" strokeLinejoin="round" />

      {points.map((point, index) =>
        point.visits > 0 ? (
          <circle key={`${point.date}-${index}`} cx={x(index)} cy={y(point.visits)} r="2.5" fill="#f97316" />
        ) : null,
      )}

      {labelIndexes.map((index) => (
        <text
          key={`label-${index}`}
          x={x(index)}
          y={height - 8}
          textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
          fontSize="11"
          fill="#a1a1aa"
        >
          {points[index]?.date ? formatDayLabel(points[index].date) : ''}
        </text>
      ))}
    </svg>
  );
}
