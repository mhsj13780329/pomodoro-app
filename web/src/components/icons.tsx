import type { ReactNode } from "react";

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

export function IconLogo({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="2.4" />
      <path d="M12 9v4l2 2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10 2h4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </Svg>
  );
}

export function IconFlame({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconReset({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 3v5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconPlay({ className }: IconProps) {
  return (
    <Svg className={className}>
      <polygon points="7 3 20 12 7 21 7 3" fill="currentColor" />
    </Svg>
  );
}

export function IconPause({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="6" y="4" width="4" height="16" fill="currentColor" />
      <rect x="14" y="4" width="4" height="16" fill="currentColor" />
    </Svg>
  );
}

/** Drawn pointing right. `rtl:-scale-x-100` turns it left, which is "forward" in Farsi. */
export function IconSkip({ className }: IconProps) {
  return (
    <Svg className={className}>
      <polygon points="5 4 15 12 5 20 5 4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

/** Drawn pointing right. Flipped in RTL so it points left, matching the mockup. */
export function IconChevron({ className }: IconProps) {
  return (
    <Svg className={className}>
      <polyline
        points="9 18 15 12 9 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconNavTimer({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <polyline points="12 6 12 12 16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconNavTasks({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconNavStats({ className }: IconProps) {
  return (
    <Svg className={className}>
      <line x1="18" y1="20" x2="18" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="20" x2="12" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="20" x2="6" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function IconNavSettings({ className }: IconProps) {
  return (
    <Svg className={className}>
      <line x1="4" y1="21" x2="4" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="4" y1="10" x2="4" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="21" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="8" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="20" y1="21" x2="20" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="20" y1="12" x2="20" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="1" y1="14" x2="7" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="17" y1="16" x2="23" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}
