import { useState } from 'react';
import type { RankedHotspot } from '@gap/shared';
import { Icons } from './Icons.js';
import { relativeDay } from '../gapDisplay.js';

interface Props {
  hotspots: RankedHotspot[];
  unattributed: number;
  highlighted: string | null;
  onHighlight: (locId: string | null) => void;
  onFocus: (h: RankedHotspot) => void;
}

/** Ranked hotspots in the planner: "go here to add N new birds", expandable to the species. */
export function TripPlannerList({ hotspots, unattributed, highlighted, onHighlight, onFocus }: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(hotspots[0] ? [hotspots[0].locId] : []));

  function toggle(locId: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(locId)) next.delete(locId);
      else next.add(locId);
      return next;
    });
  }

  return (
    <div className="hotspot-list" role="list">
      {hotspots.map((h, i) => {
        const on = highlighted === h.locId;
        const expanded = open.has(h.locId);
        return (
          <div key={h.locId} role="listitem" className={`hotspot-row ${on ? 'on' : ''}`}>
            <div
              className="hotspot-head"
              onMouseEnter={() => onHighlight(h.locId)}
              onMouseLeave={() => onHighlight(null)}
              onClick={() => {
                onFocus(h);
                toggle(h.locId);
              }}
            >
              <span className="hotspot-rank" aria-hidden="true">
                {i + 1}
              </span>
              <div className="hotspot-main">
                <div className="hotspot-name">{h.locName}</div>
                <div className="hotspot-meta">
                  <span className="hotspot-count">
                    {h.unseenCount} new {h.unseenCount === 1 ? 'bird' : 'birds'}
                  </span>
                  <span className="dot-sep">·</span>
                  <span>{h.distanceKm} km away</span>
                </div>
              </div>
              <span className={`hotspot-chevron ${expanded ? 'open' : ''}`} aria-hidden="true">
                <Icons.chevron size={16} />
              </span>
            </div>

            {expanded && (
              <ul className="hotspot-species">
                {h.species.map((s) => (
                  <li key={s.speciesCode} className="hotspot-species-row">
                    <div className="hotspot-species-main">
                      <span className="hotspot-species-name">{s.comName}</span>
                      <span className="hotspot-species-sci">{s.sciName}</span>
                    </div>
                    <span className="hotspot-species-day">{relativeDay(s.lastObsDt)}</span>
                    <a
                      className="hotspot-species-link"
                      href={s.ebirdUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`${s.comName} on eBird`}
                    >
                      <Icons.arrow size={13} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {unattributed > 0 && (
        <p className="hotspot-footnote">
          {unattributed} more unseen {unattributed === 1 ? 'species was' : 'species were'} reported nearby
          but not at a listed hotspot — they’re in the gap list.
        </p>
      )}
    </div>
  );
}
