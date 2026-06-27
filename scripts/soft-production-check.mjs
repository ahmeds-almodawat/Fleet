import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const requiredMissing = [
  '.env',
  '.env.local',
  '.env.production',
  'supabase/functions/.env',
  'supabase/.temp/pooler-url',
  'backup_data.sql',
  'backup_schema.sql',
  'Fleet7.zip',
  'bun.lockb',
];

const commands = [
  ['npm', ['run', 'lint']],
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'test']],
  ['npm', ['run', 'build']],
  ['npm', ['audit', '--omit=dev']],
];

const secretPatterns = [
  { name: 'Supabase service-role JWT', pattern: /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g },
  { name: 'Supabase secret key', pattern: /sb_secret_[a-zA-Z0-9_-]+/g },
  { name: 'Postgres pooler URL', pattern: /postgres(?:ql)?:\/\/[^\s"']+/g },
  { name: 'OCR.Space API key assignment', pattern: /OCRSPACE_API_KEY\s*=\s*[^\s"']+/g },
];

const textFileExtensions = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.sql', '.toml', '.yml', '.yaml', '.txt', '.html', '.css', '.example', '.gitignore'
]);

function extensionOf(path) {
  const idx = path.lastIndexOf('.');
  return idx >= 0 ? path.slice(idx) : '';
}

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', 'coverage'].includes(name)) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

let failed = false;

console.log('Fleet soft-production validation\n');

for (const file of requiredMissing) {
  if (existsSync(file)) {
    console.error(`BLOCKER: remove ${file} from the repo before soft production.`);
    failed = true;
  }
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
if (packageJson.dependencies?.firebase) {
  console.error('BLOCKER: firebase is still installed but unused. Remove it before release.');
  failed = true;
}
if (packageJson.devDependencies?.['lovable-tagger']) {
  console.error('BLOCKER: lovable-tagger is still installed. Remove it before release.');
  failed = true;
}

const configToml = existsSync('supabase/config.toml') ? readFileSync('supabase/config.toml', 'utf8') : '';
const disabledJwtFunctions = Array.from(configToml.matchAll(/\[functions\.([^\]]+)\][\s\S]*?verify_jwt\s*=\s*false/g)).map((m) => m[1]);
for (const fn of disabledJwtFunctions) {
  const fnPath = `supabase/functions/${fn}/index.ts`;
  const fnText = existsSync(fnPath) ? readFileSync(fnPath, 'utf8') : '';
  const hasManualGuard = /getAuthenticatedUser|requireUserPermission|requireSchedulerSecretOrUserPermission|auth\.getUser/.test(fnText);
  if (!hasManualGuard) {
    console.error(`BLOCKER: ${fn} has verify_jwt=false but no obvious manual auth/secret guard.`);
    failed = true;
  }
}

const corsFiles = walk('supabase/functions').filter((file) => textFileExtensions.has(extensionOf(file)) || file.endsWith('.ts'));
for (const file of corsFiles) {
  const text = readFileSync(file, 'utf8');
  if (/access-control-allow-origin['"]?\s*[:=]\s*['"]\*/i.test(text)) {
    console.error(`BLOCKER: wildcard CORS detected in ${file}.`);
    failed = true;
  }
}

const sourceFiles = walk('.').filter((file) => textFileExtensions.has(extensionOf(file)) || file.endsWith('.env.example'));
for (const file of sourceFiles) {
  const normalized = file.replace(/\\/g, '/');
  if (normalized.endsWith('.env.example')) continue;
  const text = readFileSync(file, 'utf8');
  for (const pattern of secretPatterns) {
    const matches = text.match(pattern.pattern) ?? [];
    const realMatches = matches.filter((match) => !/YOUR_|ROTATED|replace-with|LONG_RANDOM|example/i.test(match));
    if (realMatches.length) {
      console.error(`BLOCKER: possible ${pattern.name} found in ${normalized}.`);
      failed = true;
    }
  }
}

const appTsx = existsSync('src/App.tsx') ? readFileSync('src/App.tsx', 'utf8') : '';
if (!appTsx.includes('path="/register" element={<Navigate to="/login" replace />}')) {
  console.error('BLOCKER: /register route is not hard-redirected to /login. Disable public registration before soft production.');
  failed = true;
}

const viteConfig = existsSync('vite.config.ts') ? readFileSync('vite.config.ts', 'utf8') : '';
if (viteConfig.includes('supabase-cache') || viteConfig.includes('NetworkFirst')) {
  console.error('BLOCKER: Vite PWA config appears to cache Supabase API responses. Remove API caching for privacy.');
  failed = true;
}

if (failed) {
  console.error('\nValidation stopped because repository hygiene/security blockers were found.');
  process.exit(1);
}

for (const [cmd, args] of commands) run(cmd, args);

console.log('\nSoft-production validation passed.');
