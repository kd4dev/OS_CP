import React from 'react';

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
}

export function Sparkline({ data, color = 'var(--info)', height = 28 }: SparklineProps) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;
  const width = 100;
  const padding = 2;

  // Build SVG path
  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(' L ')}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full overflow-visible shrink-0"
      style={{ height: `${height}px` }}
      aria-hidden="true"
    >
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
