import { execFile as execFileCallback } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);

const VERSION_BUMP_LEVELS = new Set(['major', 'minor', 'patch']);
const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const targets = [
  'package.json',
  'apps/desktop/package.json',
  'apps/desktop/src-tauri/Cargo.toml',
  'apps/desktop/src-tauri/Cargo.lock',
  'apps/desktop/src-tauri/tauri.conf.json',
];

const updaters = new Map([
  ['package.json', replaceJsonVersion],
  ['apps/desktop/package.json', replaceJsonVersion],
  ['apps/desktop/src-tauri/Cargo.toml', replaceCargoPackageVersion],
  ['apps/desktop/src-tauri/Cargo.lock', replaceCargoLockPackageVersion],
  ['apps/desktop/src-tauri/tauri.conf.json', replaceJsonVersion],
]);

const args = process.argv.slice(2);
const inputVersion = args.find(arg => !arg.startsWith('--'))?.trim();
const shouldCommit = !args.includes('--no-commit');
const isDryRun = args.includes('--dry-run');

if (!inputVersion || args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(inputVersion ? 0 : 1);
}

const version = await resolveNextVersion(inputVersion);

if (shouldCommit && !isDryRun) {
  await assertVersionTargetsClean();
  await assertNoStagedChanges();
}

const changedFiles = [];

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

  if (!isDryRun) {
    await writeFile(absolutePath, next);
  }

  changedFiles.push(relativePath);
  console.log(`${isDryRun ? 'would update' : 'updated'} ${relativePath} -> ${version}`);
}

if (changedFiles.length === 0) {
  console.log(`Version is already ${version}; no files changed.`);
  process.exit(0);
}

if (shouldCommit) {
  if (isDryRun) {
    console.log(`would commit: chore: bump version to v${version}`);
  } else {
    await commitVersionBump(version);
  }
}

function printUsage() {
  console.error(`Usage: node scripts/bump-version.mjs <version|major|minor|patch> [--no-commit] [--dry-run]

Examples:
  pnpm version:bump patch
  pnpm version:bump minor
  pnpm version:bump major
  pnpm version:bump 0.5.0
  pnpm version:bump 0.5.0 --no-commit`);
}

async function resolveNextVersion(input) {
  const normalizedInput = input.startsWith('v') ? input.slice(1) : input;

  if (VERSION_BUMP_LEVELS.has(normalizedInput)) {
    const currentVersion = await readCurrentVersion();
    return bumpSemver(currentVersion, normalizedInput);
  }

  if (!SEMVER_PATTERN.test(normalizedInput)) {
    console.error(`Invalid semver or bump level: ${input}`);
    printUsage();
    process.exit(1);
  }

  return normalizedInput;
}

async function readCurrentVersion() {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const currentVersion = String(packageJson.version ?? '');

  if (!SEMVER_PATTERN.test(currentVersion)) {
    throw new Error(`Current package.json version is not valid semver: ${currentVersion}`);
  }

  return currentVersion;
}

function bumpSemver(currentVersion, level) {
  const match = SEMVER_PATTERN.exec(currentVersion);

  if (!match) {
    throw new Error(`Cannot bump invalid semver: ${currentVersion}`);
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  switch (level) {
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'patch':
      patch += 1;
      break;
    default:
      throw new Error(`Unsupported bump level: ${level}`);
  }

  return `${major}.${minor}.${patch}`;
}

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

async function assertVersionTargetsClean() {
  await runGit(['diff', '--quiet', '--', ...targets], {
    failureMessage:
      'Version target files have unstaged changes. Commit or stash them before running version:bump.',
  });
}

async function assertNoStagedChanges() {
  await runGit(['diff', '--cached', '--quiet'], {
    failureMessage:
      'There are already staged changes. Commit or unstage them before running version:bump.',
  });
}

async function commitVersionBump(nextVersion) {
  await runGit(['add', ...targets]);
  await runGit(['commit', '-m', `chore: bump version to v${nextVersion}`]);
  console.log(`committed chore: bump version to v${nextVersion}`);
}

async function runGit(args, options = {}) {
  try {
    return await execFile('git', args, { cwd: repoRoot });
  } catch (error) {
    if (options.failureMessage) {
      console.error(options.failureMessage);
    }

    if (error.stdout) {
      console.error(String(error.stdout));
    }

    if (error.stderr) {
      console.error(String(error.stderr));
    }

    process.exit(error.exitCode || 1);
  }
}
