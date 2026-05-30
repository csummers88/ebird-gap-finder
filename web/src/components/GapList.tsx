import type { GapSpecies } from '@gap/shared';

interface Props {
  gaps: GapSpecies[];
  highlighted: string | null;
  onHighlight: (code: string | null) => void;
  onFocus: (g: GapSpecies) => void;
}

/** "today", "2 days ago", "3 weeks ago" from an eBird obsDt ("YYYY-MM-DD HH:mm"). */
function relativeDay(obsDt: string): string {
  const day = obsDt.slice(0, 10);
  const then = new Date(`${day}T00:00:00`);
  if (Number.isNaN(then.getTime())) return day;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today.getTime() - then.getTime()) / 86_400_000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return `${diff} days ago`;
  const weeks = Math.round(diff / 7);
  return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
}

/** Warmer = easier to get (recent + many reports). Purely a visual cue. */
function heatClass(g: GapSpecies): string {
  const day = g.lastObsDt.slice(0, 10);
  const then = new Date(`${day}T00:00:00`).getTime();
  const days = (Date.now() - then) / 86_400_000;
  if (days <= 3 && g.reportCount >= 3) return 'heat-hot';
  if (days <= 7) return 'heat-warm';
  return 'heat-cool';
}

export function GapList({ gaps, highlighted, onHighlight, onFocus }: Props) {
  return (
    <ul className="gap-list">
      {gaps.map((g) => (
        <li
          key={g.speciesCode}
          className={`gap-row ${highlighted === g.speciesCode ? 'highlighted' : ''}`}
          onMouseEnter={() => onHighlight(g.speciesCode)}
          onMouseLeave={() => onHighlight(null)}
          onClick={() => onFocus(g)}
        >
          <span className={`heat ${heatClass(g)}`} aria-hidden="true" />
          <div className="gap-main">
            <div className="gap-name-row">
              <span className="gap-name">{g.comName}</span>
              {g.notable && <span className="badge-rare">rare</span>}
            </div>
            <div className="gap-sci">{g.sciName}</div>
            <div className="gap-meta">
              <span>{relativeDay(g.lastObsDt)}</span>
              <span>·</span>
              <span>
                {g.reportCount} {g.reportCount === 1 ? 'report' : 'reports'}
              </span>
              <span>·</span>
              <span>
                {g.nearestKm} km — {g.nearestLocName}
              </span>
            </div>
          </div>
          <a
            className="gap-link"
            href={g.ebirdUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open the eBird species page"
          >
            ↗
          </a>
        </li>
      ))}
    </ul>
  );
}
