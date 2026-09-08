/* ============================================================================
   Refuses to let placeholder copy reach a deploy.

   Run:  node scripts/audit-copy.mjs        (also runs as part of `npm run build`)

   WHY THIS EXISTS. The allergen FAQ answers "What's in it, and what about
   allergens?" and for a long time answered only the second half — macros, diet
   descriptors and allergens, but never the ingredients. A marked placeholder
   stood in that answer for part of 8 Sep 2026 while a real list was expected.

   That placeholder is GONE: the answer now points at the pack panel, which is
   true copy rather than a stand-in, so nothing here is currently blocked. The
   guard is kept and RETARGETED — it now fires on the marker SUBSTRING, so any
   future placeholder that carries it is caught, rather than being tied to the
   one string that has already been resolved.

   A placeholder that merely looks obvious in source is not a guard: it ships the
   moment someone builds without reading the file. So the marker is checked here
   and the build FAILS while it is present. Copy like an ingredient list is a
   food-labelling statement — shipping a fake one is worse than shipping it late,
   because a reader cannot tell it is not real.

   TO USE IT: put PLACEHOLDER_DO_NOT_SHIP inside any stand-in string you commit.
   The build will refuse to pass until it is replaced.

   Checks the BUILT OUTPUT, not the source, so it cannot be satisfied by a string
   that was edited but never rebuilt — and it verifies the built output was found
   at all, because a directory that does not exist greps as zero and would
   otherwise look exactly like success.
   ========================================================================== */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const DIST = 'dist';

/* Each entry: a marker that must NOT appear, and what to do about it.
   The ingredient marker is deliberately the SUBSTRING rather than the full
   original name, so it catches every future placeholder that follows the
   convention instead of only the one it was written for. */
const FORBIDDEN = [
  {
    marker: 'PLACEHOLDER_DO_NOT_SHIP',
    what: 'a placeholder string left in shipped copy',
    fix: 'Find it in src/content/copy.js (or wherever it was added) and replace it with real copy. Do not delete the marker to get a build through.',
  },
];

if (!existsSync(DIST)) {
  console.error(`audit-copy: ${DIST}/ does not exist — nothing was checked.`);
  console.error('Run the build first; a missing directory must not read as a pass.');
  process.exit(1);
}

/* Every text-ish file the build emits, read once. */
function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(p));
    else if (/\.(js|css|html|json|txt|xml|webmanifest)$/i.test(entry.name)) out.push(p);
  }
  return out;
}

const files = collect(DIST);
if (files.length === 0) {
  console.error(`audit-copy: ${DIST}/ contained no readable output files.`);
  process.exit(1);
}
const haystack = files.map((f) => readFileSync(f, 'utf8')).join('\n');

/* Control: a string that IS in every build. If this is missing, the haystack is
   not what we think it is and a clean result would be meaningless. */
const CONTROL = 'Zuca';
if (!haystack.includes(CONTROL)) {
  console.error(
    `audit-copy: control string ${JSON.stringify(CONTROL)} not found in ${files.length} built files.`
  );
  console.error('The check is not reading the real output, so a pass would be false. Failing.');
  process.exit(1);
}

const found = FORBIDDEN.filter((f) => haystack.includes(f.marker));

if (found.length > 0) {
  console.error(`\naudit-copy: PLACEHOLDER COPY REACHED THE BUILD — refusing to pass.\n`);
  for (const f of found) {
    console.error(`  ✗ ${f.what}`);
    console.error(`    marker: ${f.marker}`);
    console.error(`    fix:    ${f.fix}\n`);
  }
  console.error('Do not remove the marker to get a build through. Supply the real copy.\n');
  process.exit(1);
}

console.log(
  `audit-copy: ok — ${FORBIDDEN.length} placeholder marker(s) checked against ` +
    `${files.length} built files, none present.`
);
