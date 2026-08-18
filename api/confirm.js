/**
 * GET /api/confirm?t=… — the confirmed opt-in landing.
 *
 * The signup already exists by the time this is clicked. Clicking does not
 * create the record, it upgrades it: `confirmed` FALSE → TRUE.
 *
 * ── The design constraint that shaped this ──────────────────────────────────
 * Nobody leaves the dataset. An unconfirmed row stays in the sheet with
 * `confirmed=FALSE` and a timestamp, so the 10–30% who never click remain
 * visible as demand signal. What confirmation gates is the SEND LIST, not the
 * record. Two different questions — "did this person exist?" and "may we email
 * them?" — and conflating them is how a deletion policy becomes a data-loss bug.
 *
 * ── Why the token is stateless ──────────────────────────────────────────────
 * It is an HMAC over the email handle and an expiry, keyed by a server secret.
 * Nothing is stored, so there is no token column to leak from the sheet and no
 * lookup table to keep consistent. It also means the raw email never appears in
 * the URL — a confirmation link lands in browser history, `Referer` headers and
 * proxy logs, and an address in a query string is an address in all three.
 */

import { emailHandle } from '../src/lib/validation.js';

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL;
const SHEETS_WEBHOOK_TOKEN = process.env.SHEETS_WEBHOOK_TOKEN;
const CONFIRM_SECRET = process.env.CONFIRM_TOKEN_SECRET;

/** 30 days. Long enough for a holiday, short enough that a leaked link ages out. */
export const CONFIRM_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const b64url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(CONFIRM_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig)).slice(0, 32);
}

/** Build a confirmation token for an email. Exported for the send path. */
export async function mintConfirmToken(email, now = Date.now()) {
  if (!CONFIRM_SECRET) return null;
  const handle = await emailHandle(email);
  const expiry = now + CONFIRM_TTL_MS;
  const payload = `${handle}.${expiry}`;
  return `${payload}.${await sign(payload)}`;
}

/**
 * Verify without leaking why it failed.
 *
 * Length-checked before comparing, and compared in full rather than
 * short-circuiting, so a forged token cannot be tuned byte by byte against
 * response timing.
 */
export async function verifyConfirmToken(token, now = Date.now()) {
  if (!CONFIRM_SECRET || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [handle, expiryRaw, sig] = parts;
  if (!/^[0-9a-f]{12}$/.test(handle)) return null;

  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry)) return null;

  const expected = await sign(`${handle}.${expiryRaw}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;

  // Expiry is checked AFTER the signature. Checking it first would answer
  // "is this token shape valid?" for an attacker without them forging anything.
  if (now > expiry) return { handle, expired: true };
  return { handle, expired: false };
}

function page(res, status, title, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // A confirmation URL must not travel to anywhere the user navigates next.
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title} · Zuca</title>
<style>
:root{--bg:#FBF6EE;--ink:#1E1A17;--muted:#5B5148;--accent:#C2314B}
@media(prefers-color-scheme:dark){:root{--bg:#1A1008;--ink:#F0E2CC;--muted:#B8A68E;--accent:#E0798F}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);
font:400 17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:1.5rem}
main{max-width:30rem;text-align:center}h1{font-size:1.6rem;margin:0 0 .75rem}
p{color:var(--muted);margin:0 0 1rem}a{color:var(--accent)}
</style></head><body><main>${body}
<p style="margin-top:2rem"><a href="/">Back to zucasnacks.com</a></p></main></body></html>`);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end();
  }

  const token = new URL(req.url, 'http://localhost').searchParams.get('t');
  const verified = await verifyConfirmToken(token);

  if (!verified) {
    console.log(JSON.stringify({ evt: 'confirm.invalid_token' }));
    return page(res, 400, 'Link not recognised',
      `<h1>That link didn't work</h1><p>It may have been copied incompletely. Try clicking it
       directly from the email, or sign up again — you will not create a duplicate.</p>`);
  }

  if (verified.expired) {
    console.log(JSON.stringify({ evt: 'confirm.expired', handle: verified.handle }));
    return page(res, 410, 'Link expired',
      `<h1>That link has expired</h1><p>Confirmation links last 30 days. Sign up again and we
       will send a fresh one — your original answers are still on file.</p>`);
  }

  if (!SHEETS_WEBHOOK_URL) {
    console.log(JSON.stringify({ evt: 'confirm.skipped_unconfigured', handle: verified.handle }));
    return page(res, 200, 'Confirmed', `<h1>You're confirmed</h1><p>Thank you — we'll be in touch.</p>`);
  }

  try {
    const upstream = await fetch(SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'confirm',
        email_handle: verified.handle,
        confirmed_at: new Date().toISOString(),
        token: SHEETS_WEBHOOK_TOKEN,
      }),
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
  } catch (err) {
    console.log(JSON.stringify({ evt: 'confirm.failed', handle: verified.handle, reason: err.name }));
    // Idempotent, so inviting a retry is safe and better than implying the
    // person did something wrong.
    return page(res, 500, 'Something went wrong',
      `<h1>We couldn't confirm you just now</h1><p>Please try that link again in a minute.
       Your signup is safe either way.</p>`);
  }

  console.log(JSON.stringify({ evt: 'confirm.ok', handle: verified.handle }));
  return page(res, 200, 'Confirmed',
    `<h1>You're on the list</h1><p>Confirmed — we'll email you when pre-orders open, and not
     before. You can unsubscribe from any email.</p>`);
}
