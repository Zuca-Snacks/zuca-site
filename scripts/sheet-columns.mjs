#!/usr/bin/env node
/**
 * Derive the live sheet's column letters from the canonical COLUMNS list in
 * server/apps-script/Code.gs.
 *
 * WHY THIS IS A SCRIPT AND NOT A TABLE SOMEONE MAINTAINS
 *
 * The runbook used to carry hand-typed column letters. They were wrong in three
 * independent ways at once: built on a 6-column legacy header row when the real
 * one has 7 (so every letter was off by one), missing 11 columns added after the
 * table was written, and naming `email` as C when C is `phone` — which would
 * have had Emil verify a test signup against the wrong cell and conclude the
 * pipeline was broken when it was working.
 *
 * A letter is derived data. Deriving it by hand is how it drifts. Code.gs
 * matches on HEADER TEXT and does not care about position at all, which is
 * exactly why nothing failed loudly when the letters went stale.
 *
 *   node scripts/sheet-columns.mjs           # headers to add, one per line
 *   node scripts/sheet-columns.mjs --table   # the runbook table
 *   node scripts/sheet-columns.mjs --check   # assert the runbook matches
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The REAL legacy header row, confirmed by Emil against the live sheet on
 * 2026-08-18. An earlier version of the runbook assumed six columns. It has
 * seven, and `Source` sits between `Reason` and `Name`.
 */
const LEGACY_HEADERS = ['Timestamp', 'Email', 'Phone', 'How They Heard', 'Reason', 'Source', 'Name'];

/** Canonical key → the legacy header it resolves onto. */
const LEGACY_KEY_TO_HEADER = {
  timestamp: 'Timestamp',
  email: 'Email',
  phone: 'Phone',
  hearAbout: 'How They Heard',
  name: 'Name',
};

function colLetter(n) {
  let s = '';
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function readColumns() {
  const src = readFileSync(join(ROOT, 'server/apps-script/Code.gs'), 'utf8');
  const block = src.match(/^var COLUMNS = \[([\s\S]*?)^\];/m);
  if (!block) throw new Error('could not find `var COLUMNS = [...]` in Code.gs');
  const cols = [...block[1].matchAll(/^\s*'([a-zA-Z0-9_]+)',/gm)].map((m) => m[1]);
  // Calibration gate — the fault agent 4 caught in security:compat. An extractor
  // that silently returns nothing reports success while proving nothing.
  if (cols.length < 40) throw new Error(`extracted only ${cols.length} columns — extractor is broken, refusing to emit`);
  return cols;
}

const columns = readColumns();
const already = new Set(Object.keys(LEGACY_KEY_TO_HEADER));
const toAdd = columns.filter((c) => !already.has(c));

// Letters: legacy row occupies 0..6, new columns follow in COLUMNS order.
const letters = new Map();
for (const [key, header] of Object.entries(LEGACY_KEY_TO_HEADER)) {
  letters.set(key, colLetter(LEGACY_HEADERS.indexOf(header)));
}
toAdd.forEach((c, i) => letters.set(c, colLetter(LEGACY_HEADERS.length + i)));

const first = letters.get(toAdd[0]);
const last = letters.get(toAdd[toAdd.length - 1]);
const total = LEGACY_HEADERS.length + toAdd.length;

const mode = process.argv[2];

if (mode === '--table') {
  const half = Math.ceil(toAdd.length / 2);
  console.log('| Cell | Header | Cell | Header |');
  console.log('|---|---|---|---|');
  for (let i = 0; i < half; i++) {
    const a = toAdd[i], b = toAdd[i + half];
    const left = `| **${letters.get(a)}1** | \`${a}\` `;
    console.log(b ? `${left}| **${letters.get(b)}1** | \`${b}\` |` : `${left}| | |`);
  }
  console.log('');
  console.log(`${toAdd.length} new columns, \`${first}\` through \`${last}\`. ${total} columns total when you are done.`);
} else if (mode === '--check') {
  const doc = readFileSync(join(ROOT, 'HANDOFF-sec.md'), 'utf8');
  const bad = [];
  for (const c of toAdd) {
    const want = letters.get(c);
    // Every `X1` | `col` pairing in the doc must agree with the derived letter.
    const re = new RegExp('\\*\\*([A-Z]{1,2})1\\*\\*\\s*\\|\\s*`' + c + '`');
    const m = doc.match(re);
    if (m && m[1] !== want) bad.push(`${c}: runbook says ${m[1]}1, derived ${want}1`);
  }
  if (bad.length) {
    console.error('DRIFT — HANDOFF-sec.md column letters disagree with Code.gs:');
    bad.forEach((b) => console.error('  ' + b));
    process.exit(1);
  }
  console.log(`OK — ${toAdd.length} derived column letters agree with HANDOFF-sec.md (${first}..${last}, ${total} total).`);
} else {
  toAdd.forEach((c) => console.log(c));
  console.error(`\n# ${toAdd.length} headers, starting at ${first}1, ending ${last}1. ${total} columns total.`);
}
