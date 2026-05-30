import { useId } from 'react';

interface Props {
  /** Reports per day over the lookback window (oldest → newest). */
  data: number[];
  /** Stroke/fill colour — a CSS colour or `var(--…)` reference. */
  color: string;
  w?: number;
  h?: number;
  fill?: boolean;
  strokeW?: number;
  dot?: boolean;
}

/** Reports-per-day "gettability" sparkline — ported from the design's shared primitive. */
export function Sparkline({ data, color, w = 56, h = 26, fill = false, strokeW = 1.6, dot = true }: Props) {
  const gid = useId().replace(/:/g, '');
  if (data.length < 2) {
    return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }} />;
  }
  const max = Math.max(1, ...data);
  const n = data.length;
  const pts = data.map((v, i) => {
    const x = (i / (n - 1)) * w;
    const y = h - (v / max) * (h - 3) - 1.5;
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = pts[pts.length - 1]!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
      {fill && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
        </>
      )}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeW} strokeLinejoin="round" strokeLinecap="round" />
      {dot && <circle cx={last[0]} cy={last[1]} r={2.4} fill={color} />}
    </svg>
  );
}
