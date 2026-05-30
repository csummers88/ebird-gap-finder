import { useCallback, useEffect, useRef, useState } from 'react';

/** Returns `value` after it has stayed unchanged for `delayMs` — for sliders/inputs. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export type ThemeChoice = 'light' | 'system' | 'dark';
export type ThemeMode = 'light' | 'dark';

/**
 * Light / system / dark theme, persisted to localStorage. `system` actually
 * resolves the OS preference (and tracks live changes). The resolved `mode` is
 * written to `<html data-theme>` so the CSS variables in styles.css can switch.
 */
export function useTheme(): { choice: ThemeChoice; mode: ThemeMode; setChoice: (c: ThemeChoice) => void } {
  const [choice, setChoiceState] = useState<ThemeChoice>(
    () => (localStorage.getItem('gf-theme') as ThemeChoice | null) ?? 'system',
  );
  const [sysDark, setSysDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const mode: ThemeMode = choice === 'system' ? (sysDark ? 'dark' : 'light') : choice;

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  const setChoice = useCallback((c: ThemeChoice) => {
    localStorage.setItem('gf-theme', c);
    setChoiceState(c);
  }, []);

  return { choice, mode, setChoice };
}

/** Calls `onOutside` when a pointer/escape lands outside the referenced element. */
export function useDismiss(active: boolean, onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOutside();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [active, onOutside]);
  return ref;
}
