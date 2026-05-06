import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, '..');
const ipcCorePath = path.join(desktopRoot, 'src', 'shared', 'lib', 'ipc', 'core.ts');
const tauriLibPath = path.join(desktopRoot, 'src-tauri', 'src', 'lib.rs');

const ipcCoreSource = fs.readFileSync(ipcCorePath, 'utf8');
const tauriLibSource = fs.readFileSync(tauriLibPath, 'utf8');

function collectTypeScriptCommands(source) {
  const match = source.match(/export type IpcCommandContract = \{([\s\S]*?)\n\};/);
  if (!match) {
    throw new Error('Could not find IpcCommandContract in core.ts');
  }

  return new Set(
    Array.from(match[1].matchAll(/^\s{2}([a-z][a-z0-9_]+):\s*CommandContract/gm)).map(
      commandMatch => commandMatch[1],
    ),
  );
}

function collectRustCommands(source) {
  const match = source.match(/tauri::generate_handler!\[([\s\S]*?)\]/);
  if (!match) {
    throw new Error('Could not find tauri::generate_handler! command list in lib.rs');
  }

  return new Set(
    Array.from(match[1].matchAll(/commands::[a-z_]+::([a-z][a-z0-9_]+)/g)).map(
      commandMatch => commandMatch[1],
    ),
  );
}

function sortedDifference(left, right) {
  return Array.from(left)
    .filter(command => !right.has(command))
    .sort();
}

const tsCommands = collectTypeScriptCommands(ipcCoreSource);
const rustCommands = collectRustCommands(tauriLibSource);
const missingInRust = sortedDifference(tsCommands, rustCommands);
const missingInTypeScript = sortedDifference(rustCommands, tsCommands);

if (missingInRust.length > 0 || missingInTypeScript.length > 0) {
  console.error('IPC command contract mismatch.');
  if (missingInRust.length > 0) {
    console.error(`Only in TypeScript: ${missingInRust.join(', ')}`);
  }
  if (missingInTypeScript.length > 0) {
    console.error(`Only in Rust: ${missingInTypeScript.join(', ')}`);
  }
  process.exit(1);
}

console.log(`IPC command contract OK (${tsCommands.size} commands).`);
