import type { ThemeChoice } from '../hooks.js';
import { Icons } from './Icons.js';

interface Props {
  choice: ThemeChoice;
  onChange: (c: ThemeChoice) => void;
}

const OPTIONS: [ThemeChoice, (p: { size?: number }) => JSX.Element][] = [
  ['light', Icons.sun],
  ['system', Icons.monitor],
  ['dark', Icons.moon],
];

/** Segmented light / system / dark switch — top-right of the floating bar. */
export function ThemeSwitch({ choice, onChange }: Props) {
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map(([key, Icon]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={choice === key}
          aria-label={key}
          title={key}
          className={`theme-switch-btn ${choice === key ? 'on' : ''}`}
          onClick={() => onChange(key)}
        >
          <Icon size={15} />
        </button>
      ))}
    </div>
  );
}
