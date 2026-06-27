import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const apply = process.argv.includes('--apply');

const targets = [
  '.env',
  'supabase/functions/.env',
  'supabase/.temp',
  'backup_data.sql',
  'backup_schema.sql',
  'Fleet7.zip',
  'bun.lockb',
  'dist',
];

console.log('Fleet release cleanup');
console.log(apply ? 'Mode: APPLY' : 'Mode: DRY RUN');
console.log('');

let found = 0;
for (const target of targets) {
  const path = resolve(process.cwd(), target);
  if (!existsSync(path)) continue;
  found += 1;
  if (apply) {
    rmSync(path, { recursive: true, force: true });
    console.log(`removed ${target}`);
  } else {
    console.log(`would remove ${target}`);
  }
}

if (found === 0) {
  console.log('No cleanup targets found.');
} else if (!apply) {
  console.log('');
  console.log('Run npm run release:clean:apply to remove these files.');
}
