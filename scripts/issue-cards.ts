/**
 * Operator script: issue a batch of cards to a rep's account and write the CSV for
 * NFC tag writing and the printed codes. Operating model v2: WE create the cards
 * and assign them, then ship; reps never generate batches.
 *
 *   npm run cards:issue -- --email adam@example.com --count 10 --label "Pilot" [--out file.csv]
 *
 * Reads NEXT_PUBLIC_APP_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
 * .env.local (or the environment). Prints nothing secret. Keep the CSV until the
 * batch is written: a tag cannot be re-pointed.
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { issueBatch, printedCode } from '../lib/cards/issue-batch';
import { qrUrl, tagUrl } from '../lib/cards/urls';
import type { Database } from '../lib/db/types';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const count = Number(arg('count'));
  const label = arg('label') ?? null;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');

  if (!email || !Number.isInteger(count) || count < 1 || count > 500) {
    throw new Error('usage: --email <rep email> --count <1-500> [--label text] [--out file.csv]');
  }
  if (!url || !key || !origin) {
    throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_APP_URL are required');
  }

  const db = createClient<Database>(url, key, { auth: { persistSession: false } });

  // Find the rep by email. The account must exist: they sign up first.
  let userId: string | null = null;
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`could not list users: ${error.message}`);
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (!userId) throw new Error(`no account for ${email}: ask them to sign up first`);

  const { batch, codes } = await issueBatch(db, {
    userId,
    size: count,
    label,
    random: (bytes) => new Uint8Array(randomBytes(bytes)),
  });

  const rows = [
    'code,url,qr_url,print_code',
    ...codes.map((c) => `${c},${tagUrl(origin, c)},${qrUrl(origin, c)},${printedCode(c)}`),
  ];
  const out = arg('out') ?? `insignar-cards-${email.split('@')[0]}-${batch.id.slice(0, 8)}.csv`;
  writeFileSync(out, rows.join('\r\n'), { mode: 0o600 });

  console.log(`Issued ${codes.length} cards to ${email} (batch ${batch.id.slice(0, 8)}).`);
  console.log(`CSV written to ${out}: keep it until every tag is written.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
