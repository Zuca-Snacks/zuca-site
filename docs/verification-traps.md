# Verification traps

Failures where the CHECK was wrong, not the code. Every entry here cost real time
or nearly produced a false report, and all of them share one shape: the harness
could not distinguish "the thing is broken" from "I am not looking at the thing".

Written down because we hit the same class four times in one day, from three
different directions.

---

## The rule that would have caught all of them

**Validate the instrument against a known-positive before trusting a negative.**

If a check reports "not found" or "not visible", the first question is not *what
is broken* — it is *can this check see anything at all?* Point it at something
that is definitely working. If it cannot see that either, the finding is about
the harness.

A check that has only ever returned "fail" has not been tested. It has been run.

---

## 1. Presence is not visibility (growth, 18 Aug)

A step-2 assertion counted free-text boxes in the DOM and passed. Every box was
`inert` and `visibility: hidden` — **no user could reach any of them**, and had
not been able to since the primitive swap.

The stand-in primitive had been conditionally rendered, so "in the DOM" had
genuinely meant "on screen". The replacement always renders and gates on a `show`
prop. The assertion did not change, the meaning underneath it did.

Lint, build and the count assertion all stayed green throughout.

> Presence, visibility and interactivity are three questions. `querySelector`
> answers the first. Only the third is what a user experiences.

## 2. Clicking a toggle twice is clicking it zero times (merge session, 18 Aug)

A script selected every "Other" chip, then — in a second pass over the same
elements — selected them again, turning them all back off. It then correctly
reported the free-text boxes as hidden, because they were.

> Toggles are not idempotent. Read the state, act only if it needs changing, and
> never let two passes touch the same control.

## 3. Field names are not labels (merge session, 18 Aug)

The same script looked for a chip whose text was `other`, because the field is
called `motivation_other`. The chip on screen reads **"Somewhere else"**. Nothing
matched, so nothing was selected, so nothing was visible, so the check "failed".

> Match on what the user sees. The developer's name for a thing and the person's
> name for it are different strings, and only one of them is in the DOM.

## 4. A cap you did not set is a cap you cannot trust (growth, 18 Aug)

`DIETARY_OTHER_MAX` was declared after the object that referenced it. The
temporal dead zone blanked the entire page at runtime. Lint and build were both
green; only loading the page showed it.

> Module-scope ordering bugs do not surface at build time. Run the thing.

---

## What this cost

Trap 2 and trap 3 together nearly produced a false report that a working fix was
broken — three consecutive runs said "not visible", and the correct response
after the first was to ask whether the harness could see a control that was
known to work. It could not: it had never selected anything.

Trap 1 is the mirror image. There the harness said PASS for days while the
feature was unreachable.

Same root, opposite signs. A check that cannot fail for the right reason cannot
pass for the right reason either.
