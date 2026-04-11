import type { ReactNode } from 'react';

// Several glyphs are adapted from Lucide Icons: https://github.com/lucide-icons/lucide
// Custom glyphs in this file cover Grim-specific variants that are not direct Lucide matches.

export const ICON_NAMES = [
  'anatomy',
  'camera',
  'check',
  'chevron-down',
  'chevron-right',
  'chevron-up',
  'close',
  'file',
  'folder',
  'folder-open',
  'gesture',
  'grid',
  'help-circle',
  'layers',
  'link-2',
  'link-2-off',
  'link-to',
  'minus',
  'plus',
  'reload',
  'search',
  'setting',
  'star',
  'tree',
  'user',
  'user-round-plus',
] as const;

export type IconName = (typeof ICON_NAMES)[number];
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type IconHierarchy = 'primary' | 'tertiary';
export type IconColor = 'text' | 'brand';

const anatomyGlyph = (
  <>
    <path d="M12 3v18" />
    <path d="M12 4c-1.7 0-3.2.8-4.1 2.2" />
    <path d="M12 4c1.7 0 3.2.8 4.1 2.2" />
    <path d="M12 9c-2.1 0-3.9 1-4.9 2.7" />
    <path d="M12 9c2.1 0 3.9 1 4.9 2.7" />
    <path d="M12 14c-1.8 0-3.2.8-4.1 2.2" />
    <path d="M12 14c1.8 0 3.2.8 4.1 2.2" />
    <path d="M12 19c-1 0-1.9.4-2.6 1.1" />
    <path d="M12 19c1 0 1.9.4 2.6 1.1" />
  </>
);

const gridGlyph = (
  <>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <rect x="14" y="14" width="6" height="6" rx="1" />
  </>
);

const helpCircleGlyph = (
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </>
);

const link2OffGlyph = (
  <>
    <path d="M9 17H7A5 5 0 0 1 3.5 8.5" />
    <path d="M15 7h2a5 5 0 0 1 3.5 8.5" />
    <path d="M8 12h3" />
    <path d="M13 12h3" />
    <path d="M4 20 20 4" />
  </>
);

const reloadGlyph = (
  <>
    <path d="M3 12a9 9 0 1 0 2.64-6.36" />
    <path d="M3 4v5h5" />
  </>
);

const treeGlyph = (
  <>
    <rect x="10" y="3" width="4" height="4" rx="1" />
    <path d="M12 7v4" />
    <path d="M6 11h12" />
    <path d="M6 11v6" />
    <path d="M12 11v6" />
    <path d="M18 11v6" />
    <rect x="4" y="17" width="4" height="4" rx="1" />
    <rect x="10" y="17" width="4" height="4" rx="1" />
    <rect x="16" y="17" width="4" height="4" rx="1" />
  </>
);

export const ICON_GLYPHS = {
  anatomy: anatomyGlyph,
  camera: (
    <>
      <path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  'chevron-up': <path d="m18 15-6-6-6 6" />,
  close: (
    <>
      <path
        d="M17.6667 1L1 17.6667M1 1L9.33333 9.33333L17.6667 17.6667"
        stroke="white"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </>
  ),
  file: (
    <>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </>
  ),
  folder: (
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  ),
  'folder-open': (
    <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
  ),
  gesture: (
    <>
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </>
  ),
  grid: gridGlyph,
  'help-circle': helpCircleGlyph,
  layers: (
    <>
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
      <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
      <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
    </>
  ),
  'link-2': (
    <>
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <path d="M8 12h8" />
    </>
  ),
  'link-2-off': link2OffGlyph,
  'link-to': (
    <>
      <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" />
      <path d="m21 3-9 9" />
      <path d="M15 3h6v6" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  plus: (
    <path
      fill="currentColor"
      stroke="none"
      d="M10.56 13.44H0v-2.88h10.56V0h2.88v10.56H24v2.88H13.44V24h-2.88z"
    />
  ),
  reload: reloadGlyph,
  search: (
    <>
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </>
  ),
  setting: (
    <>
      <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  star: (
    <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
  ),
  tree: treeGlyph,
  user: (
    <>
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </>
  ),
  'user-round-plus': (
    <>
      <path d="M2 21a8 8 0 0 1 13.292-6" />
      <circle cx="10" cy="8" r="5" />
      <path d="M19 16v6" />
      <path d="M22 19h-6" />
    </>
  ),
} satisfies Record<IconName, ReactNode>;
