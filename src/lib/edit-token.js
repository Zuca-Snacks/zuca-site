/**
 * Edit tokens — the authority to UPDATE a row you created.
 *
 * ─── Why this exists (S23) ───────────────────────────────────────────────────
 *
 * The multi-step form saves after every screen. Steps 2–4 re-POST the whole
 * accumulated profile, hit the duplicate gate, and get a 409 that the client
 * treats as success. Every answer after the email address was discarded, in
 * production, silently.
 *
 * The obvious fix — "on duplicate, update instead of 409" — is a
 * vulnerability. It turns /api/waitlist into an UNAUTHENTICATED WRITE KEYED ON
 * AN EMAIL ADDRESS: anyone who knows or guesses a signup's address could
 * overwrite that row, including its Art 9 health answers. That is worse than
 * the data loss it fixes, and it is the patch a person reaches for under
 * pressure, so it is written down as refused rather than merely not chosen.
 *
 * An edit token is what makes the update path safe: only the browser session
 * that completed step 1 holds one.
 *
 * ─── Why it is stateless ─────────────────────────────────────────────────────
 *
 * Same construction as the confirm token in api/confirm.js, for the same
 * reasons: nothing is stored, so there is no token column to leak from the
 * sheet, no lookup table to keep consistent, and no cleanup job. The secret is
 * the only thing that needs protecting.
 *
 * ─── Why the TTL is short ────────────────────────────────────────────────────
 *
 * A confirm token lives 30 days because it travels by email and a person may be
 * on holiday. THIS one never leaves the page that minted it, and the form it
 * authorises is finished in minutes. Two hours is generous for someone who
 * wanders off mid-form and comes back; it is not a credential worth harvesting
 * from a browser hours later.
 */
import { emailHandle } from './validation.js';

/**
 * Read at CALL time, not module load.
 *
 * `api/waitlist.js` imports this at the top, so a module-scope read happens at
 * process boot — before any caller can set the variable. That made import ORDER
 * part of the contract with nothing stating it: the token minted as null and
 * the endpoint fell back to a 409, which is the exact silent failure this
 * module exists to end.
 *
 * It cost three test failures inside five minutes, in the module written to fix
 * a silent failure. A lazy read makes the question "is it configured now"
 * rather than "was it configured when someone first imported me".
 */
const secret = () => process.env.EDIT_TOKEN_SECRET || process.env.CONFIRM_TOKEN_SECRET;

/** 2 hours. Long enough to finish the form after a distraction, short enough to be worthless later. */
export const EDIT_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Domain separation.
 *
 * A confirm token and an edit token both sign `<handle>.<expiry>`. Without a
 * distinct prefix, one would verify as the other under a shared secret — and
 * EDIT_TOKEN_SECRET falls back to CONFIRM_TOKEN_SECRET precisely so this can
 * ship before a second secret is provisioned. A 30-day confirmation link
 * arriving by email would then be a 30-day licence to rewrite the row.
 *
 * The prefix is inside the signed payload, so it cannot be swapped by an
 * attacker without invalidating the signature.
 */
const SCOPE = 'edit';

const b64url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig)).slice(0, 32);
}

/** Mint an edit token for a handle. Returns null if unconfigured — never a weak token. */
export async function mintEditToken(handle, now = Date.now()) {
  if (!secret() || !/^[0-9a-f]{12}$/.test(String(handle))) return null;
  const expiry = now + EDIT_TTL_MS;
  const payload = `${SCOPE}.${handle}.${expiry}`;
  return `${payload}.${await sign(payload)}`;
}

/**
 * Verify a token against the handle it claims to authorise.
 *
 * Takes the expected handle rather than returning the token's own, because the
 * caller already knows which row is being written. Returning the handle would
 * let a caller trust the token's claim about WHICH row — the confusion that
 * turns an authorisation check into a lookup.
 *
 * Constant-time comparison, full length, signature before expiry — all for the
 * reasons set out in api/confirm.js.
 */
export async function verifyEditToken(token, expectedHandle, now = Date.now()) {
  if (!secret() || typeof token !== 'string') return false;
  if (!/^[0-9a-f]{12}$/.test(String(expectedHandle))) return false;

  const parts = token.split('.');
  if (parts.length !== 4) return false;

  const [scope, handle, expiryRaw, sig] = parts;
  if (scope !== SCOPE) return false;
  if (!/^[0-9a-f]{12}$/.test(handle)) return false;

  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry)) return false;

  const expected = await sign(`${scope}.${handle}.${expiryRaw}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);

  // The handle is compared in the same constant-time sweep as the signature.
  // A token valid for someone else's row is a forgery, not a mismatch, and
  // should not be distinguishable by timing from a bad signature.
  if (handle.length !== String(expectedHandle).length) return false;
  for (let i = 0; i < handle.length; i++) diff |= handle.charCodeAt(i) ^ String(expectedHandle).charCodeAt(i);

  if (diff !== 0) return false;
  return now <= expiry;
}
