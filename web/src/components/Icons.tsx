import type { ReactNode } from 'react';

interface IcProps {
  size?: number;
  sw?: number;
  fill?: string;
  children?: ReactNode;
  d?: string;
}

/** Minimal 1.6-stroke icon, drawn in currentColor — ported from the design's shared set. */
function Ic({ d, size = 16, sw = 1.6, fill = 'none', children }: IcProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

type P = Omit<IcProps, 'd' | 'children'>;

export const Icons = {
  sun: (p: P) => (
    <Ic {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Ic>
  ),
  moon: (p: P) => <Ic {...p} d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  monitor: (p: P) => (
    <Ic {...p}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Ic>
  ),
  pin: (p: P) => (
    <Ic {...p}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </Ic>
  ),
  crosshair: (p: P) => (
    <Ic {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </Ic>
  ),
  arrow: (p: P) => <Ic {...p} d="M7 17 17 7M9 7h8v8" />,
  sliders: (p: P) => (
    <Ic {...p}>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    </Ic>
  ),
  binoculars: (p: P) => (
    <Ic {...p}>
      <path d="M5 7a2 2 0 0 1 4 0M15 7a2 2 0 0 1 4 0M7 7c-1 0-2 1-2.3 2.5L3 18a2 2 0 0 0 2 2.4h2.6A2 2 0 0 0 9.6 19L11 11M17 7c1 0 2 1 2.3 2.5L21 18a2 2 0 0 1-2 2.4h-2.6A2 2 0 0 1 14.4 19L13 11M11 11h2" />
    </Ic>
  ),
  upload: (p: P) => <Ic {...p}><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></Ic>,
  check: (p: P) => <Ic {...p} d="M20 6 9 17l-5-5" />,
  calendar: (p: P) => (
    <Ic {...p}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </Ic>
  ),
  close: (p: P) => <Ic {...p} d="M18 6 6 18M6 6l12 12" />,
};
