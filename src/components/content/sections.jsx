// ─── Conversion content sections ─────────────────────────────────────────────
// Proof strip, three-number block, and the objection-handling FAQ. All copy
// comes from src/content/copy.js — nothing is hardcoded here.
//
// These are minimum viable structures, built on tokens, so the rewritten copy
// can ship on this branch. The UI/UX agent should absorb or restyle them.

import { faq as faqCopy, numbers, proof, sections } from "../../content/copy.js";
import { EVENTS, track } from "../../lib/analytics.js";
import "./sections.css";

export function ProofStrip() {
  return (
    <ul className="zc-proof">
      {proof.map((item) => (
        <li key={item.label}>
          <span className="zc-proof-value">{item.value}</span>
          <span className="zc-proof-label">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function NumberBlock() {
  return (
    <div className="zc">
      <div className="zc-inner">
        <h2 className="zc-title">{numbers.title}</h2>
        <ul className="zc-numbers">
          {numbers.items.map((item) => (
            <li key={item.unit} className="zc-number">
              <span className="zc-number-value">{item.value}</span>
              <span className="zc-number-unit">{item.unit}</span>
              <p className="zc-number-note">{item.note}</p>
            </li>
          ))}
        </ul>
        <p className="zc-footnote">{numbers.footnote}</p>
      </div>
    </div>
  );
}

export function Faq() {
  return (
    <div className="zc">
      <div className="zc-inner">
        <h2 className="zc-title">{sections.faq.title}</h2>
        <div className="zc-faq">
          {faqCopy.map((item, i) => (
            <details
              key={item.q}
              onToggle={(e) => {
                if (e.currentTarget.open) track(EVENTS.FAQ_OPEN, { index: i });
              }}
            >
              <summary>{item.q}</summary>
              <p className="zc-faq-answer">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
