import { sharedConfig } from '../../.config/tailwind-css/base';
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ...sharedConfig.theme?.extend?.colors,

        /* ---------- Semantic Colors ---------- */
        background: {
          0: 'var(--color-bg-0)', // base background
          1: 'var(--color-bg-1)', // subtle background
          2: 'var(--color-bg-2)', // UI component background
          3: 'var(--color-bg-3)', // UI component background
          4: 'var(--color-bg-4)', // UI component background
          5: 'var(--color-bg-5)', // UI component background
          6: 'var(--color-bg-6)', // UI component background
          7: 'var(--color-bg-7)', // UI component background
          8: 'var(--color-bg-8)', // UI component background
          9: 'var(--color-bg-9)', // UI component background
          10: 'var(--color-bg-10)', // UI component background
        },
        border: {
          sidebar: 'var(--color-sidebar-border)',
        },
        'sidebar-light': 'var(--color-sidebar-light)', // sidebar background
        'sidebar-dark': 'var(--color-sidebar-dark)', // sidebar background
        sidebar: { bg: 'var(--color-sidebar-bg)', text: 'var(--color-text)' }, // sidebar background',
        'sidebar-hover': 'var(--color-sidebar-hover-bg)',
        icon: {
          sidebar: 'var(--color-icon-sidebar)',
          main: 'var(--color-icon-main)',
        },
        'icon-hover': {
          sidebar: 'var(--color-icon-sidebar-hover)',
          main: 'var(--color-icon-main-hover)',
        },
        'background-hover': 'var(--color-bg-hover)', // background on hover
        foreground: 'var(--color-text)', // main text / icons
        accent: 'var(--color-primary)', // brand / highlight
        surface: 'var(--color-surface)', // cards, sheets
        outline: 'var(--color-border)', // borders, dividers
      },
    },
  },
  plugins: sharedConfig.plugins ?? [],
};
