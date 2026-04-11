import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const tauriDir = path.join(repoRoot, 'apps', 'desktop', 'src-tauri');
const dbPath = path.join(tauriDir, '.dev', 'sqlx-prepare.db');
const databaseUrl = `sqlite://${dbPath}`;
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  SQLX_OFFLINE: 'false',
};

async function run(args) {
  await execa('cargo', args, {
    cwd: tauriDir,
    env,
    stdio: 'inherit',
  });
}

async function main() {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });

  console.log(`DATABASE_URL=${databaseUrl}`);
  await run(['sqlx', 'database', 'create']);
  await run(['sqlx', 'migrate', 'run']);
  await run(['sqlx', 'prepare', '--', '--all-targets']);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
