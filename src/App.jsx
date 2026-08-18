/**
 * App — the landing page shell.
 *
 * Section order is the one specified in the brief:
 *   hero -> proof -> what it is -> how it's made -> founders -> flavors -> FAQ
 *   -> waitlist -> footer, with the sticky CTA overlaid on mobile.
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
import WaitlistForm from './components/waitlist/WaitlistForm.jsx';

import Header from './components/sections/Header.jsx';
import Hero from './components/sections/Hero.jsx';
import ProofStrip from './components/sections/ProofStrip.jsx';
import FiberGap from './components/sections/FiberGap.jsx';
import Numbers from './components/sections/Numbers.jsx';
import HowItsMade from './components/sections/HowItsMade.jsx';
import Founders from './components/sections/Founders.jsx';
import Flavors from './components/sections/Flavors.jsx';
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
  }, []);

  return (
    <>
      <a className="z-skip-link" href="#main">
        Skip to content
      </a>

      <Header />

      <main id="main">
        <Hero />
        <ProofStrip />
        <FiberGap />
        <Numbers />
        <HowItsMade />
        <Founders />
        <Flavors />
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
