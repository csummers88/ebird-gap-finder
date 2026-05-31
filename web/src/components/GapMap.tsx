import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { MapContainer, TileLayer, CircleMarker, Circle, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { GapSpecies, RankedHotspot } from '@gap/shared';
import type { ViewMode } from './GapPanel.js';
import type { ThemeMode } from '../hooks.js';
import { Sparkline } from './Sparkline.js';
import { Icons } from './Icons.js';
import { heatColor, heatOf, relativeDay, sparkData } from '../gapDisplay.js';

interface Props {
  lat: number;
  lng: number;
  distKm: number;
  backDays: number;
  gaps: GapSpecies[];
  mode: ThemeMode;
  highlighted: string | null;
  onHighlight: (code: string | null) => void;
  selected: string | null;
  onSelect: (code: string | null) => void;
  onPickLocation: (lat: number, lng: number) => void;
  focusCode: string | null;
  // Trip planner
  viewMode: ViewMode;
  hotspots: RankedHotspot[];
  highlightedHotspot: string | null;
  onHighlightHotspot: (locId: string | null) => void;
  focusHotspot: string | null;
}

const MARKERS = {
  light: { regular: '#0a6b4a', notable: '#c64a2c', stroke: '#fbf7ee', search: '#0a6b4a', ring: '#0a6b4a', hotspot: '#d08a2c' },
  dark: { regular: '#46b88c', notable: '#e08a5e', stroke: '#16130d', search: '#46b88c', ring: '#46b88c', hotspot: '#e0ab5e' },
} as const;

/** Recenters the map when the search point moves (geolocation, typing, etc.). */
function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

/** Click anywhere on the map to move the search point. */
function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(round(e.latlng.lat), round(e.latlng.lng));
    },
  });
  return null;
}

/** When a list row is clicked, pan to that species' nearest report. */
function FlyToFocus({ gaps, focusCode }: { gaps: GapSpecies[]; focusCode: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focusCode) return;
    const g = gaps.find((x) => x.speciesCode === focusCode);
    if (g) map.flyTo([g.nearestLat, g.nearestLng], Math.max(map.getZoom(), 12), { duration: 0.6 });
  }, [focusCode, gaps, map]);
  return null;
}

/**
 * Field-guide callout anchored to a species' nearest marker. Shows the hovered
 * species, or — when nothing is hovered — the species pinned by a marker click.
 * A pinned callout stays put and is interactive so the eBird link is reachable.
 * Rendered via portal into the Leaflet container so it tracks pan/zoom.
 */
function HighlightCallout({
  gaps,
  highlighted,
  selected,
  backDays,
  onClose,
}: {
  gaps: GapSpecies[];
  highlighted: string | null;
  selected: string | null;
  backDays: number;
  onClose: () => void;
}) {
  const map = useMap();
  const [, force] = useState(0);
  useMapEvents({
    move: () => force((n) => n + 1),
    zoom: () => force((n) => n + 1),
    resize: () => force((n) => n + 1),
  });

  const code = highlighted ?? selected;
  const pinned = !highlighted && !!selected;
  const g = code ? gaps.find((x) => x.speciesCode === code) : undefined;
  if (!g) return null;

  const pt = map.latLngToContainerPoint([g.nearestLat, g.nearestLng]);
  const size = map.getSize();
  const right = pt.x > size.x * 0.55;
  const heat = heatOf(g);
  const color = heatColor(heat);

  return createPortal(
    <div
      ref={(el) => {
        if (el) L.DomEvent.disableClickPropagation(el);
      }}
      className={`callout ${right ? 'left' : 'right'} ${pinned ? 'pinned' : ''}`}
      style={{ left: pt.x, top: pt.y }}
    >
      <div className="callout-head">
        <span className="callout-dot" style={{ background: color }} />
        <span className="callout-name">{g.comName}</span>
        {g.notable && <span className="badge-rare">Rare</span>}
        {pinned && (
          <button type="button" className="callout-close" onClick={onClose} aria-label="Close">
            <Icons.close size={14} />
          </button>
        )}
      </div>
      <div className="callout-sci">{g.sciName}</div>
      <div className="callout-body">
        <div>
          <div className="callout-line">
            <b style={{ color: heat === 'hot' ? color : undefined }}>{relativeDay(g.lastObsDt)}</b> · {g.reportCount} reports
          </div>
          <div className="callout-line muted">
            {g.nearestKm} km — {g.nearestLocName}
          </div>
        </div>
        <Sparkline data={sparkData(g, backDays)} color={color} fill w={56} h={26} />
      </div>
      <a className="callout-link" href={g.ebirdUrl} target="_blank" rel="noreferrer">
        View on eBird <Icons.arrow size={13} />
      </a>
    </div>,
    map.getContainer(),
  );
}

/** When a planner row is clicked, pan to that hotspot. */
function FlyToHotspot({ hotspots, focusHotspot }: { hotspots: RankedHotspot[]; focusHotspot: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focusHotspot) return;
    const h = hotspots.find((x) => x.locId === focusHotspot);
    if (h) map.flyTo([h.lat, h.lng], Math.max(map.getZoom(), 12), { duration: 0.6 });
  }, [focusHotspot, hotspots, map]);
  return null;
}

/** Field-guide callout anchored to the highlighted hotspot marker (mirrors HighlightCallout). */
function HotspotCallout({ hotspots, highlighted }: { hotspots: RankedHotspot[]; highlighted: string | null }) {
  const map = useMap();
  const [, force] = useState(0);
  useMapEvents({
    move: () => force((n) => n + 1),
    zoom: () => force((n) => n + 1),
    resize: () => force((n) => n + 1),
  });

  const h = highlighted ? hotspots.find((x) => x.locId === highlighted) : undefined;
  if (!h) return null;

  const pt = map.latLngToContainerPoint([h.lat, h.lng]);
  const size = map.getSize();
  const right = pt.x > size.x * 0.55;
  const top = h.species.slice(0, 5);

  return createPortal(
    <div className={`callout ${right ? 'left' : 'right'}`} style={{ left: pt.x, top: pt.y }}>
      <div className="callout-head">
        <span className="callout-dot" style={{ background: 'var(--warm)' }} />
        <span className="callout-name">{h.locName}</span>
      </div>
      <div className="callout-sci">
        {h.unseenCount} new {h.unseenCount === 1 ? 'bird' : 'birds'} · {h.distanceKm} km away
      </div>
      <div className="callout-hotspot-species">
        {top.map((s) => (
          <div key={s.speciesCode} className="callout-line">
            {s.comName}
          </div>
        ))}
        {h.unseenCount > top.length && (
          <div className="callout-line muted">+{h.unseenCount - top.length} more</div>
        )}
      </div>
      <a className="callout-link" href={h.ebirdUrl} target="_blank" rel="noreferrer">
        View hotspot on eBird <Icons.arrow size={13} />
      </a>
    </div>,
    map.getContainer(),
  );
}

export function GapMap(props: Props) {
  const { lat, lng, distKm, backDays, gaps, mode, highlighted, viewMode, hotspots } = props;
  const c = MARKERS[mode];
  const planner = viewMode === 'planner';
  const maxCount = planner ? Math.max(1, ...hotspots.map((h) => h.unseenCount)) : 1;

  return (
    <MapContainer center={[lat, lng]} zoom={11} className="map" scrollWheelZoom zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter lat={lat} lng={lng} />
      <ClickToPick onPick={props.onPickLocation} />
      <FlyToFocus gaps={gaps} focusCode={props.focusCode} />
      <FlyToHotspot hotspots={hotspots} focusHotspot={props.focusHotspot} />

      {/* Search point + radius (coords are eBird-rounded; treat as approximate). */}
      <Circle center={[lat, lng]} radius={distKm * 1000} pathOptions={{ color: c.ring, weight: 1.4, fillColor: c.ring, fillOpacity: 0.06 }} />
      <CircleMarker
        center={[lat, lng]}
        radius={7}
        pathOptions={{ color: c.stroke, weight: 2.5, fillColor: c.search, fillOpacity: 1 }}
      />

      {!planner &&
        gaps.flatMap((g) =>
          g.observations.map((o, i) => {
            const on = highlighted === g.speciesCode || props.selected === g.speciesCode;
            const fill = g.notable ? c.notable : c.regular;
            return (
              <CircleMarker
                key={`${g.speciesCode}-${o.locId}-${i}`}
                center={[o.lat, o.lng]}
                radius={on ? 8 : 5}
                pathOptions={{
                  color: c.stroke,
                  weight: on ? 2.5 : 2,
                  fillColor: fill,
                  fillOpacity: on ? 1 : 0.85,
                }}
                eventHandlers={{
                  mouseover: () => props.onHighlight(g.speciesCode),
                  mouseout: () => props.onHighlight(null),
                  // Pin this species: keep the callout open + reveal it in the list,
                  // and don't let the click fall through to the map (which would relocate).
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    props.onSelect(g.speciesCode);
                  },
                }}
              />
            );
          }),
        )}

      {planner &&
        hotspots.map((h) => {
          const on = props.highlightedHotspot === h.locId;
          // Scale marker radius 7→16 by unseen-species count relative to the top hotspot.
          const radius = 7 + Math.round((h.unseenCount / maxCount) * 9);
          return (
            <CircleMarker
              key={h.locId}
              center={[h.lat, h.lng]}
              radius={on ? radius + 2 : radius}
              pathOptions={{
                color: c.stroke,
                weight: on ? 2.5 : 2,
                fillColor: c.hotspot,
                fillOpacity: on ? 1 : 0.82,
              }}
              eventHandlers={{
                mouseover: () => props.onHighlightHotspot(h.locId),
                mouseout: () => props.onHighlightHotspot(null),
                click: () => props.onHighlightHotspot(h.locId),
              }}
            >
              <Tooltip direction="top" offset={[0, -radius]} permanent className="hotspot-tip">
                {h.unseenCount}
              </Tooltip>
            </CircleMarker>
          );
        })}

      {!planner && (
        <HighlightCallout
          gaps={gaps}
          highlighted={highlighted}
          selected={props.selected}
          backDays={backDays}
          onClose={() => props.onSelect(null)}
        />
      )}
      {planner && <HotspotCallout hotspots={hotspots} highlighted={props.highlightedHotspot} />}
    </MapContainer>
  );
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
