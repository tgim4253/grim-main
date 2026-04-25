import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const tauriConfigPath = path.join(desktopDir, 'src-tauri', 'tauri.conf.json');

const isDryRun = process.argv.includes('--dry-run');

function resolveBaseAppDataDir() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }

  if (process.platform === 'win32') {
    return process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  }

  return process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
}

async function readTauriIdentifier() {
  const raw = await fs.readFile(tauriConfigPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (typeof parsed.identifier !== 'string' || parsed.identifier.length === 0) {
    throw new Error(`Missing "identifier" in ${tauriConfigPath}`);
  }

  return parsed.identifier;
}

function resolveCandidateLibraryDirs(identifier) {
  const baseAppDataDir = resolveBaseAppDataDir();
  const candidates = [
    path.join(repoRoot, 'library'),
    path.join(baseAppDataDir, identifier, 'library'),
  ];

  return [...new Set(candidates)];
}

async function removeLibraryDir(targetDir) {
  const exists = await fs
    .access(targetDir)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    return false;
  }

  if (path.basename(targetDir) !== 'library') {
    throw new Error(`Refusing to remove unexpected path: ${targetDir}`);
  }

  if (isDryRun) {
    console.log(`[dry-run] Would remove ${targetDir}`);
    return true;
  }

  await fs.rm(targetDir, { recursive: true, force: true });
  console.log(`Removed ${targetDir}`);
  return true;
}

async function main() {
  const identifier = await readTauriIdentifier();
  const targets = resolveCandidateLibraryDirs(identifier);

  let removedAny = false;

  for (const target of targets) {
    const removed = await removeLibraryDir(target);
    removedAny = removedAny || removed;
  }

  if (!removedAny) {
    console.log('No development library database directory found to reset.');
    return;
  }

  if (isDryRun) {
    console.log('Dry run complete.');
    return;
  }

  console.log('Development library database reset complete.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
