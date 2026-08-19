// ─── Shared-inbox detection — PRESENTATION ONLY ──────────────────────────────
// A copy of security's ROLE_LOCALPARTS, used for one purpose: deciding when to
// OFFER the business-enquiry checkbox. It never decides whether a submission is
// allowed. The server does that, and it is the only thing that does.
//
// ── Why a mirror is safe here, having refused one before ────────────────────
// I refused to mirror this list when the proposal was to pre-validate with it.
// A stale copy used for pre-validation fails optimistically: the first time
// security adds an entry, the client waves through an address the server will
// refuse, and the person meets an error we told them wouldn't happen.
//
// Used for presentation the direction reverses, and both drifts are survivable:
//
//   they ADD an entry we lack   → we don't offer the box up front; the server
//                                 rejects; the reactive path (any validation
//                                 failure on step 1) offers it anyway.
//   they REMOVE one we keep     → we offer a box to someone who didn't need it.
//                                 They ignore it and the submission succeeds.
//
// Neither drift can cause an acceptance the server would refuse, because this
// file grants nothing. That is the whole difference.
//
// Source: zuca-sec@02d148b src/lib/validation.js ROLE_LOCALPARTS.
const ROLE_LOCALPARTS = new Set([
  "abuse", "admin", "administrator", "all", "billing", "compliance", "contact",
  "devnull", "everyone", "ftp", "help", "hostmaster", "info", "legal", "list",
  "mail", "mailer-daemon", "marketing", "noc", "no-reply", "noreply", "null",
  "office", "postmaster", "privacy", "root", "sales", "security", "spam",
  "support", "sysadmin", "team", "test", "usenet", "uucp", "webmaster",
]);

/**
 * Does this address look like a shared inbox?
 *
 * Matches the server's comparison exactly: the local part is taken verbatim and
 * lower-cased, with no plus-address or dot stripping. If that ever diverges the
 * consequence is a missed or spurious OFFER, never a wrong verdict.
 */
export function looksLikeRoleAddress(email) {
  const local = String(email || "").split("@")[0].trim().toLowerCase();
  return local !== "" && ROLE_LOCALPARTS.has(local);
}
