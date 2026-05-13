import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const inputVersion = process.argv[2]?.trim();

if (!inputVersion) {
  console.error('Usage: node scripts/bump-version.mjs <version>');
  process.exit(1);
}

const version = inputVersion.startsWith('v') ? inputVersion.slice(1) : inputVersion;

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid semver: ${inputVersion}`);
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const targets = [
  'package.json',
  'apps/desktop/package.json',
  'apps/desktop/src-tauri/Cargo.toml',
  'apps/desktop/src-tauri/Cargo.lock',
  'apps/desktop/src-tauri/tauri.conf.json',
];

function replaceJsonVersion(source, nextVersion) {
  return replaceOne(source, /"version"\s*:\s*"[^"]+"/, match =>
    match.replace(/"[^"]+"$/, `"${nextVersion}"`),
  );
}

function replaceCargoPackageVersion(source, nextVersion) {
  return replaceOne(source, /(\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/m, `$1${nextVersion}$2`);
}

function replaceCargoLockPackageVersion(source, nextVersion) {
  return replaceOne(
    source,
    /(\[\[package\]\]\s*\nname\s*=\s*"grim-app"\s*\nversion\s*=\s*")[^"]+(")/,
    `$1${nextVersion}$2`,
  );
}

function replaceOne(source, pattern, replacement) {
  if (!pattern.test(source)) {
    throw new Error(`Pattern not found: ${pattern}`);
  }

  return source.replace(pattern, replacement);
}

const updaters = new Map([
  ['package.json', replaceJsonVersion],
  ['apps/desktop/package.json', replaceJsonVersion],
  ['apps/desktop/src-tauri/Cargo.toml', replaceCargoPackageVersion],
  ['apps/desktop/src-tauri/Cargo.lock', replaceCargoLockPackageVersion],
  ['apps/desktop/src-tauri/tauri.conf.json', replaceJsonVersion],
]);

for (const relativePath of targets) {
  const absolutePath = path.join(repoRoot, relativePath);
  const original = await readFile(absolutePath, 'utf8');
  const updater = updaters.get(relativePath);

  if (!updater) {
    throw new Error(`No updater registered for ${relativePath}`);
  }

  const next = updater(original, version);

  if (next === original) {
    console.log(`unchanged ${relativePath}`);
    continue;
  }

  await writeFile(absolutePath, next);
  console.log(`updated ${relativePath} -> ${version}`);
}
