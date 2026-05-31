import type { GapSource, GapSpecies, RankedHotspot, Scope } from '@gap/shared';
import { GapList } from './GapList.js';
import { TripPlannerList } from './TripPlannerList.js';

export type ViewMode = 'gaps' | 'planner';
export type Segment = 'recent' | 'rarities' | 'year' | 'planner';

export function segmentOf(source: GapSource, scope: Scope): Segment {
  if (scope === 'year') return 'year';
  if (source === 'notable') return 'rarities';
  return 'recent';
}

const SEGMENTS: { key: Segment; label: string; mode: ViewMode; source: GapSource; scope: Scope }[] = [
  { key: 'recent', label: 'All recent', mode: 'gaps', source: 'recent', scope: 'life' },
  { key: 'rarities', label: 'Rarities', mode: 'gaps', source: 'notable', scope: 'life' },
  { key: 'year', label: 'This year', mode: 'gaps', source: 'recent', scope: 'year' },
  { key: 'planner', label: 'Trip planner', mode: 'planner', source: 'recent', scope: 'life' },
];

interface Props {
  viewMode: ViewMode;
  gaps: GapSpecies[];
  nearbyCount: number;
  backDays: number;
  loading: boolean;
  hasLifeList: boolean;
  segment: Segment;
  highlighted: string | null;
  selected: string | null;
  // Trip planner
  hotspots: RankedHotspot[];
  unattributed: number;
  highlightedHotspot: string | null;
  onSelectSegment: (mode: ViewMode, source: GapSource, scope: Scope) => void;
  onHighlight: (code: string | null) => void;
  onFocus: (g: GapSpecies) => void;
  onHighlightHotspot: (locId: string | null) => void;
  onFocusHotspot: (h: RankedHotspot) => void;
}

/** The left floating glass panel: header, segmented filter, and the gap list / planner. */
export function GapPanel(props: Props) {
  const { viewMode, gaps, nearbyCount, backDays, loading, hasLifeList, segment, highlighted, selected } = props;
  const planner = viewMode === 'planner';

  const headCount = planner
    ? loading
      ? 'Planning a trip…'
      : `${props.hotspots.length} ${props.hotspots.length === 1 ? 'hotspot' : 'hotspots'} nearby`
    : loading
      ? 'Finding gaps…'
      : `${gaps.length} ${gaps.length === 1 ? 'gap' : 'gaps'} nearby`;

  const headSub = planner
    ? hasLifeList
      ? 'ranked by how many new birds you could add'
      : 'upload your life list to plan a trip'
    : hasLifeList
      ? `of ${nearbyCount} species reported · not yet on your life list`
      : 'upload your life list to surface what you still need';

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-count">{headCount}</div>
        <div className="panel-sub">{headSub}</div>
        <div className="segments" role="tablist">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={segment === s.key}
              className={`segment ${segment === s.key ? 'on' : ''}`}
              onClick={() => props.onSelectSegment(s.mode, s.source, s.scope)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-scroll">
        {loading && (
          <div className="panel-empty">
            {planner ? 'Ranking nearby hotspots…' : 'Looking for recent reports nearby…'}
          </div>
        )}

        {!loading && !hasLifeList && (
          <div className="panel-empty">
            <p className="panel-empty-hint">
              {planner
                ? 'Once your life list is loaded, the best nearby hotspots for adding new birds will show up here.'
                : 'Once your life list is loaded, the species being reported nearby that you haven’t logged will show up here.'}
            </p>
          </div>
        )}

        {/* ---- Trip planner mode ---- */}
        {!loading && hasLifeList && planner && props.hotspots.length === 0 && (
          <div className="panel-empty">
            <p className="panel-empty-title">No hotspots with new birds nearby.</p>
            <p className="panel-empty-hint">
              Try a larger radius, a longer lookback, or switch the baseline to “This year”.
            </p>
          </div>
        )}

        {!loading && hasLifeList && planner && props.hotspots.length > 0 && (
          <TripPlannerList
            hotspots={props.hotspots}
            unattributed={props.unattributed}
            highlighted={props.highlightedHotspot}
            onHighlight={props.onHighlightHotspot}
            onFocus={props.onFocusHotspot}
          />
        )}

        {/* ---- Gap list mode ---- */}
        {!loading && hasLifeList && !planner && gaps.length === 0 && (
          <div className="panel-empty">
            <p className="panel-empty-title">No new species in this window.</p>
            <p className="panel-empty-hint">
              That’s normal close to home — try a larger radius, a longer lookback, or switch the
              baseline to “This year”.
            </p>
          </div>
        )}

        {!loading && hasLifeList && !planner && gaps.length > 0 && (
          <GapList
            gaps={gaps}
            backDays={backDays}
            highlighted={highlighted}
            selected={selected}
            onHighlight={props.onHighlight}
            onFocus={props.onFocus}
          />
        )}
      </div>
    </div>
  );
}
