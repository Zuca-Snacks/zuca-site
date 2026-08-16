/**
 * HowItsMade — the upcycling story, on the inverted deep-green band.
 *
 * This is the section that most needs real photography and currently has none.
 * Rather than fake it with stock imagery of somebody else's product, the
 * numbered steps carry the story typographically. The exact shots needed are
 * listed in HANDOFF-ux.md.
 *
 * ⚠️ NO INPUT-COST FIGURES. The pulp disposal price was cut on merge (growth's
 * rule, see the pricing block in src/content/copy.js): it is supplier-
 * negotiation and competitor-intelligence information, and to a consumer it
 * reads "cheap" rather than "clever". Keep the upcycling story, no number on it.
 */
import ProcessStrip from './ProcessStrip.jsx';

export default function HowItsMade() {
  return (
    <section className="z-process z-section z-reveal" id="how-its-made" aria-labelledby="process-title">
      <div className="z-container">
        <span className="z-section__eyebrow" style={{ color: 'var(--z-warm)' }}>
          How it&rsquo;s made
        </span>
        <h2 id="process-title">Apple pulp was a disposal bill. We made it the ingredient.</h2>
        <p className="z-process__lede">
          The fiber was always there. Nobody had bothered to make it taste like
          anything.
        </p>

        {/* The typographic step list was replaced by a photographic strip.
            Steps, copy and photo-status live in ProcessStrip.jsx. */}
        <ProcessStrip />
      </div>
    </section>
  );
}
