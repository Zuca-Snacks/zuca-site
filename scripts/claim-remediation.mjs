#!/usr/bin/env node
/**
 * Remediation survey of the production Upstash keyspace. DRY RUN BY DEFAULT.
 *
 *   node scripts/claim-remediation.mjs <sheet-export.csv>
 *
 * Reads UPSTASH_REDIS_REST_URL / _TOKEN from .env.local. Never from Vercel,
 * never from an argument, never printed.
 *
 * ─── Why this exists ─────────────────────────────────────────────────────────
 *
 * Before S25, every submission wrote a 400-day duplicate key on ARRIVAL, with
 * value '1'. Those keys outlived the requests that made them, including the
 * ones that never produced a row. Three populations need three answers:
 *
 *   A  legacy '1' WITH a matching row   real members. PROMOTE to 'committed'
 *                                       so they read as duplicate. Left alone,
 *                                       growth's client tells them to "try
 *                                       again in a moment" forever, because a
 *                                       '1' now reads as `inflight` and a '1'
 *                                       never lapses.
 *   B  legacy '1' with NO matching row  locked out of a signup that never
 *                                       landed. DELETE.
 *   C  'committed' or 'inflight'        written post-fix. LEAVE.
 *
 * ─── The asymmetry that decides every ambiguous case ─────────────────────────
 *
 * These two mistakes are not equally bad:
 *
 *   wrongly PROMOTE a locked-out person  -> 400 days, silent, unrecoverable.
 *                                           They simply never appear.
 *   wrongly DELETE a real member's key   -> if they ever sign up again, a
 *                                           duplicate row. Visible in the
 *                                           sheet, deletable in ten seconds.
 *
 * So ANY key whose row cannot be established with confidence is classified B,
 * never A. Uncertainty resolves toward the recoverable error. Same principle
 * that keeps event_id out of CORE_KEYS.
 *
 * ─── Why matching is measured rather than assumed ────────────────────────────
 *
 * Keys are `seen:waitlist:<handle>` where handle is a keyed HMAC of the
 * address. Rows carry that handle in `email_handle` — but `isDuplicate` landed
 * in 183e77d and `email_handle` only in e20ad9e, so a row written between them
 * would have a key and no handle, and would be misfiled as B.
 *
 * In practice that window should be empty: before the new client shipped,
 * submissions went straight to Apps Script from the old modal and never touched
 * /api/waitlist, so no key was ever written for them. But "should be empty" is
 * the kind of thing this project keeps being wrong about, so the script COUNTS
 * rows with a blank email_handle and refuses to present its classification as
 * complete if any exist.
 *
 * A rotated EMAIL_HASH_PEPPER would produce the same blind spot — old keys
 * would match nothing. Also counted, not assumed.
 */
import { readFileSync, existsSync } from 'node:fs';

const DRY_RUN = !process.argv.includes('--execute');

// ── credentials, from .env.local only ────────────────────────────────────────
const ENV_PATH = new URL('../.env.local', import.meta.url);
if (!existsSync(ENV_PATH)) {
  console.error('\n  .env.local not found. It must contain, and nothing needs to be pasted anywhere:\n');
  console.error('    UPSTASH_REDIS_REST_URL=https://…upstash.io');
  console.error('    UPSTASH_REDIS_REST_TOKEN=…\n');
  console.error('  Both are readable from the Upstash console. The file is covered by');
  console.error('  .gitignore (.env.*) and must never be committed.\n');
  process.exit(2);
}
const env = Object.fromEntries(
  readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')])
);
const URL_ = env.UPSTASH_REDIS_REST_URL;
const TOKEN = env.UPSTASH_REDIS_REST_TOKEN;
if (!URL_ || !TOKEN) {
  console.error('\n  .env.local is missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN.\n');
  process.exit(2);
}

const csvPath = process.argv.find((a) => a.endsWith('.csv'));
if (!csvPath || !existsSync(csvPath)) {
  console.error('\n  Pass an export of the Pre-orders tab as CSV:');
  console.error('    node scripts/claim-remediation.mjs ~/Desktop/preorders.csv\n');
  console.error('  It stays on your disk. Nothing is read from it but the `email_handle`');
  console.error('  column and, for rows lacking one, nothing at all — those are counted');
  console.error('  as a matching blind spot rather than guessed at.\n');
  process.exit(2);
}

async function redis(commands) {
  const res = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  return res.json();
}

// ── the sheet side: email_handle column only ─────────────────────────────────
const csv = readFileSync(csvPath, 'utf8').split('\n').filter(Boolean);
const header = csv[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
const hIdx = header.indexOf('email_handle');
if (hIdx < 0) {
  console.error(`\n  No 'email_handle' column in that export. Header was:\n    ${header.join(', ')}\n`);
  process.exit(2);
}
const rowHandles = new Set();
let rowsWithoutHandle = 0;
for (const line of csv.slice(1)) {
  const cell = (line.split(',')[hIdx] ?? '').trim().replace(/^"|"$/g, '');
  if (/^[0-9a-f]{12}$/.test(cell)) rowHandles.add(cell);
  else rowsWithoutHandle += 1;
}

// ── the keyspace side ────────────────────────────────────────────────────────
let cursor = '0';
const keys = [];
do {
  const out = await redis([['SCAN', cursor, 'MATCH', 'seen:waitlist:*', 'COUNT', '500']]);
  const [next, batch] = out[0].result;
  cursor = String(next);
  keys.push(...batch);
} while (cursor !== '0');

// Values and TTLs, batched.
const values = [];
for (let i = 0; i < keys.length; i += 100) {
  const slice = keys.slice(i, i + 100);
  const out = await redis(slice.flatMap((k) => [['GET', k], ['TTL', k]]));
  slice.forEach((k, n) => values.push({ key: k, value: out[n * 2]?.result, ttl: out[n * 2 + 1]?.result }));
}

const A = [], B = [], C = [], UNKNOWN = [];
for (const rec of values) {
  const handle = rec.key.split(':').pop();
  if (rec.value === 'committed' || rec.value === 'inflight') { C.push({ ...rec, handle }); continue; }
  if (rec.value === '1') {
    (rowHandles.has(handle) ? A : B).push({ ...rec, handle });
    continue;
  }
  // Neither legacy nor post-fix. Never guessed at.
  UNKNOWN.push({ ...rec, handle });
}

const pad = (n) => String(n).padStart(5);
console.log(`\n  ${DRY_RUN ? 'DRY RUN — nothing will be changed' : '⚠️  EXECUTE MODE'}\n`);
console.log(`  keys scanned                     ${pad(keys.length)}`);
console.log(`  sheet rows with an email_handle  ${pad(rowHandles.size)}`);
console.log(`  sheet rows WITHOUT one           ${pad(rowsWithoutHandle)}   <- matching blind spot`);
console.log();
console.log(`  A  legacy '1', row found     -> PROMOTE   ${pad(A.length)}`);
console.log(`  B  legacy '1', NO row        -> DELETE    ${pad(B.length)}`);
console.log(`  C  committed / inflight      -> LEAVE     ${pad(C.length)}`);
if (UNKNOWN.length) console.log(`  ?  unrecognised value        -> LEAVE     ${pad(UNKNOWN.length)}`);
console.log();

if (rowsWithoutHandle > 0) {
  console.log(`  ⚠️  ${rowsWithoutHandle} row(s) carry no email_handle, so they cannot be matched.`);
  console.log('     Any key belonging to one of them is currently counted in B and would be');
  console.log('     DELETED. That is the recoverable direction, but it is not nothing: those');
  console.log('     people lose duplicate protection. Resolve before executing.\n');
}

console.log('  ── POPULATION B IN FULL (handles, not addresses) ─────────────────\n');
if (!B.length) console.log('     (empty)');
for (const r of B) console.log(`     ${r.handle}   ttl=${r.ttl}s`);
console.log();

if (C.length) {
  const byValue = C.reduce((m, r) => ({ ...m, [r.value]: (m[r.value] ?? 0) + 1 }), {});
  console.log(`  C breakdown: ${Object.entries(byValue).map(([k, v]) => `${k}=${v}`).join(' ')}\n`);
}

if (DRY_RUN) {
  console.log('  Nothing was written. Re-run with --execute only after Emil says so.\n');
  process.exit(0);
}
console.error('  --execute is not implemented yet. Dry run only until the counts are agreed.\n');
process.exit(1);
