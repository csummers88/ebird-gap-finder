import { useEffect, useRef } from 'react';
import type { GapSpecies } from '@gap/shared';
import { Sparkline } from './Sparkline.js';
import { heatColor, heatOf, relativeDay, sparkData } from '../gapDisplay.js';

interface Props {
  gaps: GapSpecies[];
  backDays: number;
  highlighted: string | null;
  selected: string | null;
  onHighlight: (code: string | null) => void;
  onFocus: (g: GapSpecies) => void;
}

/** The scrollable warm field-guide species rows inside the floating panel. */
export function GapList({ gaps, backDays, highlighted, selected, onHighlight, onFocus }: Props) {
  const rows = useRef<Map<string, HTMLDivElement>>(new Map());

  // When a species is picked on the map, reveal its row in the (possibly scrolled) list.
  useEffect(() => {
    if (!selected) return;
    rows.current.get(selected)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  return (
    <div className="gap-list" role="list">
      {gaps.map((g) => {
        const heat = heatOf(g);
        const color = heatColor(heat);
        const on = (highlighted ?? selected) === g.speciesCode;
        return (
          <div
            key={g.speciesCode}
            ref={(el) => {
              if (el) rows.current.set(g.speciesCode, el);
              else rows.current.delete(g.speciesCode);
            }}
            role="listitem"
            className={`gap-row ${on ? 'on' : ''}`}
            onMouseEnter={() => onHighlight(g.speciesCode)}
            onMouseLeave={() => onHighlight(null)}
            onClick={() => onFocus(g)}
          >
            <span
              className={`gap-dot ${heat === 'hot' ? 'hot' : ''}`}
              style={{ background: color }}
              aria-hidden="true"
            />
            <div className="gap-main">
              <div className="gap-name-row">
                <span className="gap-name">{g.comName}</span>
                {g.notable && <span className="badge-rare">Rare</span>}
              </div>
              <div className="gap-sci">{g.sciName}</div>
              <div className="gap-meta">
                <span className="gap-day" style={{ color: heat === 'hot' ? color : undefined }}>
                  {relativeDay(g.lastObsDt)}
                </span>
                <span className="dot-sep">·</span>
                <span>{g.reportCount} reports</span>
                <span className="dot-sep">·</span>
                <span>{g.nearestKm} km</span>
              </div>
            </div>
            <Sparkline data={sparkData(g, backDays)} color={color} fill w={56} h={26} />
          </div>
        );
      })}
    </div>
  );
}
