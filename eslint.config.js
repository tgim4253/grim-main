import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import prettier from 'eslint-config-prettier';

const sharedConfig = {
  plugins: {
    '@typescript-eslint': tseslint.plugin,
    react: reactPlugin,
    'react-hooks': reactHooksPlugin,
    'jsx-a11y': jsxA11yPlugin,
    import: importPlugin,
    prettier: prettierPlugin,
  },
  rules: {
    'prettier/prettier': 'error',
    'react/react-in-jsx-scope': 'off',
    'react/jsx-filename-extension': [1, { extensions: ['.tsx'] }],
    'import/extensions': 'off',
    'react/prop-types': 'off',
    'arrow-body-style': 'off',
    'prefer-arrow-callback': 'off',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
};

export default [
  js.configs.recommended, // 기본 JS 룰
  ...tseslint.configs.recommendedTypeChecked, // TypeScript용 룰
  ...tseslint.configs.strictTypeChecked,
  prettier,
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'eslint.config.js',
      'prettier.config.js',
      '**/vite.config.ts',
      '**/tailwind.config.ts',
      '**/postcss.config.ts',
      '*.d.ts',
      '.config/**',
      'scripts/dev.ts',
      'apps/desktop/src-tauri/target/**',
    ],
  },
  // 📁 apps/desktop/renderer
  {
    files: ['apps/desktop/renderer/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './apps/desktop/renderer/tsconfig.json',
        tsconfigRootDir: new URL('.', import.meta.url),
      },
    },
    ...sharedConfig,
    settings: {
      ...sharedConfig.settings,
      'import/resolver': {
        typescript: {
          project: './apps/desktop/renderer/tsconfig.json',
        },
      },
    },
  },

  // 📁 apps/desktop/main
  {
    files: ['apps/desktop/main/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './apps/desktop/main/tsconfig.json',
        tsconfigRootDir: new URL('.', import.meta.url),
      },
    },
    ...sharedConfig,
    settings: {
      ...sharedConfig.settings,
      'import/resolver': {
        typescript: {
          project: './apps/desktop/main/tsconfig.json',
        },
      },
    },
  },

  // 📁 apps/desktop/preload
  {
    files: ['apps/desktop/preload/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './apps/desktop/preload/tsconfig.json',
        tsconfigRootDir: new URL('.', import.meta.url),
      },
    },
    ...sharedConfig,
    settings: {
      ...sharedConfig.settings,
      'import/resolver': {
        typescript: {
          project: './apps/desktop/preload/tsconfig.json',
        },
      },
    },
  },

  // 📁 packages/*
  ...['ui', 'hooks', 'utils'].map(pkg => ({
    files: [`packages/${pkg}/**/*.{ts,tsx,js,jsx}`],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: `./packages/${pkg}/tsconfig.json`,
        tsconfigRootDir: new URL('.', import.meta.url),
      },
    },
    ...sharedConfig,
    settings: {
      ...sharedConfig.settings,
      'import/resolver': {
        typescript: {
          project: `./packages/${pkg}/tsconfig.json`,
        },
      },
    },
  })),
];
