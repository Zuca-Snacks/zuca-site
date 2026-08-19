/**
 * POST /api/waitlist — the only write path to the signup list.
 *
 * Why this file exists: before it, the browser called a Google Apps Script
 * webhook directly. That URL had to ship in the client bundle, which made it
 * public, which made the write endpoint public, unauthenticated and unmetered
 * (SECURITY.md, findings S1 and S3). Moving the call server-side is what lets
 * every control below exist at all — you cannot rate limit an endpoint you do
 * not own.
 *
 * Order of checks matters. Each one is cheaper than the next, so an attacker
 * pays as little of our compute as possible before being turned away:
 *   method → content-type → origin → size → rate limit → parse → validate →
 *   bot heuristics → duplicate → forward
 *
 * Responses follow the frozen contract in AGENTS_BRIEF.md and never explain
 * themselves. A 400 does not say which field failed and a 429 does not say
 * which bucket tripped; both go to the logs instead, because the difference
 * between "invalid email" and "you are rate limited on the hour bucket" is
 * exactly the feedback an attacker needs to tune around us.
 */

import {
  MAX_BODY_BYTES,
  resolveConsentText,
  reconcileConsentRegime,
  deriveCountry,
  isEea,
  validateWaitlist,
  detectBot,
  sanitizeRecord,
  emailHandle,
} from '../src/lib/validation.js';
import { checkRateLimit, isDuplicate, clientIp } from '../src/lib/ratelimit.js';
import { mintEditToken, verifyEditToken } from '../src/lib/edit-token.js';

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL;
const SHEETS_WEBHOOK_TOKEN = process.env.SHEETS_WEBHOOK_TOKEN;

/**
 * Same-origin only. The write endpoint must never answer `*` — that is what
 * turns a rate-limited endpoint into one any page on the internet can drive
 * using your visitors' browsers and their IP addresses.
 */
const ALLOWED_ORIGINS = new Set(
  [
    'https://zucasnacks.com',
    'https://www.zucasnacks.com',
    // VERCEL_URL is the DEPLOYMENT-specific host (zuca-site-a1b2c3.vercel.app).
    // Preview links are normally opened through the BRANCH alias instead
    // (zuca-site-git-sec-hardening-team.vercel.app), which is a different host,
    // so origin-matching on VERCEL_URL alone 403s every preview reached the
    // normal way. Both are ours; both belong here.
    //
    // The failure mode is nasty: the form looks broken on preview and fine in
    // production, so it reads as a deploy problem rather than an allowlist one.
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : null,
    process.env.NODE_ENV !== 'production' ? 'http://localhost:3003' : null,
    process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : null,
  ].filter(Boolean)
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function send(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Belt and braces: a JSON API has no business being framed or sniffed.
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

/**
 * Read the body with a hard ceiling, aborting mid-stream.
 *
 * Checking `content-length` alone is not enough — it is a claim by the client,
 * and a chunked request need not send one at all. Counting bytes as they
 * arrive is the only limit that actually holds.
 */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        // Pause rather than destroy. Destroying here kills the socket before
        // the 413 can be written, and the client sees a connection reset with
        // no explanation. The caller responds first, then tears down.
        req.pause();
        reject(Object.assign(new Error('body_too_large'), { code: 'TOO_LARGE' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Structured, PII-free. Never log an email address, a name, or a ZIP. */
function audit(event, fields = {}) {
  console.log(JSON.stringify({ evt: `waitlist.${event}`, ...fields }));
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const ip = clientIp(req);

  // 1. Method. POST only — no GET, no OPTIONS preflight to satisfy, because a
  //    same-origin JSON POST from our own page does not trigger one.
  if (req.method !== 'POST') {
    return send(res, 405, { ok: false, error: 'method_not_allowed' }, { Allow: 'POST' });
  }

  // 2. Content type. Requiring JSON is a CSRF control as much as a parsing one:
  //    an HTML form on another site can only send text/plain, urlencoded or
  //    multipart, so this alone blocks cross-origin form submission.
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return send(res, 415, { ok: false, error: 'unsupported_media_type' });
  }

  // 3. Origin. Present on every cross-origin fetch and on same-origin POSTs in
  //    current browsers. Absent for server-to-server callers, which we allow —
  //    they are already covered by rate limiting, and rejecting them would
  //    break legitimate curl testing without stopping any real attacker.
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    audit('reject.origin', { ip_bucket: ip.slice(0, 7) });
    return send(res, 403, { ok: false, error: 'forbidden' });
  }

  // 4. Declared size, before we read a byte.
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_BODY_BYTES) {
    return send(res, 413, { ok: false, error: 'payload_too_large' });
  }

  // 5. Rate limit. Ahead of parsing, so a flood costs us four Redis INCRs
  //    rather than a JSON parse and a schema walk.
  const rl = await checkRateLimit(req);
  if (!rl.allowed) {
    audit('reject.rate_limited', { scope: rl.scope, durable: rl.durable });
    return send(
      res,
      429,
      { ok: false, error: 'rate_limited' },
      { 'Retry-After': String(rl.retryAfter) }
    );
  }

  // 6. Read and parse.
  let raw;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch (err) {
    if (err.code === 'TOO_LARGE') {
      // Answer, then hang up. Without `Connection: close` the client may keep
      // streaming a body we have already decided not to read, and without the
      // destroy we would sit there absorbing it.
      send(res, 413, { ok: false, error: 'payload_too_large' }, { Connection: 'close' });
      req.destroy();
      return;
    }
    // Same rule as below: never refuse without saying why. There is no field to
    // name here — the body never became one — so the reason names the body.
    return send(res, 400, { ok: false, error: 'validation', refused: [{ field: '(body)', rule: 'unreadable' }] });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return send(res, 400, { ok: false, error: 'validation', refused: [{ field: '(body)', rule: 'invalid_json' }] });
  }

  // An array or a bare string parses as valid JSON but is not an object, and
  // handing either to the schema produces a confusing error rather than a clean
  // rejection.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return send(res, 400, { ok: false, error: 'validation', refused: [{ field: '(body)', rule: 'not_an_object' }] });
  }

  // 7. Validate against the frozen contract.
  const result = validateWaitlist(parsed);
  if (!result.ok) {
    /**
     * The handle is normally derived after validation, so a rejection logged
     * nothing identifying and COULD NOT BE TIED TO A PERSON. That is precisely
     * why S24 took a sheet comparison to find: the one line naming the failing
     * field existed, and there was no way to ask "what happened to THIS
     * signup".
     *
     * Derived opportunistically here instead. The email may itself be the thing
     * that failed, so this is best-effort — and it is the keyed HMAC, never the
     * address, so a log full of rejections is still not a copy of the list.
     */
    let rejectedHandle = null;
    if (typeof parsed.email === 'string' && parsed.email.length <= 254) {
      try { rejectedHandle = await emailHandle(parsed.email.trim().toLowerCase()); } catch { /* not usable */ }
    }
    audit('reject.validation', {
      handle: rejectedHandle,
      issues: result.issues.map((i) => `${i.path}:${i.rule}`),
    });
    /**
     * ─── THE RULE: this endpoint does not discard input silently. ───────────
     *
     * S24, and the fourth refusal-rendering-as-success in one day. The field
     * and rule were ALREADY COMPUTED and ALREADY LOGGED here; the response
     * omitted them on an anti-enumeration argument that does not apply to them.
     *
     * That argument protects two things, and only two:
     *   · whether an ADDRESS exists          -> the 409 stays opaque
     *   · how the BOT heuristics work        -> the honeypot 200 stays opaque
     *
     * Neither covers "which of the fields YOU sent we would not take". That
     * names our own schema, which already ships in the public client bundle,
     * and echoes no values — `result.issues` carries path and rule only, by
     * construction, so a rejection cannot become a copy of the payload.
     *
     * The line is: anything about the requester's OWN submission is theirs to
     * know. Anything about other people, or about how we spot bots, is not.
     */
    return send(res, 400, {
      ok: false,
      error: 'validation',
      refused: result.issues.map((i) => ({ field: i.path, rule: i.rule })),
    });
  }
  const data = result.data;

  // 8. Bot heuristics.
  //
  //    A tripped honeypot returns 200. This is deliberate and is the single
  //    most useful thing in the file: a bot that receives an error learns its
  //    payload was rejected and iterates until it is not. A bot that receives
  //    the same success response as everyone else has no gradient to climb, and
  //    keeps filling a field that puts it straight in the bin. A false positive
  //    here would also silently drop a real signup — but the honeypot is a
  //    hidden input, so a real user cannot fill it in the first place.
  const botReason = detectBot(data);
  if (botReason) {
    audit('reject.bot', { reason: botReason });
    return send(res, 200, { ok: true });
  }

  const handle = await emailHandle(data.email);
  /** Consent-gated discards, surfaced on the 200. See the block that fills it. */
  let droppedForResponse = [];

  // 9. Duplicates. 409 per the contract; the UI is told to treat it as success,
  //    so this is not an enumeration oracle in practice — but note the honest
  //    limitation recorded in SECURITY.md: a 200/409 distinction is observable
  //    to someone calling the API directly. It is retained because the contract
  //    is frozen, and it is defensible: rate limiting caps an enumeration attack
  //    at 20 addresses per hour per IP, which is not a viable way to test a list.
  /**
   * A repeat address is either a returning visitor or the SAME PERSON still
   * filling in the form. Until 2026-08-19 both got a 409, and because the
   * contract told the client to treat 409 as success, every step 2–4 answer
   * was discarded in production. See SECURITY.md S23.
   *
   * The difference between the two cases is an edit token, which only the
   * browser session that completed step 1 holds. Without one, this behaves
   * exactly as it always has — so the change is additive and no existing
   * client is affected by it.
   */
  const isRepeat = await isDuplicate(handle);
  const editing = isRepeat && (await verifyEditToken(data.edit_token, handle));

  if (isRepeat && !editing) {
    // No token, expired, or minted for a different row. Note that a token for
    // SOMEONE ELSE'S row lands here too, indistinguishably — an attacker who
    // signs up, gets a valid token, and points it at a victim's address gets
    // the same 409 as a returning visitor.
    /**
     * Distinguish EXPIRED from absent from wrong-row.
     *
     * Conversion has deliberately left the expiry path silent for the visitor,
     * and they are right: their spot genuinely is saved, so an error there
     * would be a lie. But it means someone who leaves the form open past the
     * 2h TTL loses their step 2–4 answers exactly as in S23 — and there is no
     * way to reissue a token without reopening the unauthenticated-write hole,
     * so the loss is real and permanent for that session.
     *
     * Silent for them does not have to mean silent for us. This is the
     * difference between knowing how often it happens and guessing, and the
     * whole reason S23 lasted was that nobody could see it.
     */
    let tokenState = 'absent';
    if (data.edit_token) {
      tokenState = (await verifyEditToken(data.edit_token, handle, 0)) ? 'expired' : 'rejected';
    }
    audit('duplicate', { handle, token: tokenState });
    /**
     * A DISTINCT CODE, not a flag on `duplicate`.
     *
     * Conversion's reasoning and it is right: a flag on a path the client maps
     * to success is exactly the kind of thing that gets read as decoration. A
     * different code cannot be ignored by a `switch` that does not know it.
     *
     * Safe to disclose. `expired` is only reachable by presenting a token whose
     * SIGNATURE is valid FOR THIS HANDLE — so the holder already completed step
     * 1 for this address and learns nothing they did not already know. A
     * stranger probing an address gets `duplicate`, exactly as before, and the
     * enumeration surface is unchanged.
     *
     * This is the difference between telling someone "you're already on the
     * list" — true, reassuring, and correct to swallow — and telling them
     * "everything you just typed was thrown away", which is neither.
     */
    return send(res, 409, {
      ok: false,
      error: tokenState === 'expired' ? 'session_expired' : 'duplicate',
    });
  }

  // 10. Derive the consent evidence, server-side.
  //
  //     `consent_timestamp` is taken from our clock, not the client's: a
  //     submitter-supplied time is worthless as evidence, and a wrong clock on
  //     one laptop would otherwise put a record outside its own retention
  //     window. `country` comes from the edge's IP geolocation and is never
  //     asked of the user — one less question on the form, and an answer that
  //     cannot be mistyped. Both are rejected by the schema if a client sends
  //     them.
  const consentTimestamp = new Date().toISOString();
  const country = deriveCountry(req);
  const consent = resolveConsentText(data.consent_text_version, 'marketing');
  const healthConsent = resolveConsentText(data.motivation_consent_text_version, 'health');
  const smsConsent = resolveConsentText(data.sms_consent_text_version, 'sms');
  const postalConsent = resolveConsentText(data.postal_consent_text_version, 'mail');
  const businessConsent = resolveConsentText(data.business_consent_text_version, 'business');

  /**
   * Whether we hold PERSONAL marketing consent, as opposed to what was ticked.
   *
   * Derived exactly once, here, and used by the stored column, the consent
   * receipt and the audit log alike. The first version of S22 computed it
   * inline in the record only — so the sheet said FALSE while the receipt in
   * the very same row said `marketing.granted: true`, and the audit log agreed
   * with the receipt. Consent evidence that contradicts itself is worse than
   * either answer alone: it proves only that we do not know.
   *
   * Same defect as everything else this week — one fact derived in three places
   * and updated in one — committed inside the change whose entire purpose was
   * to make a promise structural rather than remembered.
   */
  const holdsPersonalMarketingConsent = data.consent_marketing && !data.business_enquiry;
  const ipPrefix = ip.includes(':')
    ? ip.split(':').slice(0, 3).join(':')
    : ip.split('.').slice(0, 3).join('.') + '.0';
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 200);

  // Was the wording this person saw written for the place they actually are?
  // VPNs, travel and cached bundles guarantee this is sometimes no.
  const reconciliation = reconcileConsentRegime({
    country,
    marketingVersion: data.consent_text_version,
    healthVersion: data.consent_health ? data.motivation_consent_text_version : null,
    smsVersion: data.consent_sms ? data.sms_consent_text_version : null,
    postalVersion: data.consent_postal ? data.postal_consent_text_version : null,
    businessVersion: data.business_enquiry ? data.business_consent_text_version : null,
  });

  if (reconciliation.needs_reconsent) {
    audit('consent.regime_mismatch', { handle, reason: reconciliation.reason });
  }

  // A dropped zip means the client rendered a US-only field to someone who is
  // not in the US — i.e. the region guess missed. Harmless now, but worth
  // counting: paired with `country` this is the feedback loop for tuning that
  // guess, and the value itself is never logged.
  if (typeof parsed.zip === 'string' && parsed.zip.trim() !== '' && data.zip === null) {
    audit('zip.dropped_not_us_format', { country, len: parsed.zip.trim().length });
  }

  if (!consent.registry_match) {
    // Not fatal — see resolveConsentText. But it means this record's wording
    // cannot be reconstructed from the registry, which weakens it as evidence,
    // so it should be noticed and fixed rather than accumulating quietly.
    audit('consent.unregistered_text_version', { handle, version: consent.version });
  }

  // Health consent claimed but no wording identifier for it: the Art 9 record
  // is incomplete. Accepted rather than rejected, for the same reason as above,
  // but this is the weakest evidence state we can be in and should be loud.
  if (data.consent_health && !healthConsent.registry_match) {
    audit('consent.health_text_version_unresolved', { handle, version: healthConsent.version });
  }
  if (data.consent_sms && !smsConsent.registry_match) {
    audit('consent.sms_text_version_unresolved', { handle, version: smsConsent.version });
  }
  if (data.consent_postal && !postalConsent.registry_match) {
    audit('consent.mail_text_version_unresolved', { handle, version: postalConsent.version });
  }

  // 11. Build the record. Bot signals and the honeypot are dropped here — they
  //     are inputs to a decision already made, and storing them would put
  //     needless junk next to real data.
  //
  //     `motivation` is health-adjacent. It is retained only when the separate
  //     health opt-in is present; otherwise it is dropped on the floor, even
  //     though the user selected values. That is the point of a separate
  //     consent — selecting an option is not consenting to its storage.
  const record = sanitizeRecord({
    email: data.email,
    zip: data.zip,
    motivation: data.consent_health ? data.motivation : null,
    consent_health: data.consent_health,
    intent: data.intent,
    price_band: data.price_band,
    flavor: data.flavor,
    is_clinician: data.is_clinician,
    referral_source: data.referral_source,
    // Same health gate as `motivation` and `dietary` — an open box beside the
    // Art 9 question is Art 9 data whatever ends up in it.
    motivation_other: data.consent_health ? data.motivation_other : null,
    referral_source_other: data.referral_source_other,
    price_band_other: data.price_band_other,

    quantity_band: data.quantity_band,
    channel: data.channel,
    channel_other: data.channel_other,
    // Art 9 health data, same gate as `motivation` — the health consent wording
    // names dietary needs explicitly, so one opt-in lawfully covers both.
    dietary: data.consent_health ? data.dietary : null,
    dietary_other: data.consent_health ? data.dietary_other : null,
    research_optin: data.research_optin,
    office_interest: data.office_interest,
    company: data.company,
    headcount: data.headcount,

    // First name, optional. Written to the legacy `Name` column so new and
    // historical rows share one place. Ungated on purpose: `consent_marketing`
    // is mandatory, so a gate here would be a condition that is always true.
    name: data.name,

    // ── S22: the business basis, and the promise it rests on ───────────────
    business_enquiry: data.business_enquiry,
    business_consent_text_version: data.business_enquiry ? data.business_consent_text_version : null,

    // Phone and postal address are each stored ONLY behind their own opt-in,
    // the same rule already applied to `motivation`. Someone typing an address
    // into a form is not the same as consenting to us keeping it, and a home
    // address is the most identifying thing this form collects — it is also
    // what turns a list leak from embarrassing into dangerous (SECURITY.md S2).
    // Column is `sms_phone`, not `phone`: the sheet's existing `phone` column
    // holds legacy numbers captured without any consent, and the two must not
    // be mixed. See COLUMNS in server/apps-script/Code.gs.
    sms_phone: data.consent_sms ? data.phone : null,
    consent_sms: data.consent_sms,
    sms_consent_text_version: data.consent_sms ? smsConsent.version : null,

    address_line1: data.consent_postal ? data.address_line1 : null,
    address_line2: data.consent_postal ? data.address_line2 : null,
    address_city: data.consent_postal ? data.address_city : null,
    address_region: data.consent_postal ? data.address_region : null,
    address_postal_code: data.consent_postal ? data.address_postal_code : null,
    address_country: data.consent_postal ? data.address_country : null,
    consent_postal: data.consent_postal,
    postal_consent_text_version: data.consent_postal ? postalConsent.version : null,
    /**
     * FALSE on a business enquiry, even though the client sent `true`.
     *
     * THIS IS WHAT MAKES THE PROMISE STRUCTURAL. We told the person "it will
     * not be added to Zuca's personal mailing list". Conversion's flow is
     * submit -> rejected -> tick the business box -> resubmit, so the payload
     * arrives carrying BOTH consents, and the personal send list is built by
     * filtering `consent_marketing = TRUE`. Storing true would put a shared
     * mailbox on that list by default, and the promise would then depend on
     * whoever builds the list remembering an extra AND clause. A promise kept
     * only by remembering is not kept.
     *
     * It is also the accurate answer. A shared mailbox cannot give an
     * individual's consent — that is the entire premise of the business basis —
     * so recording `consent_marketing: TRUE` against info@ would be recording
     * a consent we could never demonstrate for any named person under Art 7(1).
     *
     * What they did tick is not lost: the receipt records
     * `personal_marketing_suppressed` so the row explains itself.
     */
    consent_marketing: holdsPersonalMarketingConsent,
    utm: data.utm,
    page_path: data.page_path,
    // ── Consent evidence (contract amendment) ──────────────────────────────
    // All three are set here, on the server, never taken from the body.
    consent_text_version: consent.version,
    consent_timestamp: consentTimestamp,
    country,

    // Supporting evidence. The IP is truncated to a /24 before storage: enough
    // to corroborate a consent record, not enough to single out a device.
    consent_ip_prefix: ipPrefix,
    user_agent: userAgent,

    // A self-contained receipt for this one person, as a single cell.
    //
    // The columns above are for querying; this is for *answering*. If someone
    // ever has to demonstrate consent for a named individual, the answer should
    // be one cell that can be copied into an email — not a reconstruction from
    // eight columns plus a version identifier that needs resolving against a
    // registry in code that has changed a dozen times since.
    //
    // So it embeds the verbatim wording rather than only its id. That is the
    // whole point: in eighteen months `2026-08-15.marketing.a` means nothing on
    // its own, but the sentence the person actually read still means exactly
    // what it meant.
    consent_receipt: JSON.stringify({
      // v4: adds the `business` block (S22). Bumped rather than extended
      // silently, because the shape changed and a reader in eighteen months
      // needs to know which shape they are holding.
      schema: 'zuca.consent.v4',
      /**
       * Explains why `marketing.granted` is false on a row where the person
       * plainly ticked a marketing box: we declined to rely on it, because a
       * shared mailbox cannot give one identifiable person's consent. Without
       * this the receipt looks like they never ticked anything, which is a
       * different and untrue story.
       */
      personal_marketing_suppressed: data.business_enquiry || undefined,
      // Four consents, recorded symmetrically and independently. Built from a
      // table rather than four hand-copied blocks: the v1 receipt hardcoded the
      // health wording and recorded no version for it, and that class of bug
      // comes from duplicating the shape by hand each time a consent is added.
      ...Object.fromEntries(
        [
          ['marketing', holdsPersonalMarketingConsent, consent],
          ['health', data.consent_health, healthConsent],
          ['sms', data.consent_sms, smsConsent],
          // `postal`, matching consent_postal and postal_consent_text_version.
          // It was `mail` — a leftover from the naming revert that renamed the
          // fields and missed the receipt block, leaving one document that said
          // postal in two places and mail in a third. Two people misread it in
          // one day, which is enough evidence that the inconsistency is not
          // cosmetic. The version string inside still carries growth's `mail-`
          // prefix, so provenance survives; that is their id, not our field.
          ['postal', data.consent_postal, postalConsent],
          // The business basis. For a role address this is the ONLY thing
          // permitting the row to exist at all — everything else is optional
          // detail, this is load-bearing.
          ['business', data.business_enquiry, businessConsent],
        ].map(([name, granted, resolved]) => [
          name,
          {
            granted,
            version: granted ? resolved.version : null,
            text: granted ? resolved.text : null,
            registry_match: granted ? resolved.registry_match : null,
          },
        ])
      ),
      timestamp: consentTimestamp,
      country,
      regime: isEea(country) ? 'eea' : 'other',
      reconciliation,
      ip_prefix: ipPrefix,
      user_agent: userAgent,
      method: 'web_form',
    }),

    // A downgraded submission is one the client had to strip to get past a
    // stricter server. Recording WHICH fields it dropped is the whole point:
    // without it an incomplete row is indistinguishable from a row where the
    // person simply skipped step 2, and "looks normal but isn't" is the failure
    // mode this entire endpoint has been built against.
    // Confirmed opt-in. Every row is written unconfirmed and STAYS in the
    // sheet whether or not the link is ever clicked — nobody leaves the
    // dataset. `confirmed` gates the send list, not the record: the 10–30% who
    // never click are demand signal, not deletions.
    email_handle: handle,
    confirmed: false,
    confirmed_at: null,

    downgraded_fields: data.downgraded_fields ? data.downgraded_fields.join(' ') : null,
    is_downgraded: Boolean(data.downgraded_fields),

    // Promoted out of the receipt into their own columns so the set is
    // filterable in the sheet. A flag buried in a JSON string is a flag nobody
    // finds, and these are exactly the records an audit would pull.
    motivation_consent_text_version: data.consent_health ? healthConsent.version : null,
    needs_reconsent: reconciliation.needs_reconsent,
    // ok | mismatch | unverifiable. Separate from the boolean because the two
    // failure modes need different work: `mismatch` means re-consent this
    // person, `unverifiable` usually means tag the version identifiers and the
    // rows resolve themselves.
    consent_regime_status: reconciliation.status,
    reconsent_reason: reconciliation.reason,
  });

  // Every consent-gated drop announces itself, not just `motivation`.
  //
  // Prompted by the Conversion agent's rule: when you make something fail
  // softer, check what it stopped announcing. Discarding a phone the visitor
  // typed but did not consent to is correct — and it produced a row identical
  // to one where they never typed anything. Those are different facts. One says
  // nothing happened; the other says the consent box is not converting, which
  // is a UI problem invisible from the data.
  //
  // Categories only. The whole point is that we did not keep the values.
  {
    const withheld = [
      data.motivation && !data.consent_health && 'motivation',
      (data.dietary || data.dietary_other) && !data.consent_health && 'dietary',
      data.phone && !data.consent_sms && 'phone',
      (data.address_line1 || data.address_city || data.address_postal_code) &&
        !data.consent_postal && 'address',
    ].filter(Boolean);
    if (withheld.length) {
      audit('gated.dropped_no_consent', { handle, fields: withheld });
      // Carried out on the 200. THIS IS THE S24 CASE: we ask someone for a
      // postal address, discard it for want of an opt-in, and answer ok:true.
      // The row is honest — the field is empty — but the PERSON was told it
      // saved, and they are the only party who can do anything about it.
      //
      // Categories, not values: naming `address` says what was lost without
      // repeating what we just refused to keep.
      droppedForResponse = withheld;
    }
  }

  // 12. Forward to the sheet, server-to-server, with a shared secret.
  //
  //     If the webhook is not configured we still return 200. The endpoint is
  //     being deployed ahead of the Apps Script rotation (SECURITY.md §8 item
  //     3), and failing signups during that window would cost real leads. The
  //     log line is the alarm.
  if (!SHEETS_WEBHOOK_URL) {
    // 500, not 200.
    //
    // This returned 200 until 2026-08-18, reasoning that the endpoint would be
    // deployed ahead of the Apps Script rotation and that failing signups in
    // that window would cost leads. That reasoning was wrong, and wrong in the
    // exact way S7 is wrong: with no webhook configured the row is not stored,
    // so a 200 does not save the lead — it loses it AND says otherwise. The
    // lead is gone either way; the only variable is whether anybody finds out.
    //
    // Caught in review by the merge session. Worth recording that I wrote the
    // S7 finding — "every submission reports success even when it fails" — and
    // then reproduced it here.
    audit('forward.skipped_unconfigured', { handle });
    return send(res, 500, { ok: false, error: 'server' });
  }

  let newCount = null;

  try {
    const upstream = await fetch(SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SHEETS_WEBHOOK_TOKEN ? { 'X-Zuca-Token': SHEETS_WEBHOOK_TOKEN } : {}),
      },
      body: JSON.stringify({
        ...record,
        token: SHEETS_WEBHOOK_TOKEN,
        // `create` appends; `update` merges into the row this handle already
        // owns. Code.gs owns the transition rules, because it is the only layer
        // that can READ the current row — encoding them here as well would be
        // the same fact in two places, which is the defect this branch has
        // spent a week removing.
        action: editing ? 'update' : 'create',
        // Stamped here, once, so every consent granted in THIS request shares a
        // moment. Code.gs applies it only to consents actually transitioning to
        // true — a health opt-in must not inherit the timestamp of the moment
        // the person typed their email, which would be evidence of something
        // that did not happen.
        observed_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8000),
      // Unlike the browser call this replaces, we can actually read the
      // response — which is the whole reason the silent-failure bug (S7) goes
      // away. Apps Script answers with a 302 to googleusercontent; follow it.
      redirect: 'follow',
    });

    if (!upstream.ok) {
      audit('forward.failed', { handle, status: upstream.status });
      return send(res, 500, { ok: false, error: 'server' });
    }

    // Mint the edit token on the way out. Only on a CREATE: an update request
    // already proved it holds one, and re-issuing would silently extend the
    // window every time the person changed a screen — a two-hour credential
    // that renews on use is not a two-hour credential.
    // The sheet reports its row count after the append. Returning it here is
    // what makes the live counter correct immediately: the client updates from
    // this response instead of issuing a follow-up GET that an edge cache would
    // happily answer with a number from before this very write.
    try {
      const body = await upstream.json();
      if (Number.isFinite(body?.count)) newCount = Math.max(0, Math.trunc(body.count));
    } catch {
      // A count we cannot read is not worth failing a successful signup over.
    }
  } catch (err) {
    audit('forward.error', { handle, reason: err.name });
    return send(res, 500, { ok: false, error: 'server' });
  }

  if (data.downgraded_fields) {
    // Loud on purpose. Once the schemas agree this should never fire in normal
    // operation, and scripts/attack-waitlist.mjs asserts exactly that — this is
    // an emergency valve with an alarm on it, not a routine code path.
    audit('reject.downgraded_payload', { handle, dropped: data.downgraded_fields });
  }

  audit('accepted', {
    handle,
    country,
    consents: [
      holdsPersonalMarketingConsent && 'marketing',
      data.consent_health && 'health',
      data.consent_sms && 'sms',
      data.consent_postal && 'mail',
      data.business_enquiry && 'business',
    ].filter(Boolean),
  });
  // `count` is additive: the contract's 200 shape is `{"ok":true}` and any
  // client ignoring the extra key behaves exactly as before.
  // `position` is growth's name and the better one for a UI that renders
  // "you're #143"; `count` is kept so nothing already reading it breaks. Same
  // number, two keys, no second request either way.
  /**
   * The edit token rides out on a CREATE only.
   *
   * An update request already proved it holds one; re-issuing on every save
   * would extend the window each time the person changed a screen, and a
   * two-hour credential that renews on use is not a two-hour credential.
   *
   * Additive, like `count` before it: a client that ignores the key behaves
   * exactly as it does today, which is what lets this ship before the client.
   */
  const editToken = editing ? null : await mintEditToken(handle);
  /**
   * SAY SO IF THE FIX IS INERT.
   *
   * mintEditToken returns null when neither EDIT_TOKEN_SECRET nor
   * CONFIRM_TOKEN_SECRET is set. The endpoint then behaves exactly as it does
   * today — steps 2–4 get a 409 and their answers are discarded — which is the
   * correct failure, but a silent one, and silence is what made S23 last as
   * long as it did.
   *
   * So an unconfigured secret is announced on every create rather than
   * discovered from an empty column weeks later.
   */
  if (!editing && !editToken) {
    audit('edit_token.unconfigured', { handle });
  }
  const payload = { ok: true };
  if (newCount !== null) {
    payload.count = newCount;
    payload.position = newCount;
  }
  if (editToken) payload.edit_token = editToken;
  if (droppedForResponse.length) payload.dropped = droppedForResponse;
  return send(res, 200, payload);
}

/**
 * Disable Vercel's automatic body parsing. We read the stream ourselves so the
 * size limit is enforced during transfer rather than after a full buffer.
 */
export const config = {
  api: { bodyParser: false },
};
