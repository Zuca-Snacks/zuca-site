/* ============================================================================
   DEV-ONLY WARNINGS FOR THE UI PRIMITIVES

   WHY THIS EXISTS
   Growth has hit the same class of bug three times, and each time the markup
   looked correct and did nothing:

     1. <OtherInput> without `show`  — rendered an invisible, inert field, so
        every free-text box in step 2 was unreachable and nothing caught it.
     2. <Button> inside a <form>     — defaulted to type="submit", so Back and
        Skip ran advance() and went FORWARD.
     3. <Select><option>…</option>   — children were discarded in favour of an
        `options` prop, so the country dropdown rendered EMPTY.

   Every one of them cost a bug report that was not a bug in feature code. The
   common shape: a component was handed something it quietly ignored.

   ⚠️ THE RULE THIS ENFORCES: a primitive may refuse what it is given, but it
   may never do so silently. A component that discards its input is
   indistinguishable from a broken one — from the outside, and from the console.

   Zero cost in production: every call sits behind import.meta.env.DEV, which
   Vite statically replaces with `false` and then dead-code-eliminates, so
   neither the check nor the message string ships.
   ========================================================================== */

/* Warn once per distinct message. A render loop would otherwise bury the
   console in the same line and train everyone to ignore it. */
const seen = new Set();

/**
 * @param {string} component  the primitive's name, e.g. 'Select'
 * @param {boolean} condition warn only when this is true
 * @param {string} message    what was ignored, and what to do instead
 */
export function warnIgnored(component, condition, message) {
  if (!import.meta.env?.DEV) return;
  if (!condition) return;
  const line = `<${component}>: ${message}`;
  if (seen.has(line)) return;
  seen.add(line);
  console.warn(line);
}

/** The common case: children handed to a component that renders none. */
export function warnIgnoredChildren(component, children, instead) {
  warnIgnored(
    component,
    children != null && children !== false,
    `was given children, which it does not render — they have been DISCARDED ` +
      `and nothing on screen reflects them. ${instead}`
  );
}
