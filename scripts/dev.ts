import { execa } from 'execa';

async function main() {
  await execa('pnpm', ['-r', 'run', 'dev'], { stdio: 'inherit' });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
