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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

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
/**
 * Tolerates a value that wrapped onto the next line when pasted.
 *
 * A long REST token pasted into an editor with soft wrap can land as
 * `KEY=` followed by the value on its own line. Treating a bare, `=`-less line
 * as a continuation of an empty-valued key is announced when it happens, never
 * silent — and if the guess is wrong the only consequence is a 401 from
 * Upstash, which is a clean failure rather than a damaged file.
 *
 * The alternative was editing someone's credential file to tidy it, which is
 * not a thing to do on a hunch.
 */
const envLines = readFileSync(ENV_PATH, 'utf8').split('\n').map((l) => l.trim());
const env = {};
const joined = [];
for (let i = 0; i < envLines.length; i++) {
  const line = envLines[i];
  if (!/^[A-Z_]+=/.test(line)) continue;
  const key = line.slice(0, line.indexOf('='));
  let value = line.slice(line.indexOf('=') + 1).replace(/^["']|["']$/g, '');
  if (!value) {
    const next = envLines.slice(i + 1).find((l) => l !== '');
    if (next && !next.includes('=') && !next.startsWith('#')) {
      value = next.replace(/^["']|["']$/g, '');
      joined.push(key);
    }
  }
  env[key] = value;
}
if (joined.length) {
  console.log(`\n  note: ${joined.join(', ')} had an empty value and a bare line beneath it;`);
  console.log('        read as a wrapped paste. A wrong guess here shows up as a 401.');
}
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
/**
 * RFC 4180, not `split(',')`.
 *
 * 157 of 287 lines in the export contain a quoted field: `consent_receipt` is
 * JSON and addresses contain commas. Splitting on commas misaligns every one of
 * those rows, which would read some other column as `email_handle` and produce
 * a confident, wrong classification — and the wrong direction here is a
 * 400-day silent lockout.
 */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ''));
}

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const header = rows[0].map((h) => h.trim().toLowerCase());
const hIdx = header.indexOf('email_handle');
if (hIdx < 0) {
  console.error(`\n  No 'email_handle' column in that export. Header was:\n    ${header.join(', ')}\n`);
  process.exit(2);
}

// A row whose field count differs from the header is a parse failure, not a
// blank handle. Counted separately so a broken parse can never masquerade as a
// clean result.
const rowHandles = new Set();
let rowsWithoutHandle = 0;
let malformedRows = 0;
for (const r of rows.slice(1)) {
  if (r.length !== header.length) { malformedRows += 1; continue; }
  const cell = (r[hIdx] ?? '').trim();
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
console.log(`  rows that failed to parse        ${pad(malformedRows)}   <- must be 0`);
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

// ── EXECUTE ──────────────────────────────────────────────────────────────────

/**
 * The populations must still be the ones that were approved.
 *
 * This re-scans rather than trusting the dry run's classification, because the
 * keyspace is live and a signup can arrive between the two. C is allowed to
 * grow — new keys are written `committed` or `inflight` by the fixed endpoint
 * and are none of this pass's business. A and B must match EXACTLY: A is the
 * set about to be given a 400-day lifetime, B is the set about to be destroyed,
 * and neither should have moved since Emil read the numbers.
 */
const EXPECTED = { A: 149, B: 11 };
if (A.length !== EXPECTED.A || B.length !== EXPECTED.B) {
  console.error(`  ✗ POPULATIONS MOVED SINCE APPROVAL — refusing to write.`);
  console.error(`     approved  A=${EXPECTED.A} B=${EXPECTED.B}`);
  console.error(`     now       A=${A.length} B=${B.length}`);
  console.error('     Re-run the dry run, get the new numbers approved, then execute.\n');
  process.exit(1);
}

// ── 0. Snapshot BEFORE anything is written ───────────────────────────────────
// Deletion is irreversible and this costs nothing. Outside the repo, so it
// cannot be committed by accident; handles only, never addresses.
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const snapPath = `${process.env.HOME}/Desktop/zuca-claim-snapshot-${stamp}.json`;
const snapshot = {
  taken_at: new Date().toISOString(),
  source: URL_.replace(/\/\/.*@/, '//'),
  note: 'Pre-write state of every seen:waitlist:* key. Handles only, no addresses.',
  plan: { promote: A.length, delete: B.length, leave: C.length },
  keys: values.map((r) => ({ handle: r.key.split(':').pop(), value: r.value, ttl: r.ttl })),
};
writeFileSync(snapPath, JSON.stringify(snapshot, null, 2));
const readBack = JSON.parse(readFileSync(snapPath, 'utf8'));
if (readBack.keys.length !== values.length) {
  console.error(`  ✗ snapshot wrote ${readBack.keys.length} of ${values.length} keys — refusing to proceed.\n`);
  process.exit(1);
}
console.log(`  ✓ snapshot: ${snapPath}`);
console.log(`    ${readBack.keys.length} keys, read back and verified before any write\n`);

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// ── 1. A: promote ────────────────────────────────────────────────────────────
let promoted = 0;
for (const part of chunk(A, 100)) {
  const out = await redis(part.map((r) => ['SET', r.key, 'committed', 'EX', String(400 * 86400)]));
  promoted += out.filter((o) => o?.result === 'OK').length;
}
console.log(`  1. promote  ${promoted}/${A.length} returned OK`);

// ── 2. B: delete ─────────────────────────────────────────────────────────────
let deleted = 0;
for (const part of chunk(B, 100)) {
  const out = await redis(part.map((r) => ['DEL', r.key]));
  deleted += out.reduce((n, o) => n + (Number(o?.result) || 0), 0);
}
console.log(`  2. delete   ${deleted}/${B.length} keys removed`);
console.log(`  3. leave    ${C.length} untouched\n`);

// ── VERIFY BY READING EVERY VALUE BACK ───────────────────────────────────────
// A write that returned no error is not evidence of a write.
console.log('  ── END STATE, READ BACK FROM THE STORE ───────────────────────────\n');

let cur = '0';
const after = [];
do {
  const out = await redis([['SCAN', cur, 'MATCH', 'seen:waitlist:*', 'COUNT', '500']]);
  const [next, batch] = out[0].result;
  cur = String(next);
  after.push(...batch);
} while (cur !== '0');

const afterVals = [];
for (const part of chunk(after, 100)) {
  const out = await redis(part.flatMap((k) => [['GET', k], ['TTL', k]]));
  part.forEach((k, n) => afterVals.push({ handle: k.split(':').pop(), value: out[n * 2]?.result, ttl: out[n * 2 + 1]?.result }));
}
const tally = afterVals.reduce((m, r) => ({ ...m, [r.value]: (m[r.value] ?? 0) + 1 }), {});
console.log(`     keys now                ${afterVals.length}`);
console.log(`     legacy '1' remaining    ${tally['1'] ?? 0}   (must be 0)`);
console.log(`     committed               ${tally.committed ?? 0}`);
console.log(`     inflight                ${tally.inflight ?? 0}`);
console.log();

// Every deleted handle, individually.
const gone = await redis(B.map((r) => ['GET', r.key]));
const stillThere = B.filter((_, i) => gone[i]?.result !== null);
console.log('     deleted handles, each GET read back:');
B.forEach((r, i) => console.log(`       ${r.handle}  -> ${gone[i]?.result === null ? 'null' : `STILL PRESENT: ${gone[i]?.result}`}`));
console.log(`     ${stillThere.length === 0 ? '✓ all 11 return null' : `✗ ${stillThere.length} NOT deleted`}\n`);

// Three promoted handles, value and TTL from the store.
const spot = A.slice(0, 3);
const spotOut = await redis(spot.flatMap((r) => [['GET', r.key], ['TTL', r.key]]));
console.log('     spot-check, three promoted handles:');
spot.forEach((r, i) => {
  const v = spotOut[i * 2]?.result;
  const t = spotOut[i * 2 + 1]?.result;
  const days = Number.isFinite(Number(t)) ? Math.round(Number(t) / 86400) : '?';
  console.log(`       ${r.handle}  value=${v}  ttl=${t}s (~${days}d)  was: value=${r.value} ttl=${r.ttl}s`);
});
console.log();
process.exit(tally['1'] === undefined && stillThere.length === 0 ? 0 : 1);
