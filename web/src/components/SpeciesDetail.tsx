import { useMemo } from 'react';
import type { GapObservation, GapSpecies } from '@gap/shared';
import { Sparkline } from './Sparkline.js';
import { Icons } from './Icons.js';
import { haversineKm, heatColor, heatOf, relativeDay, sparkData } from '../gapDisplay.js';

interface Props {
  gap: GapSpecies;
  origin: { lat: number; lng: number };
  backDays: number;
  /** True while the species' full report set is still loading. */
  enriching: boolean;
  highlightedLoc: string | null;
  onBack: () => void;
  onHighlightLoc: (locId: string | null) => void;
  onFocusLoc: (lat: number, lng: number) => void;
}

interface LocRow extends GapObservation {
  km: number;
}

/**
 * The panel's species-focus screen: replaces the gap list when a species is
 * pinned. Shows the species header plus every recent reporting location, so the
 * user can scan where it's being seen and fly the map to each spot.
 */
export function SpeciesDetail({
  gap,
  origin,
  backDays,
  enriching,
  highlightedLoc,
  onBack,
  onHighlightLoc,
  onFocusLoc,
}: Props) {
  const heat = heatOf(gap);
  const color = heatColor(heat);

  // Most recent first, then nearest — the order a birder weighs "can I go see it".
  const locs = useMemo<LocRow[]>(() => {
    return gap.observations
      .map((o) => ({ ...o, km: Math.round(haversineKm(origin.lat, origin.lng, o.lat, o.lng) * 10) / 10 }))
      .sort((a, b) => (a.obsDt !== b.obsDt ? (a.obsDt < b.obsDt ? 1 : -1) : a.km - b.km));
  }, [gap.observations, origin.lat, origin.lng]);

  const count = locs.length;

  return (
    <div className="panel">
      <div className="panel-head detail-head">
        <button type="button" className="back-btn" onClick={onBack}>
          <Icons.arrowLeft size={15} /> All gaps
        </button>
        <div className="detail-title-row">
          <span className={`gap-dot ${heat === 'hot' ? 'hot' : ''}`} style={{ background: color }} aria-hidden="true" />
          <span className="detail-name">{gap.comName}</span>
          {gap.notable && <span className="badge-rare">Rare</span>}
        </div>
        <div className="detail-sci">{gap.sciName}</div>
        <div className="detail-summary">
          <div className="detail-meta">
            <span className="gap-day" style={{ color: heat === 'hot' ? color : undefined }}>
              {relativeDay(gap.lastObsDt)}
            </span>
            <span className="dot-sep">·</span>
            <span>
              {count} {count === 1 ? 'location' : 'locations'}
            </span>
            <span className="dot-sep">·</span>
            <span>{gap.nearestKm} km nearest</span>
          </div>
          <Sparkline data={sparkData(gap, backDays)} color={color} fill w={56} h={26} />
        </div>
        <a className="callout-link detail-link" href={gap.ebirdUrl} target="_blank" rel="noreferrer">
          View on eBird <Icons.arrow size={13} />
        </a>
      </div>

      <div className="panel-scroll">
        <div className="detail-section">
          {enriching ? 'Loading every recent report…' : `Reported at ${count} ${count === 1 ? 'spot' : 'spots'} nearby`}
        </div>
        <div className="loc-list" role="list">
          {locs.map((o, i) => {
            const on = highlightedLoc === o.locId;
            return (
              <div
                key={`${o.locId}-${i}`}
                role="listitem"
                className={`loc-row ${on ? 'on' : ''}`}
                onMouseEnter={() => onHighlightLoc(o.locId)}
                onMouseLeave={() => onHighlightLoc(null)}
                onClick={() => onFocusLoc(o.lat, o.lng)}
              >
                <span className="loc-dot" style={{ background: color }} aria-hidden="true" />
                <div className="loc-main">
                  <div className="loc-name">{o.locName}</div>
                  <div className="loc-meta">
                    <span className="loc-day">{relativeDay(o.obsDt)}</span>
                    <span className="dot-sep">·</span>
                    <span>{o.km} km</span>
                    {o.howMany != null && o.howMany > 0 && (
                      <>
                        <span className="dot-sep">·</span>
                        <span>
                          {o.howMany} {o.howMany === 1 ? 'bird' : 'birds'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Icons.crosshair size={15} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
