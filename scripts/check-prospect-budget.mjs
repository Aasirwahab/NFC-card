#!/usr/bin/env node
/**
 * Prospect page speed budget (postbuild).
 *
 * /c/[code] is the page a prospect opens on their phone right after a tap; it must
 * be readable in under two seconds on mobile data (spec §8). This sums the gzipped
 * JavaScript the browser loads for it (framework + page chunks, not the legacy
 * polyfills modern phones skip) and fails the build above the budget.
 *
 * 2026-11-15 baseline: 172 KB after keeping zod out of the browser (it was ~261 KB).
 * Raise the budget only on purpose, in review, with the reason in the commit.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 190;
const NEXT = join(process.cwd(), '.next');
const ROUTE = '/c/[code]/page';

globalThis.self = globalThis;
await import(join(NEXT, 'server/app/c/[code]/page_client-reference-manifest.js'));
const manifest = globalThis.__RSC_MANIFEST?.[ROUTE];
if (!manifest?.entryJSFiles) {
  console.error(`prospect budget: no client manifest for ${ROUTE}; build layout changed?`);
  process.exit(1);
}
const build = JSON.parse(readFileSync(join(NEXT, 'build-manifest.json'), 'utf8'));
const files = new Set([
  ...(build.rootMainFiles ?? []),
  ...Object.values(manifest.entryJSFiles).flat(),
]);

let total = 0;
const sizes = [];
for (const file of files) {
  const gz = gzipSync(readFileSync(join(NEXT, file.replace(/^\/?_next\//, '')))).length;
  total += gz;
  sizes.push([gz, file]);
}
const kb = (n) => Math.round(n / 1024);
console.log(
  `prospect page JS: ${kb(total)} KB gzipped (budget ${BUDGET_KB} KB, ${files.size} files)`,
);
if (kb(total) > BUDGET_KB) {
  sizes.sort((a, b) => b[0] - a[0]);
  for (const [gz, file] of sizes.slice(0, 5)) console.error(`  ${kb(gz)} KB  ${file}`);
  console.error(
    'prospect budget exceeded: keep heavy libraries (zod, AI SDK, editors) off /c/[code].',
  );
  process.exit(1);
}
