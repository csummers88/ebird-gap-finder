import type { GapSource, GapSpecies, Scope } from '@gap/shared';
import { GapList } from './GapList.js';

export type Segment = 'recent' | 'rarities' | 'year';

export function segmentOf(source: GapSource, scope: Scope): Segment {
  if (scope === 'year') return 'year';
  if (source === 'notable') return 'rarities';
  return 'recent';
}

const SEGMENTS: { key: Segment; label: string; source: GapSource; scope: Scope }[] = [
  { key: 'recent', label: 'All recent', source: 'recent', scope: 'life' },
  { key: 'rarities', label: 'Rarities', source: 'notable', scope: 'life' },
  { key: 'year', label: 'This year', source: 'recent', scope: 'year' },
];

interface Props {
  gaps: GapSpecies[];
  nearbyCount: number;
  backDays: number;
  loading: boolean;
  hasLifeList: boolean;
  segment: Segment;
  highlighted: string | null;
  onSegment: (source: GapSource, scope: Scope) => void;
  onHighlight: (code: string | null) => void;
  onFocus: (g: GapSpecies) => void;
}

/** The left floating glass panel: header, segmented filter, and the gap list. */
export function GapPanel(props: Props) {
  const { gaps, nearbyCount, backDays, loading, hasLifeList, segment, highlighted } = props;

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-count">
          {loading ? 'Finding gaps…' : `${gaps.length} ${gaps.length === 1 ? 'gap' : 'gaps'} nearby`}
        </div>
        <div className="panel-sub">
          {hasLifeList
            ? `of ${nearbyCount} species reported · not yet on your life list`
            : 'upload your life list to surface what you still need'}
        </div>
        <div className="segments" role="tablist">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={segment === s.key}
              className={`segment ${segment === s.key ? 'on' : ''}`}
              onClick={() => props.onSegment(s.source, s.scope)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-scroll">
        {loading && <div className="panel-empty">Looking for recent reports nearby…</div>}

        {!loading && hasLifeList && gaps.length === 0 && (
          <div className="panel-empty">
            <p className="panel-empty-title">No new species in this window.</p>
            <p className="panel-empty-hint">
              That’s normal close to home — try a larger radius, a longer lookback, or switch the
              baseline to “This year”.
            </p>
          </div>
        )}

        {!loading && !hasLifeList && (
          <div className="panel-empty">
            <p className="panel-empty-hint">
              Once your life list is loaded, the species being reported nearby that you haven’t
              logged will show up here.
            </p>
          </div>
        )}

        {!loading && gaps.length > 0 && (
          <GapList
            gaps={gaps}
            backDays={backDays}
            highlighted={highlighted}
            onHighlight={props.onHighlight}
            onFocus={props.onFocus}
          />
        )}
      </div>
    </div>
  );
}
