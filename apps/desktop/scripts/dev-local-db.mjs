import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const defaultLibraryDir = path.join(repoRoot, 'library');
const libraryDir = path.resolve(process.env.GRIM_LIBRARY_DIR ?? defaultLibraryDir);
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

await fs.mkdir(libraryDir, { recursive: true });

console.log(`Using local Grim development library: ${libraryDir}`);

const child = spawn(pnpmCommand, ['run', 'dev'], {
  cwd: desktopDir,
  env: {
    ...process.env,
    GRIM_DEV_LOCAL_DB: '1',
    GRIM_LIBRARY_DIR: libraryDir,
  },
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.exit(signal === 'SIGINT' ? 130 : 143);
    return;
  }

  process.exit(code ?? 1);
});
