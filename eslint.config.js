import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import prettier from 'eslint-config-prettier';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    'import/extensions': 'off',
    'react/prop-types': 'off',
    'prefer-arrow-callback': 'off',
    'no-control-regex': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
      },
    ],
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
};

export default [
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
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
      '**/postcss.config.cjs',
      'scripts/translator.mjs',
      '*.d.ts',
      '**/*.js',
      '.config/**',
      'scripts/dev.ts',
      'apps/desktop/src-tauri/**',
    ],
  },
  {
    files: ['apps/desktop/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './apps/desktop/tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    ...sharedConfig,
    settings: {
      ...sharedConfig.settings,
      'import/resolver': {
        typescript: {
          project: './apps/desktop/tsconfig.json',
        },
      },
    },
  },

  // 📁 packages/*
  ...['ui', 'hooks', 'utils', 'dnd', 'types', 'stores'].map(pkg => ({
    files: [`packages/${String(pkg)}/**/*.{ts,tsx,js,jsx}`],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: `./packages/${String(pkg)}/tsconfig.json`,
        tsconfigRootDir: __dirname,
      },
    },
    ...sharedConfig,
    settings: {
      ...sharedConfig.settings,
      'import/resolver': {
        typescript: {
          project: `./packages/${String(pkg)}/tsconfig.json`,
        },
      },
    },
  })),
];
