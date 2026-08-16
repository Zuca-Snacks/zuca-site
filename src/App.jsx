/**
 * App — the landing page shell.
 *
 * Section order is the one specified in the brief:
 *   hero -> proof -> what it is -> how it's made -> founders -> flavors -> FAQ
 *   -> waitlist -> footer, with the sticky CTA overlaid on mobile.
 *
 * The waitlist form itself is NOT here. <WaitlistSlot> renders the #waitlist
 * section and a placeholder; the conversion agent passes its form as children.
 */
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './components/ui/ui.css';
import './components/sections/sections.css';

import useReveal from './hooks/useReveal.js';

import Header from './components/sections/Header.jsx';
import Hero from './components/sections/Hero.jsx';
import ProofStrip from './components/sections/ProofStrip.jsx';
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

  return (
    <>
      <a className="z-skip-link" href="#main">
        Skip to content
      </a>

      <Header />

      <main id="main">
        <Hero />
        <ProofStrip />
        <Numbers />
        <HowItsMade />
        <Founders />
        <Flavors />
        <Faq />
        {/* Conversion agent: pass your form as children here. */}
        <WaitlistSlot />
      </main>

      <Footer />
      <StickyCta />
    </>
  );
}
