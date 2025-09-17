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
          0: 'var(--color-bg-0)',
          1: 'var(--color-bg-1)',
          2: 'var(--color-bg-2)',
          3: 'var(--color-bg-3)',
          4: 'var(--color-bg-4)',
          5: 'var(--color-bg-5)',
          6: 'var(--color-bg-6)',
          7: 'var(--color-bg-7)',
          8: 'var(--color-bg-8)',
          9: 'var(--color-bg-9)',
          10: 'var(--color-bg-10)',
        },
        surface: {
          DEFAULT: 'var(--ds-surface-base)',
          raised: 'var(--ds-surface-raised)',
          muted: 'var(--ds-surface-muted)',
          hover: 'var(--ds-surface-hover)',
          active: 'var(--ds-surface-active)',
        },
        shell: {
          base: 'var(--ds-shell-surface)',
          contrast: 'var(--ds-shell-contrast)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-hover)',
          focus: 'var(--ds-border-focus)',
          sidebar: 'var(--color-sidebar-border)',
        },
        text: {
          DEFAULT: 'var(--color-text)',
          soft: 'var(--color-text-soft)',
          inverse: 'var(--color-text-inverse)',
          placeholder: 'var(--color-text-placeholder)',
        },
        sidebar: {
          DEFAULT: 'var(--color-sidebar-bg)',
          bg: 'var(--color-sidebar-bg)',
          hover: 'var(--color-sidebar-hover-bg)',
          border: 'var(--color-sidebar-border)',
          text: 'var(--color-text)',
          icon: 'var(--color-icon-sidebar)',
          'icon-hover': 'var(--color-icon-sidebar-hover)',
        },
        main: {
          DEFAULT: 'var(--color-main-bg)',
          hover: 'var(--color-main-hover-bg)',
          icon: 'var(--color-icon-main)',
          'icon-hover': 'var(--color-icon-main-hover)',
        },
        modal: {
          DEFAULT: 'var(--color-modal-bg)',
          text: 'var(--color-text)',
          hover: 'var(--color-sidebar-hover-bg)',
          input: {
            DEFAULT: 'var(--color-modal-input-bg)',
            hover: 'var(--color-modal-input-hover-bg)',
            placeholder: 'var(--color-modal-input-placeholder)',
          },
        },
        icon: {
          sidebar: 'var(--color-icon-sidebar)',
          main: 'var(--color-icon-main)',
        },
        'icon-hover': {
          sidebar: 'var(--color-icon-sidebar-hover)',
          main: 'var(--color-icon-main-hover)',
        },
        accent: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-brand-hover)',
          ring: 'var(--ds-accent-ring)',
        },
        overlay: {
          DEFAULT: 'var(--ds-overlay)',
        },
        'background-hover': 'var(--color-bg-hover)',
        foreground: 'var(--color-text)',
        'sidebar-light': 'var(--color-sidebar-light)',
        'sidebar-dark': 'var(--color-sidebar-dark)',
        outline: 'var(--color-border)',
      },
    },
  },
  plugins: sharedConfig.plugins ?? [],
};
