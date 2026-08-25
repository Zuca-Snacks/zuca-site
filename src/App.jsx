/**
 * App — the landing page shell.
 *
 * Section order is the one specified in the brief:
 *   hero -> quotes+h1 -> nutshell -> 95% -> founders -> FAQ -> waitlist
 *   -> footer, with the sticky CTA overlaid on mobile.
 *
 * Four sections were DELETED on 17 Aug (Emil), not hidden:
 *   ProofStrip  — the three traction bullets above the 95% block.
 *   Numbers     — "What's actually in one".
 *   HowItsMade  — the nutshell section's process image now covers it.
 *   Flavors     — the hero covers it. Its photo-and-description boxes were not
 *                 lost: they are now a tap-to-open panel on the hero artwork.
 *
 * The waitlist form is growth's and mounts EXACTLY ONCE, inside <WaitlistSlot>.
 * The hero's email field is a presentational shell that POSTs nowhere — it
 * dispatches `zuca:hero-email` and scrolls here, and Step1Email prefills from
 * it. Two live forms on one page would mean two consent checkboxes and two
 * submit paths for one signup.
 */
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './components/ui/ui.css';
import './components/sections/sections.css';

import { useEffect } from 'react';
import useReveal from './hooks/useReveal.js';
import { captureUtm, trackPageView } from './lib/analytics.js';
import { initMetaPixel } from './lib/metaPixel.js';
import WaitlistForm from './components/waitlist/WaitlistForm.jsx';

import Header from './components/sections/Header.jsx';
import Hero from './components/sections/Hero.jsx';
import HeroCapture from './components/sections/HeroCapture.jsx';
import Nutshell from './components/sections/Nutshell.jsx';
import FiberGap from './components/sections/FiberGap.jsx';
import Founders from './components/sections/Founders.jsx';
import Faq from './components/sections/Faq.jsx';
import WaitlistSlot from './components/sections/WaitlistSlot.jsx';
import Footer from './components/sections/Footer.jsx';
import StickyCta from './components/sections/StickyCta.jsx';

export default function App() {
  useReveal();

  // UTM capture has to happen before the first event fires, so the campaign
  // that produced the visit is attached to page_view and to every signup.
  useEffect(() => {
    captureUtm();
    trackPageView();
    // Additive and independent: Plausible is untouched by this. A no-op unless
    // VITE_META_PIXEL_ID is set, and idempotent, because strict mode invokes
    // this effect twice in development and a second fbq('init') would register
    // the pixel twice and double every event after it.
    initMetaPixel();
  }, []);

  return (
    <>
      <a className="z-skip-link" href="#main">
        Skip to content
      </a>

      <Header />

      <main id="main">
        <Hero />
        <HeroCapture />
        <Nutshell />
        <FiberGap />
        <Founders />
        <Faq />
        {/* The one and only waitlist form on the page. */}
        <WaitlistSlot>
          <WaitlistForm location="waitlist" />
        </WaitlistSlot>
      </main>

      <Footer />
      <StickyCta />
    </>
  );
}
