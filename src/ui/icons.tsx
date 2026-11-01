import type { CSSProperties, ReactNode } from 'react';

// Stroke icons taken from the design (24×24 grid, round caps).
const PATHS = {
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 3 4.5 6v6c0 4.6 3.2 7.8 7.5 9 4.3-1.2 7.5-4.4 7.5-9V6L12 3z" />
      <path d="m8.8 12 2.3 2.3 4.2-4.6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </>
  ),
  back: <path d="m15 18-6-6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.7 2.7L16 9.5" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.5 2.5 20h19L12 3.5z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16.5 14.5A5 5 0 0 1 21.5 20" />
    </>
  ),
  share: (
    <>
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M7 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1" />
    </>
  ),
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  excel: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M3.5 9h17M3.5 14.5h17M9.5 9v11.5" />
    </>
  ),
  chart: <path d="M4 20V10M9 20V4M15 20v-7M20 20V8" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  tabOverview: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9h9" />
    </>
  ),
  tabExpenses: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" style={{ strokeWidth: 3 }} />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  checklist: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  swipe: <path d="M19 12H5M10 7l-5 5 5 5" />,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  receiptLong: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  house: (
    <>
      <path d="M3 11 12 3.5l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  euro: (
    <>
      <path d="M17.5 6.5A7 7 0 1 0 17.5 17.5" />
      <path d="M4 10.5h9M4 13.5h9" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  download: (
    <>
      <path d="M12 15V3" />
      <path d="m8 11 4 4 4-4" />
      <path d="M5 17v3h14v-3" />
    </>
  ),
  handle: <path d="M5 8h14M5 12h14M5 16h14" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  alertCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16h.01" />
    </>
  ),
  exclaim: <path d="M12 7v6M12 17h.01" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5h.01" />
    </>
  ),
  warningSmall: (
    <>
      <path d="M12 3.5 2.5 20h19L12 3.5z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  sheet: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M3.5 9h17M3.5 14.5h17M9.5 9v11.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M4 12a8 8 0 0 1 14-5.3L20 9" />
      <path d="M20 4v5h-5" />
      <path d="M20 12a8 8 0 0 1-14 5.3L4 15" />
      <path d="M4 20v-5h5" />
    </>
  ),
  // Category icons
  cart: (
    <>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h3l2.6 12.2a1.5 1.5 0 0 0 1.5 1.2h8.7a1.5 1.5 0 0 0 1.5-1.1L21 7H6" />
    </>
  ),
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9v11h14V9" />
      <path d="M10 20v-6h4v6" />
    </>
  ),
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  wifi: (
    <>
      <path d="M2 8.8a15 15 0 0 1 20 0" />
      <path d="M5 12.5a10 10 0 0 1 14 0" />
      <path d="M8.5 16a5 5 0 0 1 7 0" />
      <circle cx="12" cy="19.5" r="1" />
    </>
  ),
  shield: <path d="M12 3 4.5 6v6c0 4.6 3.2 7.8 7.5 9 4.3-1.2 7.5-4.4 7.5-9V6L12 3z" />,
  car: (
    <>
      <rect x="3" y="11" width="18" height="6" rx="2" />
      <path d="M5 11l2-5h10l2 5" />
      <path d="M6.5 17v2.5M17.5 17v2.5" />
    </>
  ),
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  kid: (
    <>
      <circle cx="12" cy="6" r="3" />
      <path d="M8 21v-6l-2-3h12l-2 3v6" />
    </>
  ),
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  shirt: <path d="M8.5 3 3 6l2 4.2 2.2-1V21h9.6V9.2l2.2 1L21 6l-5.5-3c0 1.7-1.6 3-3.5 3s-3.5-1.3-3.5-3z" />,
  paw: (
    <>
      <circle cx="6.5" cy="10" r="1.7" />
      <circle cx="10" cy="6" r="1.7" />
      <circle cx="14" cy="6" r="1.7" />
      <circle cx="17.5" cy="10" r="1.7" />
      <path d="M12 12c-3 0-5.5 3.3-5.5 5.6 0 1.4 1.3 2.3 2.7 1.9 1-.3 1.9-.6 2.8-.6s1.8.3 2.8.6c1.4.4 2.7-.5 2.7-1.9C17.5 15.3 15 12 12 12z" />
    </>
  ),
  gift: (
    <>
      <rect x="3.5" y="8" width="17" height="4" rx="1" />
      <path d="M5 12v8h14v-8M12 8v12" />
      <path d="M12 8c-1.5-3-5-3.5-5-1 0 1.5 3 1 5 1zM12 8c1.5-3 5-3.5 5-1 0 1.5-3 1-5 1z" />
    </>
  ),
  book: (
    <>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M5 17a3 3 0 0 1 3-3h11" />
    </>
  ),
  sport: <path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" />,
  travel: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12h18" />
    </>
  ),
  coffee: (
    <>
      <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3" />
    </>
  ),
  tools: <path d="M15 4a5 5 0 0 0-4.6 6.9L4 17.3V20h2.7l6.4-6.4A5 5 0 0 0 20 9l-3 1-2-2 1-3z" />,
  game: (
    <>
      <rect x="2.5" y="7" width="19" height="10" rx="5" />
      <path d="M7 10.5v3M5.5 12h3M15.5 11h.01M18 13h.01" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15" />
      <path d="M5 19 13 11" />
    </>
  ),
  school: (
    <>
      <path d="m2 9 10-5 10 5-10 5z" />
      <path d="M6 11v5c3 2 9 2 12 0v-5" />
    </>
  )
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function isIconName(s: string): s is IconName {
  return Object.prototype.hasOwnProperty.call(PATHS, s);
}

/** Icons offered when creating or editing a category. */
export const CATEGORY_ICONS: { id: IconName; label: string }[] = [
  { id: 'cart', label: 'Groceries' },
  { id: 'home', label: 'Home' },
  { id: 'bolt', label: 'Energy' },
  { id: 'wifi', label: 'Internet' },
  { id: 'shield', label: 'Insurance' },
  { id: 'car', label: 'Car' },
  { id: 'star', label: 'Leisure' },
  { id: 'kid', label: 'Kids' },
  { id: 'heart', label: 'Health' },
  { id: 'refresh', label: 'Subscriptions' },
  { id: 'shirt', label: 'Clothing' },
  { id: 'paw', label: 'Paw' },
  { id: 'gift', label: 'Gift' },
  { id: 'book', label: 'Book' },
  { id: 'sport', label: 'Sport' },
  { id: 'travel', label: 'Travel' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'tools', label: 'Repairs' },
  { id: 'game', label: 'Games' },
  { id: 'music', label: 'Music' },
  { id: 'leaf', label: 'Garden' },
  { id: 'school', label: 'School' },
  { id: 'card', label: 'Bank' },
  { id: 'receipt', label: 'Bills' }
];

interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
  style?: CSSProperties;
  className?: string;
}

export function Icon({ name, size = 24, stroke, style, className }: IconProps) {
  return (
    <svg
      className={className ? 'i ' + className : 'i'}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      style={stroke ? { strokeWidth: stroke, ...style } : style}
    >
      {PATHS[name]}
    </svg>
  );
}

/** The app icon ("Together"): two arcs form a roof over two people. Same drawing as public/logo.svg. */
export function AppIcon({ size = 132 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" style={{ display: 'block' }}>
      <rect width="120" height="120" fill="#F4EFE6" />
      <path d="M22 74C30 46 44 32 60 28" fill="none" stroke="#0B7A75" strokeWidth="10" strokeLinecap="round" />
      <path d="M98 74C90 46 76 32 60 28" fill="none" stroke="#E0603A" strokeWidth="10" strokeLinecap="round" />
      <circle cx="44" cy="84" r="9" fill="#0B7A75" />
      <circle cx="76" cy="84" r="9" fill="#E0603A" />
    </svg>
  );
}
