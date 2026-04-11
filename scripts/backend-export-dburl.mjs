import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const dbPath = path.join(repoRoot, 'apps', 'desktop', 'src-tauri', '.dev', 'sqlx-prepare.db');
const databaseUrl = `sqlite://${dbPath}`;

function quoteForShell(value) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

process.stdout.write(`export DATABASE_URL=${quoteForShell(databaseUrl)}\n`);
