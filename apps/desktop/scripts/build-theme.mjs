import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const desktopDir = path.resolve(dirname, '..');

const tokensDir = path.join(desktopDir, 'src', 'shared', 'theme');
const darkTokensPath = path.join(tokensDir, 'tokens.dark.json');
const lightTokensPath = path.join(tokensDir, 'tokens.light.json');

const outStylesDir = path.join(desktopDir, 'src', 'shared', 'styles');
const outThemesDir = path.join(outStylesDir, 'themes');

const PIXEL_TYPES = new Set(['spacing', 'borderRadius', 'fontSize', 'size', 'dimension']);

const UNITLESS_TYPES = new Set(['fontWeight', 'lineHeight', 'opacity']);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function tokenToCssVar(token) {
  const normalized = token
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

  return `--${normalized}`;
}

function compareTokens(a, b) {
  return a.localeCompare(b);
}

function isReference(value) {
  return typeof value === 'string' && /^\{[^}]+\}$/.test(value.trim());
}

function unwrapReference(value) {
  return value.trim().slice(1, -1).trim();
}

function flattenTokenTree(node, segments = [], out = {}) {
  if (node && typeof node === 'object' && !Array.isArray(node) && '$value' in node) {
    const token = segments.join('.');
    out[token] = {
      value: node.$value,
      type: typeof node.$type === 'string' ? node.$type : undefined,
    };
    return out;
  }

  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return out;
  }

  for (const [key, value] of Object.entries(node)) {
    flattenTokenTree(value, [...segments, key], out);
  }

  return out;
}

function normalizeThemeMap(themeTokens) {
  const normalized = {};

  for (const [token, definition] of Object.entries(themeTokens)) {
    normalized[token] = {
      value: definition.value,
      type: definition.type,
    };
  }

  return normalized;
}

function ensureSameTokenSet(darkTokens, lightTokens) {
  const allTokens = new Set([...Object.keys(darkTokens), ...Object.keys(lightTokens)]);

  for (const token of allTokens) {
    if (!(token in darkTokens)) {
      darkTokens[token] = lightTokens[token];
    }
    if (!(token in lightTokens)) {
      lightTokens[token] = darkTokens[token];
    }
  }
}

function validateTheme(themeName, themeTokens) {
  if (!Object.keys(themeTokens).length) {
    throw new Error(`Theme has no tokens: ${themeName}`);
  }

  const knownTokens = new Set(Object.keys(themeTokens));

  for (const [token, definition] of Object.entries(themeTokens)) {
    if (definition.value == null) {
      throw new Error(`Token has no value: ${themeName}.${token}`);
    }

    if (isReference(definition.value)) {
      const ref = unwrapReference(definition.value);
      if (!knownTokens.has(ref)) {
        throw new Error(`Unknown token reference: ${themeName}.${token} -> ${ref}`);
      }
    }
  }
}

function formatLiteralValue(value, type, token) {
  if (typeof value === 'number') {
    if (PIXEL_TYPES.has(type ?? '')) {
      return value === 0 ? '0' : `${value}px`;
    }

    if (UNITLESS_TYPES.has(type ?? '')) {
      return `${value}`;
    }

    return `${value}`;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  throw new Error(`Unsupported value type for token ${token}: ${typeof value}`);
}

function renderTokenVars(themeTokens) {
  const tokens = Object.keys(themeTokens).sort(compareTokens);

  return tokens
    .map(token => {
      const { value, type } = themeTokens[token];
      if (isReference(value)) {
        const ref = unwrapReference(value);
        return `    ${tokenToCssVar(token)}: var(${tokenToCssVar(ref)});`;
      }

      const formatted = formatLiteralValue(value, type, token);
      return `    ${tokenToCssVar(token)}: ${formatted};`;
    })
    .join('\n');
}

function writeFileEnsuringDir(filePath, contents) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, 'utf8');
}

function loadThemeTokens(filePath) {
  return normalizeThemeMap(flattenTokenTree(readJson(filePath)));
}

if (!existsSync(darkTokensPath)) {
  throw new Error(`Missing token source: ${path.relative(desktopDir, darkTokensPath)}`);
}

const darkTokens = loadThemeTokens(darkTokensPath);
const hasLightTokens = existsSync(lightTokensPath);
const lightTokens = hasLightTokens ? loadThemeTokens(lightTokensPath) : null;

if (lightTokens) {
  ensureSameTokenSet(darkTokens, lightTokens);
}

const darkWithAliases = darkTokens;
const lightWithAliases = lightTokens;

validateTheme('dark', darkWithAliases);
if (lightWithAliases) {
  validateTheme('light', lightWithAliases);
}

mkdirSync(outThemesDir, { recursive: true });

writeFileEnsuringDir(
  path.join(outStylesDir, 'tokens.semantic.css'),
  `/* Generated by apps/desktop/scripts/build-theme.mjs. Do not edit by hand. */
@layer semantic {
  :root {
${renderTokenVars(darkWithAliases)}
  }
}
`,
);

const lightThemePath = path.join(outThemesDir, 'light.css');

if (lightWithAliases) {
  writeFileEnsuringDir(
    lightThemePath,
    `/* Generated by apps/desktop/scripts/build-theme.mjs. Do not edit by hand. */
@layer theme {
  :root[data-theme="light"] {
    color-scheme: light;
${renderTokenVars(lightWithAliases)}
  }
}
`,
  );
} else if (existsSync(lightThemePath)) {
  rmSync(lightThemePath);
}

writeFileEnsuringDir(
  path.join(outThemesDir, 'dark.css'),
  `/* Generated by apps/desktop/scripts/build-theme.mjs. Do not edit by hand. */
@layer theme {
  :root[data-theme="dark"] {
    color-scheme: dark;
${renderTokenVars(darkWithAliases)}
  }
}
`,
);

process.stdout.write(`Theme CSS generated from ${path.relative(desktopDir, darkTokensPath)}\n`);
