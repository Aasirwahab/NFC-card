/**
 * CI gate 2 (spec §25.2) — the service-role key must be absent from the client bundle.
 *
 * That key bypasses every RLS policy in the database, so this is a one-character
 * mistake with unbounded blast radius. It is not left to code review.
 *
 * This is the outermost of three layers. The first is `import 'server-only'` in
 * lib/db/service.ts, which turns a client-side import into a build error. The
 * second is never naming a secret with a NEXT_PUBLIC_ prefix. This is the net
 * underneath both.
 *
 * Run after `next build`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';

// This runs as a standalone Node script, so nothing has loaded .env for it. Without
// this the VALUE checks below have nothing to look for and the gate silently passes
// while checking nothing — which is worse than not having the gate. In CI the
// secrets come from the real environment and these calls are no-ops.
const mode = process.env.NODE_ENV ?? 'production';
for (const file of [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']) {
  loadEnv({ path: file, quiet: true });
}

/** Client JavaScript, CSS and source maps. */
const STATIC_DIR = '.next/static';

/**
 * Prerendered HTML and RSC payloads. These reach the browser just as surely as a
 * JS chunk does, so a secret inlined into a Server Component's output leaks the
 * same way. Only the browser-visible artefacts in here are in scope — the
 * server's own JavaScript legitimately references secret names.
 */
const PRERENDER_DIR = '.next/server/app';

const STATIC_PATTERN = /\.(js|mjs|css|map|json|txt)$/;
const PRERENDER_PATTERN = /\.(html|rsc|body)$/;

/** Names that must never appear in a client bundle. */
const FORBIDDEN_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'WORKER_SECRET',
  'CRON_SECRET',
  'MODEL_API_KEY',
  'RESEND_API_KEY',
  'CAL_WEBHOOK_SECRET',
  'UPSTASH_REDIS_REST_TOKEN',
  'SENTRY_DSN',
];

/** Values, when this environment actually holds them. Short values are skipped. */
const FORBIDDEN_VALUES = FORBIDDEN_NAMES.map((name) => [name, process.env[name]]).filter(
  ([, value]) => typeof value === 'string' && value.length >= 20,
);

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const violations = [];
let scanned = 0;

for (const [dir, pattern, checkNames] of [
  [STATIC_DIR, STATIC_PATTERN, true],
  [PRERENDER_DIR, PRERENDER_PATTERN, true],
]) {
  for (const file of walk(dir)) {
    if (!pattern.test(file)) continue;
    scanned++;
    const contents = readFileSync(file, 'utf8');

    if (checkNames) {
      for (const name of FORBIDDEN_NAMES) {
        if (contents.includes(name)) violations.push(`${file}: contains the name "${name}"`);
      }
    }
    for (const [name, value] of FORBIDDEN_VALUES) {
      if (contents.includes(value)) violations.push(`${file}: contains the VALUE of ${name}`);
    }
  }
}

if (scanned === 0) {
  console.error('Secret-leak check: no client bundle found. Run `next build` first.');
  process.exit(1);
}

if (FORBIDDEN_VALUES.length === 0) {
  // Say so out loud. A gate that reports success while checking nothing is the
  // failure mode this whole file exists to prevent.
  console.error(
    'Secret-leak check: no secret VALUES available to scan for — every secret in ' +
      'this environment is unset or under 20 characters. Name checks still ran.',
  );
  process.exit(1);
}

if (violations.length > 0) {
  console.error(`\nSecret-leak check FAILED — ${violations.length} violation(s):\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error('\nA server-only value reached the browser. See spec §22.3.\n');
  process.exit(1);
}

console.log(
  `Secret-leak check passed (${scanned} browser-visible files scanned, ` +
    `${FORBIDDEN_VALUES.length} secret values and ${FORBIDDEN_NAMES.length} names).`,
);
