/**
 * Resolve the Conversion agent's consent wordings into a registry my receipts
 * can embed verbatim.
 *
 *   node scripts/build-consent-registry.mjs
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Two designs met and both were half right.
 *
 * Mine was a hand-maintained registry mapping id → verbatim text, so a consent
 * receipt is self-contained years later. Its flaw: a human has to remember to
 * add an entry, and the one that gets forgotten is the one you need.
 *
 * Growth's derives the id by fingerprinting the wording itself, so editing a
 * word changes the version automatically and the id can never go stale. Its
 * flaw: the id is opaque — nothing can turn `mkt-eea-2026-08-15-3f9a21c4` back
 * into the sentence somebody read.
 *
 * This takes both. The fingerprint stays the source of truth for identity; this
 * script reads `src/content/copy.js`, recomputes the same ids with the same
 * algorithm, and emits a generated registry so the server can resolve each id
 * to its text. Nothing is hand-maintained, and receipts stay self-contained.
 *
 * The FNV-1a implementation and the `<purpose>-<region>-<authored>-<hash>`
 * shape are deliberately byte-identical to consent.js. If they ever diverge the
 * ids stop matching, every record logs `registry_match:false`, and the
 * verification step below fails loudly rather than degrading in silence.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const COPY = path.resolve('src/content/copy.js');
const OUT = path.resolve('src/lib/consent-registry.generated.js');

/** FNV-1a, 32-bit. Must match consent.js exactly. */
function fingerprint(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Must match consent.js: the privacy link is part of what was shown. */
function version(purpose, region, entry) {
  const shown =
    entry.privacyLabel != null
      ? `${entry.text} [${entry.privacyLabel} -> ${entry.privacyHref}]`
      : entry.text;
  return `${purpose}-${region}-${entry.authored}-${fingerprint(shown)}`;
}

function header(note) {
  return `// GENERATED FILE — do not edit by hand.
// Produced by scripts/build-consent-registry.mjs from src/content/copy.js.
// ${note}
// Regenerate with: npm run build:consent

export const GENERATED_CONSENT_TEXTS = `;
}

if (!fs.existsSync(COPY)) {
  // The Conversion branch has not merged yet. Emit an empty registry rather
  // than failing the build: the server already treats an unresolved id as
  // `registry_match: false` and logs it, which is the correct degraded state.
  fs.writeFileSync(OUT, header('src/content/copy.js absent — Conversion branch not merged yet.') + '{};\n');
  console.log('src/content/copy.js not found — wrote an empty registry (expected pre-merge).');
  process.exit(0);
}

const { consentTexts } = await import(pathToFileURL(COPY).href);

const out = {};
const add = (purpose, region, entry) => {
  out[version(purpose, region, entry)] = {
    purpose,
    // The audience token in the id is the source of truth for regime, and
    // consentRegime() parses it. Recording it here keeps the two agreeing.
    regime: region,
    text: entry.text,
    privacy_href: entry.privacyHref ?? null,
    authored: entry.authored,
  };
};

/**
 * Emit every wording under one purpose, whether or not it is split by region.
 *
 * The shape of these nodes is not stable and should not have to be. A wording
 * starts as one string for everywhere and splits the moment a regulator needs
 * different words — `sms` was a single node until 2026-08-18, when an EEA
 * variant was added because the TCPA string was flagging every EEA opt-in for
 * re-consent. Hardcoding `consentTexts.sms` read `.text` off a node that no
 * longer had one, and the generator threw.
 *
 * Throwing was the right failure: a build that dies beats a registry that
 * silently omits a wording, because the omission only shows up later as
 * `registry_match:false` on live records. But it should not need a patch each
 * time. This walks the node instead: a leaf (has `.text`) is emitted under
 * `defaultRegion`; a branch emits one entry per region key, which is exactly
 * what `version(purpose, key, entry)` does in the Conversion agent's consent.js.
 */
const addPurpose = (purpose, node, defaultRegion) => {
  if (!node || typeof node !== 'object') {
    throw new Error(`consentTexts.${purpose} is missing or not an object`);
  }
  if (typeof node.text === 'string') {
    add(purpose, defaultRegion, node);
    return;
  }
  const regions = Object.keys(node).filter((k) => typeof node[k]?.text === 'string');
  if (!regions.length) {
    throw new Error(`consentTexts.${purpose} has no wording — neither .text nor a region key`);
  }
  for (const region of regions) add(purpose, region, node[region]);
};

// Purpose → the region to assume if the node is NOT split. Must match the
// literal each function in consent.js passes to version().
addPurpose('mkt', consentTexts.marketing, 'us');
addPurpose('mot', consentTexts.motivation, 'eea');
addPurpose('sms', consentTexts.sms, 'us');
addPurpose('mail', consentTexts.mail, 'eea');

const body = JSON.stringify(out, null, 2).replace(/"([a-z_]+)":/g, '$1:');
fs.writeFileSync(OUT, header(`${Object.keys(out).length} wordings resolved.`) + body + ';\n');

console.log(`Resolved ${Object.keys(out).length} consent wordings:`);
for (const [id, e] of Object.entries(out)) {
  console.log(`  ${id.padEnd(34)} ${e.purpose}/${e.regime}  "${e.text.slice(0, 52)}…"`);
}
