import type { GapSpecies } from '@gap/shared';

export type Heat = 'hot' | 'warm' | 'cool';

const DAY_MS = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "today", "yesterday", "3 days ago", "2 weeks ago" from an eBird obsDt. */
export function relativeDay(obsDt: string): string {
  const day = obsDt.slice(0, 10);
  const then = new Date(`${day}T00:00:00`);
  if (Number.isNaN(then.getTime())) return day;
  const diff = Math.round((startOfDay(new Date()) - startOfDay(then)) / DAY_MS);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return `${diff} days ago`;
  const weeks = Math.round(diff / 7);
  return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
}

/** Great-circle distance in km between two points (for per-location distances). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** True when the most recent report was today. */
export function isToday(g: GapSpecies): boolean {
  return relativeDay(g.lastObsDt) === 'today';
}

/** Warmer = easier to get (recent + many reports). Purely a visual cue. */
export function heatOf(g: GapSpecies): Heat {
  const then = new Date(`${g.lastObsDt.slice(0, 10)}T00:00:00`).getTime();
  const days = (Date.now() - then) / DAY_MS;
  if (days <= 3 && g.reportCount >= 3) return 'hot';
  if (days <= 7) return 'warm';
  return 'cool';
}

/** The CSS-variable colour for a heat level. */
export function heatColor(heat: Heat): string {
  return `var(--${heat})`;
}

/**
 * Reports-per-day series over the lookback window (oldest → newest), bucketed
 * from the species' observations. Drives the row/callout sparkline.
 */
export function sparkData(g: GapSpecies, backDays: number): number[] {
  const days = Math.max(2, Math.min(backDays, 30));
  const today = startOfDay(new Date());
  const buckets: number[] = new Array(days).fill(0);
  for (const o of g.observations) {
    const t = new Date(`${o.obsDt.slice(0, 10)}T00:00:00`).getTime();
    if (Number.isNaN(t)) continue;
    const offset = Math.round((today - startOfDay(new Date(t))) / DAY_MS);
    const idx = days - 1 - offset; // newest at the end
    if (idx >= 0 && idx < days) buckets[idx] = (buckets[idx] ?? 0) + 1;
  }
  // If observations didn't populate anything (sparse feeds), at least mark the
  // most recent day so the sparkline reads as "reported recently".
  const total = buckets.reduce((a, b) => a + b, 0);
  if (total === 0) buckets[days - 1] = 1;
  return buckets;
}
