/**
 * Accordion — used for the FAQ.
 *
 * Props
 *   items     Array<{ id: string, question: node, answer: node }>  required
 *   allowMultiple  boolean   default false (single-open behaviour)
 *   defaultOpenId  string    optionally open one item on mount
 *   onOpen    (id, index) => void   optional; fired only when an item opens,
 *             never on close. Added so the conversion agent's faq_open event
 *             survived the move off its own <details> markup — the accordion
 *             owns the interaction, growth owns what is measured.
 *
 * Accessibility
 *   - Each trigger is a <button> with aria-expanded + aria-controls.
 *   - The panel is a region labelled by its trigger, and uses the `hidden`
 *     attribute so collapsed answers are out of the a11y tree and out of
 *     find-in-page.
 *   - Headings are <h3> so the FAQ sits correctly under the section's <h2>.
 */
import { useState } from 'react';
import { warnIgnoredChildren } from './devWarn.js';

export default function Accordion({
  children,
  items = [],
  allowMultiple = false,
  defaultOpenId = null,
  onOpen,
  className = '',
}) {
  warnIgnoredChildren('Accordion', children, 'Pass the panels as the `items` array instead.');
  const [open, setOpen] = useState(() =>
    defaultOpenId ? new Set([defaultOpenId]) : new Set()
  );

  const toggle = (id, index) => {
    setOpen((prev) => {
      const next = allowMultiple ? new Set(prev) : new Set();
      if (prev.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Fired outside the updater so it runs once, not twice under StrictMode.
    if (!open.has(id)) onOpen?.(id, index);
  };

  return (
    <div className={`z-accordion ${className}`.trim()}>
      {items.map(({ id, question, answer }, index) => {
        const isOpen = open.has(id);
        return (
          <div className="z-accordion__item" key={id}>
            <h3>
              <button
                type="button"
                className="z-accordion__trigger"
                aria-expanded={isOpen}
                aria-controls={`${id}-panel`}
                id={`${id}-trigger`}
                onClick={() => toggle(id, index)}
              >
                {question}
                <svg
                  className="z-accordion__icon"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M8 2v12M2 8h12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </h3>
            <div
              className="z-accordion__panel"
              id={`${id}-panel`}
              role="region"
              aria-labelledby={`${id}-trigger`}
              hidden={!isOpen}
            >
              {answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}
