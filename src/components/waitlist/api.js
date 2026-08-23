// ─── Waitlist API client ─────────────────────────────────────────────────────
// Codes against the frozen contract in AGENTS_BRIEF.md:
//   POST /api/waitlist  →  200 {ok:true} · 400 validation · 409 duplicate
//                          · 429 rate_limited · 500 server
//
// ── The Apps Script fallback is GONE (sec/hardening merge, 16 Aug) ───────────
// This module used to hold the Google Apps Script /exec URL and fall back to it
// with `mode: "no-cors"` whenever /api/waitlist answered 404. Both are removed,
// and neither may come back:
//
//   1. The URL in the client bundle IS the vulnerability (SECURITY.md S3). Any
//      copy of it published anywhere makes the write path public, unauthen-
//      ticated and unmetered again. It is now a server-only env var, read by
//      api/waitlist.js, and it must never appear in browser code.
//   2. `no-cors` makes the response opaque, so a failed write is indistinguish-
//      able from a successful one and every submission reports success —
//      silent, unrecoverable loss of real signups (SECURITY.md S7). That is the
//      single behaviour this merge exists to eliminate; do not reintroduce a
//      "safety net" that restores it.
//
// A transport failure is now queued for replay (see enqueue/drainQueue) rather
// than optimistically declared a success. The signup is still not lost — the
// difference is that we now know it hasn't landed yet.

import { EVENTS, getUtm, getPagePath, track } from "../../lib/analytics.js";
import { CHANNEL, DIETARY, MOTIVATION, NAME, OTHER_MAX, PRICE_BAND, otherMaxFor } from "./fields.js";

const ENDPOINT = "/api/waitlist";
const COUNT_ENDPOINT = "/api/count";

const TIMEOUT_MS = 10000;
const QUEUE_KEY = "zuca_waitlist_queue_v1";
const QUEUE_MAX = 10;

/** Result codes this module returns. `duplicate` is a success for the UI. */
export const RESULT = {
  OK: "ok",
  DUPLICATE: "duplicate",
  VALIDATION: "validation",
  RATE_LIMITED: "rate_limited",
  SERVER: "server",
  /**
   * The browser is genuinely offline. This is the ONLY state that may tell
   * someone their address is saved, because it is the only one where we
   * actually queued it and know why it has not been delivered.
   */
  OFFLINE: "offline",
};

// ─── Payload ─────────────────────────────────────────────────────────────────

/**
 * Build a contract-shaped body. Only `email` and `consent_marketing` are ever
 * required; every other key is null until step 2 supplies it.
 *
 * ── Consent evidence (contract amendment, 15 Aug 2026) ──────────────────────
 * `consent_text_version` is client-supplied because the client is the only
 * party that knows which wording was rendered.
 *
 * `consent_timestamp` and `country` are **server-set and deliberately absent
 * here.** A client-supplied timestamp is not evidence and a client-supplied
 * country is not a fact — both are trivially forged and neither would survive
 * being relied on. Do not add them to this payload.
 *
 * The health opt-in has its own wording, its own identifier, and its own field:
 * `motivation_consent_text_version`. The legal basis for holding `motivation`
 * at all is that its consent was separate and unbundled, so packing both ids
 * into one string would evidence a single combined act — the exact thing
 * Art 9(2)(a) does not accept. The shape of the record matches the shape of
 * the claim.
 *
 * (The earlier interim that `+`-joined the two ids is gone. It was not just
 * superseded: the server's validator constrains version ids to
 * /^[A-Za-z0-9._-]+$/, so a joined id was a 400 — see HANDOFF-growth.md.)
 *
 * `consent_health` is the affirmative record of the Art 9 opt-in itself. The
 * server drops `motivation` entirely without it, so it is always sent
 * explicitly — including as `false`, because "no" is a fact worth recording.
 */
export const CORE_KEYS = new Set([
  "downgraded_fields",
  "name",
  "email", "zip", "motivation", "intent", "price_band", "flavor", "is_clinician",
  "referral_source", "consent_marketing", "consent_health", "consent_text_version",
  "motivation_consent_text_version", "utm", "page_path", "hp_field", "form_render_ts",
  // ⚠️ NOT OPTIONAL DATA — A PRECONDITION OF THE EMAIL BEING ACCEPTED AT ALL.
  // For a shared inbox these two are what makes the address valid. Strip them
  // on the way down and the retry fails on `role_address`, so the ladder would
  // turn a recoverable 400 into a guaranteed one — the exact opposite of its
  // job. They are in CORE and in MINIMAL for that reason, not because they are
  // valuable. buildPayload omits them entirely unless the box was ticked, so
  // for every personal signup their presence here costs nothing.
  "business_enquiry", "business_consent_text_version",
  // ⚠️ SAME CLASS AS THE BUSINESS KEYS, AND FOR A SHARPER REASON.
  // Without `edit_token` a step 2-4 save is a 409, which this client maps to
  // success — so the answers are discarded silently. A rung that strips it does
  // not degrade the record, it deletes it while reporting a save. It is a
  // precondition of the write, not a field in it.
  "edit_token",
]);

/**
 * Trim, strip control characters, cap.
 *
 * The server's FORBIDDEN_CHARS covers CR, LF, NUL and bidi overrides — the
 * injection-relevant set — but not C0 generally, so a bell character inside a
 * name is currently accepted in every free-text field. Security flagged it and
 * deliberately did NOT tighten it server-side: that is a REMOVE-class change,
 * and our ordering rule puts those client-first, or the server starts 400ing
 * payloads the client still considers valid.
 *
 * So the client goes first. Stripping C0 loses nothing — a control character
 * in a first name is never intentional — and being stricter than the server is
 * the safe direction. When security follows, this is already true and nothing
 * breaks in between.
 */
// Matching control characters is the entire point here; the rule exists to
// catch them appearing by accident. The directive has to be the line directly
// above the regex — wrapped onto two lines it disables the comment instead,
// which is how this sat red at HEAD while reading as suppressed.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

const str = (v, max) => {
  const t = typeof v === "string" ? v.replace(CONTROL_CHARS, "").trim() : "";
  return t ? t.slice(0, max) : null;
};
const arr = (v, max) => (Array.isArray(v) && v.length ? v.slice(0, max) : null);
const hasOther = (v) => (Array.isArray(v) ? v.includes("other") : v === "other");

/** E.164 or null. Matches the server's rule exactly rather than approximating it. */
export function toE164(raw) {
  const digits = String(raw || "").trim().replace(/[\s\-().]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** Two uppercase letters or null. */
const iso2 = (v) => {
  const c = String(v || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
};

export function buildPayload({
  email,
  consentMarketing,
  consentHealth = false,
  consentSms = false,
  consentPostal = false,
  consentTextVersion = null,
  motivationConsentTextVersion = null,
  smsConsentTextVersion = null,
  postalConsentTextVersion = null,
  businessEnquiry = false,
  businessConsentTextVersion = null,
  editToken = null,
  meta = null,
  profile = {},
  formRenderTs,
  hpField = "",
}) {
  const health = consentHealth === true;
  // ⚠️ A CONSENT IS A CLAIM ABOUT SOMETHING (S24).
  // The server refuses `consent_sms` with no phone and `consent_postal` with an
  // incomplete address — correctly: an opt-in that can never be acted on cannot
  // be evidenced against anything. But the checkbox and the field it describes
  // sit on the same screen, and save-on-advance fires the moment someone moves
  // on. Tick "post me something", type a street and a city, never open the
  // country Select, press Continue — that was a 400, and the ladder then paid
  // for it with seventeen fields.
  //
  // So the coupling is enforced HERE, where the pair is visible, rather than
  // discovered as an opaque rejection. Mirrors the server's rule exactly:
  // phone for SMS, and line1 + city + country for postal.
  const phoneE164 = toE164(profile.phone);
  const sms = consentSms === true && !!phoneE164;
  const postalAddr = {
    line1: str(profile.address_line1, 120),
    city: str(profile.address_city, 80),
    country: iso2(profile.address_country),
  };
  const postal = consentPostal === true && !!(postalAddr.line1 && postalAddr.city && postalAddr.country);
  // Both keys are omitted unless the box was actually ticked. A personal signup
  // must not carry `business_enquiry: false` at the floor, and — more to the
  // point — the server suppresses marketing consent for any row where this is
  // true, so sending it speculatively would silently unsubscribe people.
  const business = businessEnquiry === true;
  // Omitted entirely when absent. Step 1 has no token yet, and sending
  // `edit_token: null` would be a key the pre-S23 server rejects outright —
  // .strict() refuses on presence, not on value.
  const edit = typeof editToken === "string" && editToken ? editToken : null;

  // ── Meta Pixel dedup + click attribution ────────────────────────────────
  // ⚠️ OMITTED ENTIRELY UNLESS PRESENT. `.strict()` rejects on key presence,
  // not on value, so `event_id: null` from a client whose server predates
  // security's change would 400 EVERY submission — not just the tracked ones.
  // That is why this branch must not merge before theirs is live.
  //
  // Deliberately NOT in CORE_KEYS or MINIMAL_KEYS: these are measurement, not
  // a precondition of the write. If the ladder sheds them the signup still
  // lands, which is the right trade — losing a row to protect an analytics id
  // would be the wrong way round.
  const m = meta && typeof meta === "object" ? meta : {};
  const metaKeys = {};
  if (typeof m.event_id === "string" && m.event_id) metaKeys.event_id = m.event_id;
  if (typeof m.fbp === "string" && m.fbp) metaKeys.fbp = str(m.fbp, 255);
  if (typeof m.fbc === "string" && m.fbc) metaKeys.fbc = str(m.fbc, 255);
  const p = profile;

  return {
    // ── Core: accepted by the strict schema today ───────────────────────────
    email: String(email || "").trim().toLowerCase().slice(0, 254),
    // Cap 40, matching the server exactly. First name only — a client cap
    // above the server's is a 400 for everything in the gap.
    name: str(p.name, NAME.maxLength),
    zip: p.zip || null,
    // Health-adjacent values never travel without their Art 9 opt-in, on our
    // side as well as the server's.
    motivation: health ? arr(p.motivation, MOTIVATION.options.length) : null,
    intent: p.intent ?? null,
    price_band: p.price_band ?? null,
    flavor: p.flavor ?? null,
    is_clinician: typeof p.is_clinician === "boolean" ? p.is_clinician : null,
    referral_source: p.referral_source ?? null,
    consent_marketing: consentMarketing === true,
    consent_health: health,
    consent_text_version: consentTextVersion || null,

    // Present only for a shared-inbox signup. See CORE_KEYS for why they must
    // survive every rung of the downgrade ladder.
    ...(edit ? { edit_token: edit } : {}),
    ...metaKeys,
    ...(business
      ? {
          business_enquiry: true,
          business_consent_text_version: str(businessConsentTextVersion, 64),
        }
      : {}),
    motivation_consent_text_version: health ? motivationConsentTextVersion || null : null,
    utm: getUtm(),
    page_path: getPagePath(),
    hp_field: hpField || null,
    form_render_ts: typeof formRenderTs === "number" ? formRenderTs : null,

    // ── Extensions ──────────────────────────────────────────────────────────
    // Key names match the server's schema exactly. They are the server's
    // vocabulary where it already had one (`company`, `headcount`,
    // `address_postal_code`, `consent_postal`) and ours where it adopted ours
    // (`quantity_band` values, tri-state `office_interest`, headcount bands).
    //
    // FREE TEXT IS PAIRED WITH ITS SELECTION. The server's superRefine rejects
    // `*_other` text that arrives without the matching "other" choice, and it is
    // right to: text with no selection is uninterpretable. So the pairing is
    // enforced here as well, because state outlives the UI that set it — pick
    // "Other", type, switch to "Friend", and the string is still sitting in
    // state waiting to 400 the whole submission.
    motivation_other:
      health && hasOther(p.motivation) ? str(p.motivation_other, otherMaxFor(MOTIVATION)) : null,
    dietary: health ? arr(p.dietary, DIETARY.options.length) : null,
    dietary_other: health && hasOther(p.dietary) ? str(p.dietary_other, otherMaxFor(DIETARY)) : null,
    referral_source_other:
      p.referral_source === "other" ? str(p.referral_source_other, OTHER_MAX) : null,
    quantity_band: p.quantity_band ?? null,
    // Stored VERBATIM and never parsed. "£30ish", "$25-30" and "depends on the
    // size" are all real answers; a number extracted from any of them is a
    // guess wearing data's clothes.
    price_band_other:
      p.price_band === "other" ? str(p.price_band_other, otherMaxFor(PRICE_BAND)) : null,
    channel: arr(p.channel, CHANNEL.options.length),
    channel_other: hasOther(p.channel) ? str(p.channel_other, OTHER_MAX) : null,
    office_interest: p.office_interest ?? null,
    company: str(p.company, 80),
    headcount: p.headcount ?? null,
    research_optin: typeof p.research_optin === "boolean" ? p.research_optin : null,

    // Phone and address are inert without their own opt-in. Sending either
    // while its consent is false would be collecting on a basis we do not have.
    consent_sms: sms,
    // E.164 or nothing. The server requires /^\+[1-9]\d{7,14}$/ and rejects
    // anything else outright, so a number that cannot be normalised is dropped
    // rather than sent to fail — losing a phone number beats losing the record.
    phone: sms ? phoneE164 : null,
    sms_consent_text_version: sms ? smsConsentTextVersion || null : null,

    consent_postal: postal,
    address_line1: postal ? postalAddr.line1 : null,
    address_line2: postal ? str(p.address_line2, 120) : null,
    address_city: postal ? postalAddr.city : null,
    address_region: postal ? str(p.address_region, 80) : null,
    address_postal_code: postal ? str(p.address_postal_code, 16) : null,
    // ISO 3166-1 alpha-2, from a picker. Free text could never satisfy the
    // server's /^[A-Z]{2}$/ reliably.
    address_country: postal ? postalAddr.country : null,
    postal_consent_text_version: postal ? postalConsentTextVersion || null : null,
  };
}


// ─── Downgrade ladder ────────────────────────────────────────────────────────
// The server schema is `.strict()`: one unrecognised key rejects the WHOLE
// submission. So a 400 is retried against progressively narrower key sets
// rather than straight down to the contract minimum.
//
// Stripping to CORE on the first failure was too blunt — it threw away the
// twelve extension fields the server already accepts because of one field it
// did not. Each rung keeps everything the rung below would have discarded.
//
// SERVER_KNOWN tracks what `waitlistSchema` accepts today. Widen it as security
// converges; when it reaches every key we send, rung 2 becomes a no-op and the
// ladder costs nothing.
export const SERVER_KNOWN_KEYS = new Set([
  ...CORE_KEYS,
  "quantity_band", "office_interest", "company", "headcount", "price_band_other",
  "motivation_other", "referral_source_other",
  "channel", "channel_other", "dietary", "dietary_other", "research_optin",
  "phone", "consent_sms", "sms_consent_text_version",
  "address_line1", "address_line2", "address_city", "address_region",
  "address_postal_code", "address_country", "consent_postal",
  "postal_consent_text_version",
]);

/**
 * The irreducible floor: what the server requires and nothing else.
 *
 * Rungs 1 and 2 strip KEYS, which cannot fix a bad VALUE in a key the server
 * keeps — a retired enum member in `price_band` 400s at CORE just as it does at
 * full. This rung drops the values too, so there is always a version of the
 * record that validates. Losing every answer is bad; losing the email is the
 * failure the whole endpoint exists to prevent.
 */
export const MINIMAL_KEYS = new Set([
  "email", "consent_marketing", "consent_text_version",
  // See the note in CORE_KEYS. The floor's promise is that there is always a
  // version of the record that validates; for a role address that stops being
  // true the moment these are dropped.
  "business_enquiry", "business_consent_text_version",
  // And the floor must still be an UPDATE, or the last rescue rung writes a
  // duplicate-rejected 409 and calls it saved.
  "edit_token",
]);

/** The two blocks the server couples to a datum, and so the two most likely
 *  to be the reason a full payload was refused. */
const POSTAL_BLOCK = new Set([
  "consent_postal", "postal_consent_text_version", "address_line1", "address_line2",
  "address_city", "address_region", "address_postal_code", "address_country",
]);
const SMS_BLOCK = new Set(["consent_sms", "phone", "sms_consent_text_version"]);

const without = (base, ...blocks) =>
  new Set([...base].filter((k) => !blocks.some((b) => b.has(k))));

/**
 * Widest to narrowest. Each rung keeps everything the next one would discard.
 *
 * ⚠️ THE MIDDLE TWO RUNGS EXIST BECAUSE ONE BAD FIELD COST SEVENTEEN (S24).
 * `buildPayload` only ever emits keys the server knows, so rung 1 was always a
 * no-op and got skipped — which made CORE the FIRST rung that ever did
 * anything, and CORE drops every extension field at once. A single refused
 * address took the phone, the company, the headcount, the channel and the
 * quantity band with it, none of which had any relationship to the failure.
 *
 * The 400 body is `{ok, error}` and names no field, so the descent cannot be
 * targeted — but it can be ORDERED. These two blocks are the ones the server
 * couples to a datum, so they are the likeliest cause and are shed first,
 * cheapest-loss first. Everything unrelated survives a failure that was never
 * about it.
 */
const LADDER = [
  SERVER_KNOWN_KEYS,
  without(SERVER_KNOWN_KEYS, POSTAL_BLOCK),
  without(SERVER_KNOWN_KEYS, POSTAL_BLOCK, SMS_BLOCK),
  CORE_KEYS,
  MINIMAL_KEYS,
];

function stripTo(payload, allowed) {
  const out = {};
  for (const [k, v] of Object.entries(payload)) if (allowed.has(k)) out[k] = v;
  return out;
}

/** Keys carrying a real value that `allowed` would drop. */
function droppedBy(payload, allowed) {
  return Object.keys(payload).filter(
    (k) => !allowed.has(k) && payload[k] !== null && payload[k] !== false
  );
}

// ─── Offline queue ───────────────────────────────────────────────────────────
// A transport failure must never lose an email. Failed payloads are parked in
// localStorage and replayed on the next mount and on the next `online` event.

/**
 * Bump whenever an enum member is retired or a field's shape changes. It does
 * not gate anything — it makes a stale replay legible instead of anonymous.
 */
/**
 * Live since sec@6efe051 registered `biz-eea-2026-08-19-fc6ba471`.
 *
 * The registry is GENERATED from this repo's copy.js by their build (`npm run
 * build` runs the generator first) and is gitignored, so it cannot go stale:
 * edit the wording and the id, the registration and the gate all move together.
 * Verified by running their generator against our copy.js — it emits exactly
 * the id this client mints, resolving to Emil's approved words.
 *
 * ⚠️ DEPLOY ORDER IS THE ONE REMAINING DEPENDENCY. This id resolves only where
 * BOTH sides are present. A deploy carrying this client without sec@6efe051
 * offers the checkbox, then refuses the submission anyway — failing closed, so
 * no bad row is stored, but it looks like a dead end to the person. They merge
 * together or not at all.
 */
export const BUSINESS_BASIS_LIVE = true;

export const SCHEMA_GENERATION = "2026-08-19.servings-prices-medication";

/** Queue entries used to be bare payloads; tolerate both shapes on read. */
function unwrap(entry) {
  return entry && entry.payload ? entry : { payload: entry, meta: {} };
}

function readQueue() {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-QUEUE_MAX)));
  } catch {
    /* private mode — the in-flight retry is all we have */
  }
}

function enqueue(payload) {
  const queue = readQueue().filter((item) => unwrap(item).payload.email !== payload.email);
  queue.push({ payload, meta: { schema: SCHEMA_GENERATION, at: Date.now() } });
  writeQueue(queue);
}

function dequeue(payload) {
  writeQueue(readQueue().filter((item) => unwrap(item).payload.email !== payload.email));
}

/**
 * Replay anything stranded by a previous failure. Safe to call repeatedly.
 *
 * ⚠️ A QUEUED PAYLOAD OUTLIVES THE SCHEMA IT WAS WRITTEN AGAINST. "The client
 * stopped sending a value" is not the same as "nothing will send it again": an
 * entry written before an enum change still carries the old member, 400s on
 * replay, and — before the MINIMAL rung existed — was dequeued rather than
 * retried, losing the email silently. Any future REMOVE has to wait out the
 * queue as well as the deploy.
 *
 * Entries are stamped with the schema generation they were written under, so a
 * stale one is recognisable rather than merely unlucky. The floor rung means it
 * survives either way; the stamp is what lets us see it happened.
 */
export async function drainQueue() {
  const queue = readQueue();
  if (!queue.length) return;
  for (const entry of queue) {
    const { payload, meta } = unwrap(entry);
    if (meta.schema && meta.schema !== SCHEMA_GENERATION) {
      track(EVENTS.PAYLOAD_DOWNGRADED, { reason: "stale_queue", was: meta.schema });
    }
    const result = await post(payload);
    if (result.status !== RESULT.OFFLINE) dequeue(payload);
  }
}

// ─── Transport ───────────────────────────────────────────────────────────────

/**
 * The endpoint emits nine statuses, not the five the contract used to list.
 * 403 (origin), 405 (method), 415 (content type) are all OUR faults and are not
 * reachable from our own pages — 415 in particular cannot happen here because
 * we post JSON with an explicit Content-Type via fetch. `navigator.sendBeacon`
 * would send text/plain and earn a 415 that the ladder ignores, so the queue
 * must never be flushed with it. There is no sendBeacon in this codebase and
 * there should not be one.
 */
function statusToResult(status) {
  if (status === 200 || status === 201 || status === 204) return RESULT.OK;
  if (status === 409) return RESULT.DUPLICATE;
  if (status === 400 || status === 422) return RESULT.VALIDATION;
  if (status === 429) return RESULT.RATE_LIMITED;
  return RESULT.SERVER;
}

async function post(payload, rung = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      // Required — the endpoint answers 415 without it.
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      keepalive: true,
    });

    // Every status is now read and acted on. A 404/405 here means our own
    // endpoint is missing or misrouted, which is a deploy fault worth surfacing
    // as an error — not something to paper over with a second write path.
    // Climb down the ladder on a validation failure.
    //
    // Skip past any rung that would drop nothing: if the payload is already
    // within SERVER_KNOWN, that rung is a no-op, and stopping there because
    // "nothing to strip" leaves the real failure — a bad VALUE in a key every
    // rung keeps — unaddressed. Descend to the next rung that actually changes
    // the record, or give up honestly.
    /* 413 climbs the ladder too, not just 400.
       The brief says of a 413: "do not retry unchanged" — and the ladder is the
       one thing here that retries CHANGED. Stripping fields makes the body
       smaller, which is the actual remedy for a body over the cap, so this is
       the one status where descending is not a workaround but the fix.
       Without it a 413 mapped to SERVER, the person pressed the button again,
       and sent the identical oversized payload the brief warns against. */
    if (res.status === 400 || res.status === 413) {
      for (let next = rung; next < LADDER.length; next += 1) {
        const allowed = LADDER[next];
        const dropped = droppedBy(payload, allowed);
        if (!dropped.length) continue;
        track(EVENTS.PAYLOAD_DOWNGRADED, { rung: next + 1, dropped: dropped.length });
        const body = stripTo(payload, allowed);
        body.downgraded_fields = [
          ...new Set([...(payload.downgraded_fields || []), ...dropped]),
        ].slice(0, 64);
        return await post(body, next + 1);
      }
    }

    const result = statusToResult(res.status);
    let position = null;
    // The credential that lets steps 2-4 UPDATE the row step 1 created. Absent
    // on a 409 and absent if the server could not mint one, so every consumer
    // has to cope with not having it — which is the pre-S23 behaviour, i.e. the
    // saves 409 and the answers are lost. It is not decoration.
    let editToken = null;
    try {
      const body = await res.json();
      if (body && typeof body.position === "number") position = body.position;
      if (body && typeof body.edit_token === "string" && body.edit_token) editToken = body.edit_token;
    } catch {
      /* 204, or a body we don't need */
    }
    return { status: result, position, editToken, via: rung === 0 ? "api" : `api-rung${rung}` };
  } catch {
    /* A fetch that throws is TWO different failures wearing one coat, and they
       need opposite messages:

         browser offline        → their network. We queue it and replay, so
                                  "saved, we'll send it when you're back" is true.
         everything else        → DNS, CORS, a timeout, a missing env var in
                                  production, an endpoint that does not exist.
                                  Our fault, nothing queued, nothing saved.

       Treating both as "you look offline" told someone with perfect
       connectivity that we had kept their email while it went nowhere — a
       reassuring message is worse than a blunt one when it is false, because
       they stop trying. */
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return { status: offline ? RESULT.OFFLINE : RESULT.SERVER, via: "none" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Submit a waitlist payload.
 * Returns `{status, position?, via}`. A NETWORK result has been queued for
 * replay — the email is not lost, it is just not delivered yet.
 */
export async function submitWaitlist(payload) {
  const result = await post(payload);
  // Only a genuine offline state is queued. A 404 or a 500 is not something a
  // retry-on-reconnect fixes, and queueing it would make the UI's "we have it"
  // language true-ish in a way that hides a broken deploy.
  if (result.status === RESULT.OFFLINE) {
    enqueue(payload);
  } else {
    dequeue(payload);
  }
  return result;
}

// ─── Live count ──────────────────────────────────────────────────────────────
// Powers "you're #143" on the confirmation screen and the counter in the hero,
// the proof strip and the sticky bar.
//
// Reads our own /api/count, not the Apps Script. The browser has no way to
// reach the webhook any more, which is the point: the count route re-emits only
// the `count` field, so a change upstream cannot start leaking rows through it.

export async function fetchCount() {
  try {
    const res = await fetch(COUNT_ENDPOINT, { method: "GET" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.count === "number" ? data.count : null;
  } catch {
    return null;
  }
}
