import type { LifeListSummary } from '@gap/shared';
import { Icons } from './Icons.js';

interface Props {
  summary: LifeListSummary | null;
  gapsToday: number;
  onClick: () => void;
}

/** Bottom-right glass chip: life-list size + today's gap count. Click to manage. */
export function LifeListChip({ summary, gapsToday, onClick }: Props) {
  return (
    <button type="button" className="lifelist-chip" onClick={onClick} title="Manage your life list">
      <span className="lifelist-check">
        <Icons.check size={16} />
      </span>
      <Stat value={summary ? summary.speciesCount.toLocaleString() : '—'} label="life list" />
      <Stat value={String(gapsToday)} label="gaps today" accent />
    </button>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <span className={`lifelist-stat ${accent ? 'accent' : ''}`}>
      <span className="lifelist-value">{value}</span>
      <span className="lifelist-label">{label}</span>
    </span>
  );
}
