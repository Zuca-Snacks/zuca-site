import { useState, useEffect, useRef, useCallback } from "react";

const SUBS_KEY = "zuca_submissions_v1";
// Paste your Google Apps Script webhook URL here:
const SHEETS_URL  = "https://script.google.com/macros/s/AKfycbzbC2iN4t6HdqvIj5SqYCuMv6iogDO03BskH4H1cNjGmUCL6rJDKchfYpdcNUqiTHFh/exec";

// ─── Grain canvas ───────────────────────────────────────────────────────────
function useGrain(canvasRef) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    function draw() {
      const W = canvas.width  = canvas.offsetWidth;
      const H = canvas.height = canvas.offsetHeight;
      const img = ctx.createImageData(W, H);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i+1] = img.data[i+2] = v;
        img.data[i+3] = Math.random() * 18;
      }
      ctx.putImageData(img, 0, 0);
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
}

// ─── Cursor ─────────────────────────────────────────────────────────────────
function useCursor(dotRef, ringRef) {
  const mp = useRef({ x: -500, y: -500 });
  const rp = useRef({ x: -500, y: -500 });
  const raf = useRef();
  const animRing = useCallback(() => {
    rp.current.x += (mp.current.x - rp.current.x) * 0.1;
    rp.current.y += (mp.current.y - rp.current.y) * 0.1;
    if (ringRef.current) {
      ringRef.current.style.left = rp.current.x + "px";
      ringRef.current.style.top  = rp.current.y + "px";
    }
    raf.current = requestAnimationFrame(animRing);
  }, [ringRef]);
  useEffect(() => {
    raf.current = requestAnimationFrame(animRing);
    const move = (e) => {
      mp.current = { x: e.clientX, y: e.clientY };
      if (dotRef.current) {
        dotRef.current.style.left = e.clientX + "px";
        dotRef.current.style.top  = e.clientY + "px";
      }
    };
    window.addEventListener("mousemove", move);
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener("mousemove", move); };
  }, [animRing, dotRef]);
}


// ─── TypeLine component ──────────────────────────────────────────────────────
function TypeLine({ text, speed = 42, showCursor = true }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      i++; setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(iv);
    }, speed);
    return () => clearInterval(iv);
  }, [text, speed]);
  return (
    <>
      {displayed}
      {showCursor && displayed.length < text.length && (
        <span style={{ display:"inline-block", width:2, height:"1.1em", background:"rgba(232,25,44,.7)", marginLeft:2, verticalAlign:"middle", animation:"blink .8s step-end infinite" }}/>
      )}
    </>
  );
}


// ─── Animated fiber bar ──────────────────────────────────────────────────────
function FiberBar({ name, val, max, color, delay, mono }) {
  const [w, setW] = useState(0);
  const ref = useRef();
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setTimeout(() => setW((val/max)*100), delay);
    }, { threshold:.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [val, max, delay]);
  return (
    <div ref={ref} style={{ marginBottom:18 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:7 }}>
        <span style={{ fontFamily:mono, fontSize:12, letterSpacing:1, color:"rgba(44,33,22,.42)", textTransform:"uppercase" }}>{name}</span>
        <span style={{ fontFamily:mono, fontSize:13, color:color, letterSpacing:1 }}>{val}g</span>
      </div>
      <div style={{ height:5, background:"rgba(44,33,22,.08)", borderRadius:2, overflow:"hidden" }}>
        <div style={{
          height:"100%", borderRadius:2, background:color,
          width: w+"%", transition:`width 1.1s cubic-bezier(.16,1,.3,1)`,
        }}/>
      </div>
    </div>
  );
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
const css = `
@import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=IBM+Plex+Mono:wght@300;400;500&family=Nunito:wght@300;400;600;700;800&display=swap');

*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
html, body { height:100%; overflow:hidden; cursor:none; }
body { font-family:'Nunito',sans-serif; background:#1C1209; }

/* ── Cursor ── */
.c-dot {
  position:fixed; width:8px; height:8px; border-radius:50%;
  pointer-events:none; z-index:9999; transform:translate(-50%,-50%);
  background:#E8192C; transition:transform .2s;
}
.c-dot.big { transform:translate(-50%,-50%) scale(2.2); background:rgba(232,25,44,.5); }
.c-ring {
  position:fixed; pointer-events:none; z-index:9998;
  transform:translate(-50%,-50%); border-radius:50%; border:1.5px solid;
  transition:width .35s cubic-bezier(.16,1,.3,1), height .35s cubic-bezier(.16,1,.3,1), border-color .3s;
}

/* ── Grain ── */
.noise {
  position:fixed; inset:0; pointer-events:none; z-index:1000;
  width:100%; height:100%; mix-blend-mode:overlay; opacity:.5;
}

/* ── Page A — Intro (UNCHANGED) ── */
.page-a {
  position:fixed; inset:0; display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  background:#08060A; z-index:10; transition:opacity .8s ease;
}
.page-a.exit { opacity:0; pointer-events:none; transition:opacity .9s cubic-bezier(.4,0,.2,1) .1s; }
.page-a-glow {
  position:absolute; width:600px; height:600px; border-radius:50%;
  background:radial-gradient(circle,rgba(232,25,44,.09),transparent 70%);
  pointer-events:none;
  transition:transform 1s cubic-bezier(.16,1,.3,1), opacity .4s;
}
.intro-logo {
  font-family:'Lilita One',sans-serif;
  font-size:clamp(100px,18vw,220px); color:#E8192C;
  letter-spacing:4px; line-height:1; cursor:none;
  position:relative; z-index:2; user-select:none;
  transition:text-shadow .4s, transform .4s cubic-bezier(.16,1,.3,1);
  text-shadow:0 0 60px rgba(232,25,44,.18);
}
.intro-logo:hover {
  text-shadow:0 0 80px rgba(232,25,44,.55),0 0 160px rgba(232,25,44,.2);
  transform:scale(1.03);
}
.intro-logo.clicking {
  transform:scale(18);
  text-shadow:0 0 200px rgba(232,25,44,1);
  transition:transform 1.1s cubic-bezier(.4,0,.2,1), text-shadow .4s;
}
.tagline-wrap { margin-top:36px; text-align:center; position:relative; z-index:2; min-height:90px; }
.tagline-line {
  font-size:clamp(14px,1.6vw,19px); font-weight:300;
  color:rgba(250,240,215,.55); letter-spacing:.5px;
  line-height:1.9; display:block; opacity:0; transition:opacity .6s ease;
}
.tagline-line.show { opacity:1; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
.click-prompt {
  position:absolute; bottom:56px; left:50%; transform:translateX(-50%);
  font-family:'IBM Plex Mono',monospace; font-size:10px;
  letter-spacing:4px; text-transform:uppercase; color:rgba(250,240,215,.18);
  z-index:2; opacity:0; transition:opacity .8s ease;
  display:flex; align-items:center; gap:14px; white-space:nowrap;
}
.click-prompt.show { opacity:1; animation:prompt-pulse 3s ease-in-out infinite; }
.click-prompt::before, .click-prompt::after {
  content:''; display:block; height:1px; width:40px; background:rgba(250,240,215,.12);
}
@keyframes prompt-pulse { 0%,100%{opacity:.18} 50%{opacity:.5} }

/* ── Crossfade transition overlay ── */
.t-veil {
  position:fixed; inset:0; z-index:500;
  background:#0A0705;
  pointer-events:none;
  opacity:0;
  transition:opacity 0s;
}
.t-veil.darken { opacity:1; transition:opacity .7s cubic-bezier(.4,0,.6,1); }
.t-veil.lighten { opacity:0; transition:opacity .9s cubic-bezier(.4,0,.2,1); }
.t-veil.gone { display:none; }

/* ── Page B — Product ── */
.page-b {
  position:fixed; inset:0; overflow-y:auto; overflow-x:hidden;
  background:#1C1209;
  opacity:0; pointer-events:none;
  transition:opacity 1.1s cubic-bezier(.4,0,.2,1);
  z-index:20;
}
.page-b.in { opacity:1; pointer-events:auto; }

/* ── Animations ── */
@keyframes fu { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
@keyframes fi { from{opacity:0} to{opacity:1} }
@keyframes ball-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-16px)} }
@keyframes ball-float-r { 0%,100%{transform:translateY(-8px)} 50%{transform:translateY(8px)} }
@keyframes bar-scan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
@keyframes cpop { 0%{transform:scale(1)} 35%{transform:scale(1.2)} 100%{transform:scale(1)} }
@keyframes rule-in { from{transform:scaleX(0);transform-origin:left} to{transform:scaleX(1)} }

.si1{animation:fu .9s cubic-bezier(.16,1,.3,1) both .05s}
.si2{animation:fu .9s cubic-bezier(.16,1,.3,1) both .2s}
.si3{animation:fu .9s cubic-bezier(.16,1,.3,1) both .35s}
.si3b{animation:fu .9s cubic-bezier(.16,1,.3,1) both .45s}
.si4{animation:fu .9s cubic-bezier(.16,1,.3,1) both .5s}
.si5{animation:fu .9s cubic-bezier(.16,1,.3,1) both .65s}
.si6{animation:fu .9s cubic-bezier(.16,1,.3,1) both .8s}

/* ══════════════════════════════════════════════
   SECTION 1 — HERO (dark, nebula, accusation)
══════════════════════════════════════════════ */
.hero-section {
  position:relative; min-height:100vh;
  display:grid; grid-template-columns:1fr;
  overflow:hidden;
  background:#1C1209;
}

/* Very subtle warm vignette */
.hero-section::before {
  content:''; position:absolute; inset:0;
  background:radial-gradient(ellipse at 60% 50%, rgba(40,24,10,0) 0%, rgba(14,8,2,0.55) 100%);
  z-index:1; pointer-events:none;
}

/* Thin warm rule at top */
.hero-section::after {
  content:''; position:absolute; top:0; left:0; right:0;
  height:1px; background:rgba(184,92,56,.25); z-index:5;
}

.hero-left {
  position:relative; z-index:2;
  padding:120px 72px 100px;
  display:flex; flex-direction:column; justify-content:center;
  max-width:960px;
}
.hero-right { display:none; }

/* Nav strip */
.nav-strip {
  position:absolute; top:0; left:0; right:0; height:56px; z-index:10;
  display:flex; align-items:center; justify-content:space-between;
  padding:0 72px; border-bottom:1px solid rgba(184,92,56,.12);
}
.nav-logo {
  font-family:'Lilita One',sans-serif; font-size:20px;
  color:rgba(240,218,185,.9); letter-spacing:2px;
}
.nav-right {
  font-family:'IBM Plex Mono',monospace; font-size:9px;
  letter-spacing:3px; text-transform:uppercase;
  color:rgba(210,175,130,.65);
  display:flex; gap:28px; align-items:center;
}
.nav-dot { width:4px; height:4px; border-radius:50%; background:rgba(184,92,56,.5); }

/* Hero eyebrow */
.h-eyebrow {
  font-family:'IBM Plex Mono',monospace; font-size:10px;
  letter-spacing:4px; text-transform:uppercase;
  color:rgba(184,92,56,.7); margin-bottom:28px;
  display:flex; align-items:center; gap:12px;
}
.h-eyebrow::before { content:''; display:block; width:24px; height:1px; background:rgba(184,92,56,.4); }

/* Main accusation headline */
.accusation {
  font-family:'Cormorant Garamond',serif;
  line-height:.88; letter-spacing:-.5px;
  margin-bottom:40px;
}
.acc-line1 {
  display:block;
  font-size:clamp(60px,9vw,120px);
  font-weight:300; color:rgba(245,225,195,.88);
  font-style:italic;
}
.acc-line2 {
  display:block;
  font-size:clamp(80px,12vw,158px);
  font-weight:600; color:rgba(245,225,195,.92);
  font-style:normal; letter-spacing:1px;
}
.acc-line3 {
  display:block;
  font-size:clamp(52px,7vw,92px);
  font-weight:300; color:rgba(235,210,175,.72);
  font-style:italic;
}

/* Warm rule */
.red-rule {
  height:1px; background:rgba(184,92,56,.35); margin-bottom:32px;
  animation:rule-in 1s cubic-bezier(.16,1,.3,1) both .6s;
}

.hero-body {
  font-size:15px; font-weight:400; line-height:1.9;
  color:rgba(235,215,185,.7); max-width:520px; margin-bottom:44px;
  letter-spacing:.1px;
}
.hero-body strong { color:rgba(248,232,205,.95); font-weight:700; }

/* Stat pills — inline statement style */
.data-row {
  display:flex; flex-wrap:wrap; gap:10px;
  margin-bottom:44px;
}
.data-cell {
  display:flex; align-items:baseline; gap:8px;
  padding:10px 18px;
  border:1px solid rgba(184,92,56,.2);
  border-radius:2px;
  background:rgba(184,92,56,.04);
  position:relative; overflow:hidden;
}
.data-cell::after {
  content:''; position:absolute; inset:0;
  background:linear-gradient(90deg,transparent,rgba(184,92,56,.06),transparent);
  transform:translateX(-100%);
  animation:bar-scan 6s ease-in-out infinite;
}
.data-num {
  font-family:'IBM Plex Mono',monospace; font-size:22px;
  font-weight:500; color:rgba(245,225,195,.95); line-height:1;
}
.data-lbl {
  font-family:'IBM Plex Mono',monospace; font-size:9px;
  letter-spacing:2px; text-transform:uppercase;
  color:rgba(200,170,130,.6);
}

.ai-line {
  font-family:'Cormorant Garamond',serif;
  font-size:clamp(16px,1.8vw,22px); font-weight:300; font-style:italic;
  color:rgba(210,180,140,.55); margin-bottom:32px; line-height:1.5;
  letter-spacing:.2px; max-width:480px;
  border-left:2px solid rgba(184,92,56,.25);
  padding-left:16px;
}

/* CTA cluster */
.cta-cluster { display:flex; align-items:stretch; gap:16px; }
.price-block {
  background:rgba(242,228,205,.04);
  border:1px solid rgba(184,92,56,.22);
  border-radius:4px; padding:16px 20px; text-align:center;
  display:flex; flex-direction:column; justify-content:center;
}
.price-big {
  font-family:'Cormorant Garamond',serif; font-size:48px;
  font-weight:600; color:rgba(242,228,205,.9); line-height:1;
}
.price-note {
  font-family:'IBM Plex Mono',monospace; font-size:8px;
  letter-spacing:2px; color:rgba(184,92,56,.45); margin-top:5px;
}
.order-btn {
  flex:1; background:transparent; color:rgba(240,218,185,.85); border:1px solid rgba(184,92,56,.4);
  border-radius:2px; padding:0 36px;
  font-family:'Cormorant Garamond',serif; font-size:22px;
  font-weight:400; letter-spacing:2px; cursor:none;
  transition:background .25s, border-color .25s, color .25s;
  position:relative; overflow:hidden;
  display:flex; align-items:center; justify-content:center; gap:10px;
}
.order-btn::after {
  content:''; position:absolute; inset:0;
  background:rgba(184,92,56,.08);
  transform:translateX(-101%); transition:transform .35s cubic-bezier(.16,1,.3,1);
}
.order-btn:hover { border-color:rgba(184,92,56,.7); color:rgba(245,225,195,1); }
.order-btn:hover::after { transform:translateX(0); }
.confirm-txt {
  font-family:'IBM Plex Mono',monospace; font-size:12px;
  color:#3A7D44; margin-top:14px; height:18px; transition:opacity .4s;
  letter-spacing:1px;
}
.counter-row {
  display:flex; align-items:baseline; gap:10px; margin-top:24px;
}
.counter-n {
  font-family:'Cormorant Garamond',serif; font-size:48px;
  font-weight:600; color:rgba(240,218,185,.85); line-height:1;
}
.counter-n.pop { animation:cpop .4s ease; }
.counter-txt {
  font-family:'IBM Plex Mono',monospace; font-size:10px;
  letter-spacing:2px; color:rgba(200,140,80,.65); text-transform:uppercase;
}



/* ══════════════════════════════════════════════
   SECTION 2 — EVIDENCE (scientific, cream bg)
══════════════════════════════════════════════ */
.evidence-section {
  background:#F3EDE0; /* premium V2 warm cream */
  padding:100px 0;
  position:relative;
}
.evidence-inner {
  max-width:1200px; margin:0 auto; padding:0 72px;
  display:grid; grid-template-columns:1fr 1fr; gap:80px; align-items:start;
}

/* Brutalist section label */
.section-label {
  display:flex; align-items:center; gap:0;
  margin-bottom:56px;
}
.section-num {
  font-family:'IBM Plex Mono',monospace; font-size:11px;
  letter-spacing:3px; color:rgba(44,33,22,.3); padding-right:20px;
  border-right:1px solid rgba(44,33,22,.15);
}
.section-title-txt {
  font-family:'IBM Plex Mono',monospace; font-size:11px;
  letter-spacing:3px; text-transform:uppercase;
  color:rgba(44,33,22,.4); padding-left:20px;
}

.evidence-headline {
  font-family:'Cormorant Garamond',serif;
  font-size:clamp(44px,5.5vw,72px); font-weight:300;
  line-height:1.0; color:#2C2116; margin-bottom:8px;
  letter-spacing:-.5px;
}
.evidence-headline em { font-style:italic; color:rgba(184,92,56,.9); }
.evidence-sub {
  font-size:15px; font-weight:400; line-height:1.85;
  color:rgba(44,33,22,.5); margin-top:24px; max-width:380px;
}
.evidence-sub strong { color:#2C2116; font-weight:700; }

/* Chart */
.chart-head {
  font-family:'IBM Plex Mono',monospace; font-size:9px;
  letter-spacing:3px; text-transform:uppercase;
  color:rgba(44,33,22,.3); margin-bottom:32px;
  display:flex; align-items:center; gap:16px;
}
.chart-head::after { content:''; flex:1; height:1px; background:rgba(44,33,22,.12); }

/* Big stats — right column */
.big-stats {
  display:grid; grid-template-columns:1fr 1fr; gap:0;
  border:1px solid rgba(44,33,22,.1); margin-top:24px;
}
.big-stat {
  padding:28px 24px; border-right:1px solid rgba(44,33,22,.1);
  border-bottom:1px solid rgba(44,33,22,.1);
}
.big-stat:nth-child(even) { border-right:none; }
.big-stat:nth-last-child(-n+2) { border-bottom:none; }
.bs-num {
  font-family:'Cormorant Garamond',serif; font-size:52px;
  font-weight:600; line-height:1; color:rgba(184,92,56,.9); display:block; margin-bottom:6px;
}
.bs-body {
  font-size:13px; font-weight:400; line-height:1.7; color:rgba(44,33,22,.5);
}
.bs-body strong { color:#2C2116; font-weight:700; }

/* Chart footnote */
.chart-foot {
  font-family:'IBM Plex Mono',monospace; font-size:9px;
  letter-spacing:.5px; color:rgba(44,33,22,.3); margin-top:20px; line-height:1.8;
}

/* ══════════════════════════════════════════════
   SECTION 3 — PRODUCT (dark walnut, flavors)
══════════════════════════════════════════════ */
.product-section {
  background:#231408; /* rich walnut */
  padding:100px 0; position:relative; overflow:hidden;
}
.product-section::before {
  content:''; position:absolute; top:0; left:0; right:0;
  height:1px; background:rgba(242,228,205,.06);
}
.product-inner {
  max-width:1200px; margin:0 auto; padding:0 72px;
}

.product-headline {
  font-family:'Cormorant Garamond',serif;
  font-size:clamp(44px,5vw,68px); font-weight:300;
  color:rgba(245,225,195,.88); line-height:1.0; letter-spacing:-.5px;
}
.product-headline em { font-style:italic; color:rgba(184,92,56,.85); }
.product-desc {
  font-size:15px; font-weight:400; line-height:1.9;
  color:rgba(230,208,175,.65); margin-top:20px; max-width:360px;
}
.product-desc strong { color:rgba(245,225,195,.92); font-weight:700; }

/* Flavor cards — horizontal */
.flavor-grid {
  display:grid; grid-template-columns:1fr 1fr; gap:24px;
}
.flavor-card-v2 {
  border:1px solid rgba(184,92,56,.14);
  border-radius:2px; padding:32px 28px;
  position:relative; overflow:hidden;
  transition:border-color .3s; cursor:none;
  background:rgba(184,92,56,.04);
}
.flavor-card-v2:hover { border-color:rgba(184,92,56,.35); }
.flavor-card-v2::before {
  content:''; position:absolute; top:0; left:0; right:0; height:2px;
}

.fc-name-v2 {
  font-family:'Cormorant Garamond',serif;
  font-size:22px; font-weight:400; font-style:italic;
  color:rgba(248,235,215,.92); line-height:1.3; margin-bottom:10px;
}
.fc-desc {
  font-size:13px; font-weight:400; line-height:1.75;
  color:rgba(228,208,178,.72); margin-bottom:20px; font-style:normal;
}
.fc-data {
  display:flex; flex-direction:column; gap:8px;
}
.fc-data-row {
  display:flex; justify-content:space-between; align-items:center;
  padding:8px 0; border-bottom:1px solid rgba(184,92,56,.1);
}
.fc-data-row:last-child { border-bottom:none; }
.fc-data-key {
  font-family:'IBM Plex Mono',monospace; font-size:9px;
  letter-spacing:2px; text-transform:uppercase; color:rgba(242,228,205,.48);
}
.fc-data-val {
  font-family:'IBM Plex Mono',monospace; font-size:13px;
  font-weight:500; color:rgba(242,228,205,.65);
}

/* ══════════════════════════════════════════════
   SECTION 4 — FOUNDERS (editorial split)
══════════════════════════════════════════════ */
.founders-section {
  background:#EFE8D8;
  padding:100px 0; position:relative;
}
.founders-section::before {
  content:''; position:absolute; top:0; left:0; right:0;
  height:1px; background:rgba(184,92,56,.3);
}
.founders-inner {
  max-width:1200px; margin:0 auto; padding:0 72px;
}
.founders-top {
  display:grid; grid-template-columns:1fr 1fr; gap:0;
  border-bottom:1px solid rgba(44,33,22,.1); margin-bottom:0;
}
.founder-col {
  padding:48px 48px; border-right:1px solid rgba(44,33,22,.08);
  transition:background .3s;
}
.founder-col:last-child { border-right:none; }
.founder-col:hover { background:rgba(150,100,50,.04); }
.fc-index {
  font-family:'IBM Plex Mono',monospace; font-size:9px;
  letter-spacing:3px; color:rgba(44,33,22,.25); margin-bottom:28px;
  display:flex; align-items:center; gap:12px;
}
.fc-index::after { content:''; flex:1; height:1px; background:rgba(44,33,22,.1); }
.fc-name-big {
  font-family:'Cormorant Garamond',serif;
  font-size:32px; font-weight:400; color:#1E1408;
  line-height:1.1; margin-bottom:6px; letter-spacing:-.3px;
}
.fc-role {
  font-family:'IBM Plex Mono',monospace; font-size:9px;
  letter-spacing:3px; text-transform:uppercase;
  color:#E8192C; margin-bottom:24px;
}
.fc-cred-list { display:flex; flex-direction:column; gap:10px; }
.fc-cred-item {
  font-size:13px; font-weight:400; color:rgba(44,33,22,.68);
  line-height:1.5; padding-left:16px; position:relative;
}
.fc-cred-item::before {
  content:'—'; position:absolute; left:0; color:#E8192C;
  font-family:'Cormorant Garamond',serif;
}

/* Backed-by row */
.backed-row {
  padding:32px 48px;
  display:flex; align-items:center; gap:32px;
  border-top:1px solid rgba(44,33,22,.08);
  background:rgba(150,100,50,.05);
  flex-wrap:wrap;
}
.backed-lbl {
  font-family:'IBM Plex Mono',monospace; font-size:9px;
  letter-spacing:3px; text-transform:uppercase;
  color:rgba(44,33,22,.45); white-space:nowrap;
  display:flex; align-items:center; gap:14px;
}
.backed-lbl::after { content:''; width:20px; height:1px; background:rgba(44,33,22,.15); }
.backed-names { display:flex; gap:10px; flex-wrap:wrap; }
.b-chip {
  font-family:'IBM Plex Mono',monospace; font-size:9px;
  letter-spacing:2px; text-transform:uppercase;
  padding:5px 14px; border:1px solid rgba(120,80,40,.18);
  color:rgba(44,33,22,.55); border-radius:1px;
}

/* ══════════════════════════════════════════════
   FOOTER CTA (dark, final)
══════════════════════════════════════════════ */
.footer-cta {
  background:#1A1008; padding:64px 72px 80px;
  border-top:1px solid rgba(184,92,56,.15);
  display:grid; grid-template-columns:1fr 1fr;
  align-items:end; gap:80px; max-width:1200px; margin:0 auto;
}
.footer-left {}
.footer-headline {
  font-family:'Cormorant Garamond',serif;
  font-size:clamp(44px,5.5vw,74px); font-weight:300;
  line-height:.95; color:rgba(245,225,195,.88); letter-spacing:-.5px;
}
.footer-headline em { font-style:italic; color:rgba(184,92,56,.85); }
.footer-sub {
  font-family:'IBM Plex Mono',monospace; font-size:10px;
  letter-spacing:3px; color:rgba(200,145,80,.7); margin-top:24px;
  text-transform:uppercase;
}
.footer-right {
  display:flex; flex-direction:column; align-items:flex-end; gap:20px;
}
.footer-price {
  font-family:'Cormorant Garamond',serif;
  font-size:88px; font-weight:600; color:rgba(245,225,195,.88); line-height:1;
}
.footer-price-note {
  font-family:'IBM Plex Mono',monospace; font-size:9px;
  letter-spacing:3px; color:rgba(200,145,80,.65); text-align:right;
}
.footer-btn {
  background:transparent; color:rgba(240,218,185,.85); border:1px solid rgba(184,92,56,.4);
  border-radius:2px; padding:18px 48px;
  font-family:'Cormorant Garamond',serif; font-size:22px;
  font-weight:400; letter-spacing:2px; cursor:none;
  transition:background .25s, border-color .25s, color .25s;
  position:relative; overflow:hidden;
}
.footer-btn::after {
  content:''; position:absolute; inset:0;
  background:rgba(184,92,56,.08);
  transform:translateX(-101%); transition:transform .35s cubic-bezier(.16,1,.3,1);
}
.footer-btn:hover { border-color:rgba(184,92,56,.7); color:rgba(245,225,195,1); }
.footer-btn:hover::after { transform:translateX(0); }
.footer-counter {
  font-family:'IBM Plex Mono',monospace; font-size:12px;
  letter-spacing:2px; color:rgba(200,145,80,.65); text-align:right;
}
.footer-counter strong { color:rgba(184,92,56,.8); font-weight:400; font-size:18px; font-family:'Cormorant Garamond',serif; }
.footer-confirm {
  font-family:'IBM Plex Mono',monospace; font-size:11px;
  color:#3A7D44; letter-spacing:1px; height:18px; transition:opacity .4s;
}

.site-footer {
  background:#120A04; padding:24px 72px;
  display:flex; justify-content:space-between; align-items:center;
  border-top:1px solid rgba(184,92,56,.1);
}
.sf-logo { font-family:'Lilita One',sans-serif; font-size:18px; color:rgba(184,92,56,.7); }
.sf-copy { font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:2px; color:rgba(184,92,56,.3); }

@media(max-width:900px){
  .hero-section,.evidence-inner,.product-top,.flavor-grid,.founders-top,.footer-cta{grid-template-columns:1fr;}
  .hero-right{min-height:280px;}
  .hero-left{padding:80px 32px 48px;}
  .process-inner,.backed-row,.founders-inner,.product-inner,.evidence-inner,.footer-cta{padding:0 28px;}
  .steps-grid{grid-template-columns:1fr 1fr;}
  body,html{overflow:auto;} .page-b{overflow-y:auto;}
  .footer-right{align-items:flex-start;}
  .footer-price{font-size:64px;}
}
/* ══════════════════════════════════════════════
   PRE-ORDER MODAL
══════════════════════════════════════════════ */
.modal-backdrop {
  position:fixed; inset:0; z-index:600;
  background:rgba(10,6,2,.75);
  backdrop-filter:blur(6px);
  display:flex; align-items:center; justify-content:center;
  opacity:0; pointer-events:none;
  transition:opacity .35s ease;
}
.modal-backdrop.open { opacity:1; pointer-events:auto; }

.modal-box {
  background:#1C1209;
  border:1px solid rgba(184,92,56,.25);
  border-radius:2px;
  padding:48px 52px;
  width:100%; max-width:480px;
  position:relative;
  transform:translateY(20px);
  transition:transform .4s cubic-bezier(.16,1,.3,1);
}
.modal-backdrop.open .modal-box { transform:translateY(0); }

.modal-close {
  position:absolute; top:20px; right:24px;
  background:none; border:none; cursor:none;
  font-family:'IBM Plex Mono',monospace; font-size:11px;
  letter-spacing:2px; color:rgba(200,170,130,.4);
  text-transform:uppercase; transition:color .2s;
}
.modal-close:hover { color:rgba(200,170,130,.8); }

.modal-eyebrow {
  font-family:'IBM Plex Mono',monospace; font-size:9px;
  letter-spacing:4px; text-transform:uppercase;
  color:rgba(184,92,56,.65); margin-bottom:20px;
  display:flex; align-items:center; gap:10px;
}
.modal-eyebrow::before { content:''; width:18px; height:1px; background:rgba(184,92,56,.4); }

.modal-headline {
  font-family:'Cormorant Garamond',serif;
  font-size:32px; font-weight:300; font-style:italic;
  color:rgba(245,225,195,.9); line-height:1.15;
  margin-bottom:32px;
}

.modal-field { margin-bottom:20px; }
.modal-label {
  font-family:'IBM Plex Mono',monospace; font-size:9px;
  letter-spacing:3px; text-transform:uppercase;
  color:rgba(200,170,130,.5); display:block; margin-bottom:8px;
}
.modal-input {
  width:100%; background:rgba(245,225,195,.04);
  border:1px solid rgba(184,92,56,.22);
  border-radius:2px; padding:13px 16px;
  font-family:'Nunito',sans-serif; font-size:15px;
  color:rgba(245,225,195,.88);
  outline:none; cursor:none;
  transition:border-color .2s, background .2s;
}
.modal-input::placeholder { color:rgba(200,170,130,.3); }
.modal-input:focus {
  border-color:rgba(184,92,56,.55);
  background:rgba(245,225,195,.06);
}

.modal-select {
  width:100%; padding:11px 14px;
  background:rgba(245,225,195,.04);
  border:1px solid rgba(184,92,56,.25);
  border-radius:4px;
  color:rgba(245,225,195,.85);
  font-family:'IBM Plex Mono',monospace; font-size:11px;
  letter-spacing:.4px;
  appearance:none; -webkit-appearance:none;
  cursor:pointer;
}
.modal-select:focus { border-color:rgba(184,92,56,.55); outline:none; }
.modal-select option { background:#1C1209; color:rgba(245,225,195,.85); }


  font-family:'IBM Plex Mono',monospace; font-size:9px;
  letter-spacing:.5px; color:rgba(200,170,130,.35);
  margin-bottom:28px; line-height:1.7;
}

.modal-submit {
  width:100%; background:transparent;
  border:1px solid rgba(184,92,56,.45); border-radius:2px;
  padding:15px 20px;
  font-family:'Cormorant Garamond',serif; font-size:20px;
  font-weight:400; letter-spacing:2px;
  color:rgba(240,218,185,.85); cursor:none;
  transition:background .25s, border-color .25s, color .25s;
  position:relative; overflow:hidden;
}
.modal-submit::after {
  content:''; position:absolute; inset:0;
  background:rgba(184,92,56,.1);
  transform:translateX(-101%); transition:transform .35s cubic-bezier(.16,1,.3,1);
}
.modal-submit:hover { border-color:rgba(184,92,56,.75); color:rgba(245,225,195,1); }
.modal-submit:hover::after { transform:translateX(0); }
.modal-submit:disabled { opacity:.45; cursor:default; }

.modal-success {
  text-align:center; padding:16px 0;
}
.modal-success-icon {
  font-size:36px; margin-bottom:16px; display:block;
}
.modal-success-head {
  font-family:'Cormorant Garamond',serif;
  font-size:26px; font-weight:300; font-style:italic;
  color:rgba(245,225,195,.9); margin-bottom:10px;
}
.modal-success-sub {
  font-family:'IBM Plex Mono',monospace; font-size:10px;
  letter-spacing:2px; color:rgba(184,92,56,.6); text-transform:uppercase;
}
.modal-err {
  font-family:'IBM Plex Mono',monospace; font-size:10px;
  letter-spacing:1px; color:#c0392b; margin-top:12px;
}
.modal-dup {
  font-family:'IBM Plex Mono',monospace; font-size:10px;
  letter-spacing:1px; color:rgba(184,92,56,.75); margin-top:12px;
}

`;

const LINES = [
  "A Michelin-trained chef and a Stanford physician,",
  "building the snack brand that clinicians recommend",
  "and patients love.",
];

const MONO = "'IBM Plex Mono', monospace";

export default function ZucaGate() {
  const [phase, setPhase]         = useState("intro");
  const [line1, setLine1]         = useState(false);
  const [line2, setLine2]         = useState(false);
  const [line3, setLine3]         = useState(false);
  const [prompt, setPrompt]       = useState(false);
  const [logoClick, setLogoClick] = useState(false);
  const [hov, setHov]             = useState(false);
  const [clicks, setClicks]       = useState(null);
  const [pop, setPop]             = useState(false);
  const [conf, setConf]           = useState(false);
  const [conf2, setConf2]         = useState(false);
  const [veil, setVeil]           = useState("idle"); // idle | darken | lighten | gone
  const [productIn, setProductIn] = useState(false);
  // Modal state
  const [modal, setModal]         = useState(false);
  const [name, setName]           = useState("");
  const [email, setEmail]         = useState("");
  const [phone, setPhone]         = useState("");
  const [hearAbout, setHearAbout] = useState("");
  const [reason, setReason]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isDup, setIsDup]         = useState(false);
  const [formErr, setFormErr]     = useState("");

  const noiseRef = useRef();
  const dotRef   = useRef();
  const ringRef  = useRef();

  useGrain(noiseRef);
  useCursor(dotRef, ringRef);

  useEffect(() => {
    const t1 = setTimeout(() => setLine1(true),  900);
    const t2 = setTimeout(() => setLine2(true), 2800);
    const t3 = setTimeout(() => setLine3(true), 4600);
    const t4 = setTimeout(() => setPrompt(true), 6200);
    return () => [t1,t2,t3,t4].forEach(clearTimeout);
  }, []);

  useEffect(() => {
    fetch(SHEETS_URL)
      .then(r => r.json())
      .then(d => setClicks(typeof d.count === "number" ? d.count : 0))
      .catch(() => setClicks(0));
  }, []);

  function handleBuy() { setModal(true); setSubmitted(false); setIsDup(false); setFormErr(""); setName(""); setEmail(""); setPhone(""); setHearAbout(""); setReason(""); }
  function closeModal() { setModal(false); }

  async function submitPreorder(e) {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em || !/^[^@]+@[^@]+\.[^@]+$/.test(em)) { setFormErr("Please enter a valid email."); return; }
    setSubmitting(true); setFormErr(""); setIsDup(false);

    // Load existing submissions
    let subs = {};
    try { const raw = localStorage.getItem(SUBS_KEY); subs = raw ? JSON.parse(raw) : {}; } catch {}

    if (subs[em]) {
      // Already registered — show duplicate message, don't increment
      setIsDup(true); setSubmitting(false); return;
    }

    // New submission — save record
    const record = { name: name.trim(), email: em, phone: phone.trim(), hearAbout, reason, ts: new Date().toISOString() };
    subs[em] = record;
    try { localStorage.setItem(SUBS_KEY, JSON.stringify(subs)); } catch {}

    // Send to Google Sheets, then refetch live count from sheet (single source of truth)
    if (SHEETS_URL) {
      try {
        await fetch(SHEETS_URL, {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body: JSON.stringify(record),
          mode:"no-cors",
        });
      } catch {}

      try {
        const r = await fetch(SHEETS_URL);
        const d = await r.json();
        if (typeof d.count === "number") {
          setClicks(d.count);
          setPop(true);
          setTimeout(()=>setPop(false), 500);
        }
      } catch {}
    }

    setSubmitting(false); setSubmitted(true);
    // Auto-close and show confirm after 2.5s
    setTimeout(() => { setModal(false); setConf(true); setConf2(true); }, 2500);
    setTimeout(() => { setConf(false); setConf2(false); }, 6000);
  }

  function handleLogoClick() {
    if (phase !== "intro") return;
    setLogoClick(true); setPhase("clicking");
    // Veil darkens in
    setTimeout(() => setVeil("darken"), 200);
    // At peak darkness: page-a exits, page-b begins fading in
    setTimeout(() => { setProductIn(true); setPhase("product"); }, 820);
    // Veil starts lifting — product revealed beneath
    setTimeout(() => setVeil("lighten"), 900);
    // Remove from DOM
    setTimeout(() => setVeil("gone"), 2400);
  }

  const ringSize  = hov ? 52 : 34;
  const ringColor = hov ? "rgba(232,25,44,.7)" : "rgba(232,25,44,.35)";

  return (
    <>
      <style>{css}</style>
      <canvas ref={noiseRef} className="noise"/>

      {/* Cursor */}
      <div ref={dotRef} className="c-dot"/>
      <div ref={ringRef} className="c-ring" style={{ width:ringSize, height:ringSize, borderColor:ringColor }}/>

      {/* Transition veil */}
      {veil !== "gone" && (
        <div className={`t-veil${veil==="darken"?" darken":veil==="lighten"?" lighten":""}`}/>
      )}

      {/* Pre-order Modal */}
      <div className={`modal-backdrop${modal?" open":""}`} onClick={e=>{if(e.target===e.currentTarget)closeModal();}}>
        <div className="modal-box">
          <button className="modal-close" onClick={closeModal}>✕ close</button>
          {submitted ? (
            <div className="modal-success">
              <span className="modal-success-icon">✓</span>
              <div className="modal-success-head">You're on the list.</div>
              <div className="modal-success-sub">We'll be in touch when it's ready.</div>
            </div>
          ) : (
            <form onSubmit={submitPreorder}>
              <div className="modal-eyebrow">Pre-order</div>
              <div className="modal-headline">Reserve your box<br/>before we sell out.</div>
              <div className="modal-field">
                <label className="modal-label">First name <span style={{color:"rgba(200,170,130,.3)"}}>optional</span></label>
                <input
                  className="modal-input"
                  type="text"
                  placeholder="Your first name"
                  autoComplete="given-name"
                  value={name}
                  onChange={e=>setName(e.target.value)}
                  onMouseEnter={()=>setHov(true)}
                  onMouseLeave={()=>setHov(false)}
                />
              </div>
              <div className="modal-field">
                <label className="modal-label">Email *</label>
                <input
                  className="modal-input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e=>setEmail(e.target.value)}
                  onMouseEnter={()=>setHov(true)}
                  onMouseLeave={()=>setHov(false)}
                  required
                />
              </div>
              <div className="modal-field">
                <label className="modal-label">Phone <span style={{color:"rgba(200,170,130,.3)"}}>optional</span></label>
                <input
                  className="modal-input"
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={phone}
                  onChange={e=>setPhone(e.target.value)}
                  onMouseEnter={()=>setHov(true)}
                  onMouseLeave={()=>setHov(false)}
                />
              </div>
              <div className="modal-field">
                <label className="modal-label">How did you hear about us? <span style={{color:"rgba(200,170,130,.3)"}}>optional</span></label>
                <select className="modal-select" value={hearAbout} onChange={e=>setHearAbout(e.target.value)}>
                  <option value="">Select one</option>
                  <option value="physician">Physician recommendation</option>
                  <option value="friend">Friend or family</option>
                  <option value="social">Social media</option>
                  <option value="stanford">Stanford community</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="modal-field">
                <label className="modal-label">Why do you want Zuca? <span style={{color:"rgba(200,170,130,.3)"}}>optional</span></label>
                <select className="modal-select" value={reason} onChange={e=>setReason(e.target.value)}>
                  <option value="">Select one</option>
                  <option value="gut">Gut health</option>
                  <option value="fiber">Increase fiber intake</option>
                  <option value="sustainability">Sustainable eating</option>
                  <option value="weight">Weight management</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="modal-note">No payment now. We'll reach out when your order is ready to confirm.</div>
              {formErr && <div className="modal-err">{formErr}</div>}
              {isDup && <div className="modal-dup">✓ You're already on the list — we'll be in touch.</div>}
              <button
                className="modal-submit"
                type="submit"
                disabled={submitting}
                onMouseEnter={()=>setHov(true)}
                onMouseLeave={()=>setHov(false)}
              >
                {submitting ? "Reserving..." : "Reserve my spot →"}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          PAGE A — INTRO  (identical to original)
      ══════════════════════════════════════════════════ */}
      <div className={`page-a${phase!=="intro"?" exit":""}`}>
        <div className="page-a-glow" style={{ transform:hov?"scale(1.4)":"scale(1)", opacity:hov?1:.7 }}/>

        <div
          className={`intro-logo${logoClick?" clicking":""}`}
          onClick={handleLogoClick}
          onMouseEnter={()=>setHov(true)}
          onMouseLeave={()=>setHov(false)}
        >
          ZUCA
        </div>

        <div className="tagline-wrap">
          {LINES.map((line,i) => {
            const show = [line1,line2,line3][i];
            const done = [line2,line3,prompt][i];
            return (
              <span key={i} className={`tagline-line${show?" show":""}`}>
                {show && <TypeLine text={line} speed={42} showCursor={show&&!done}/>}
              </span>
            );
          })}
        </div>

        <div className={`click-prompt${prompt?" show":""}`}>
          click the logo to enter
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          PAGE B — PRODUCT  (full redesign)
      ══════════════════════════════════════════════════ */}
      <div className={`page-b${productIn?" in":""}`}>

        {/* ── SECTION 1: HERO ── */}
        <section className="hero-section">

          {/* Nav */}
          <div className="nav-strip" style={{gridColumn:"1/-1"}}>
            <div className="nav-logo">ZUCA</div>
            <div className="nav-right">
              <span>Pre-order open</span>
              <div className="nav-dot"/>
              <span>Stanford, CA</span>
            </div>
          </div>

          {/* Full-width copy */}
          <div className="hero-left">
            <div className="h-eyebrow si1">Pre-order · Limited Release</div>

            <h1 className="accusation si2">
              <span className="acc-line1">Your gut is</span>
              <span className="acc-line2">sick.</span>
              <span className="acc-line3">Fix it.</span>
            </h1>

            <div className="red-rule"/>

            <p className="hero-body si3">
              <strong>95% of Americans aren't getting enough fiber.</strong> A chronic disease epidemic. We build the snack that actually addresses it. A Michelin-trained chef and a Stanford physician. Nothing compromised.
            </p>

            <p className="ai-line si3b">
              Bad food broke health.<br/>
              Better <span style={{ position: "relative", display: "inline-block" }}>
                AI
                <svg
                  viewBox="0 0 50 20"
                  preserveAspectRatio="none"
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: -5,
                    width: "calc(100% + 10px)",
                    height: "0.75em",
                    transform: "translateY(-50%)",
                    overflow: "visible",
                    pointerEvents: "none",
                  }}
                >
                  <path d="M 2 10 Q 8 4, 14 12 T 26 8 T 38 12 T 48 8" stroke="#E8192C" strokeWidth="2.25" fill="none" strokeLinecap="round"/>
                  <path d="M 3 8 Q 12 14, 22 6 Q 32 12, 47 10" stroke="#E8192C" strokeWidth="1.75" opacity="0.85" fill="none" strokeLinecap="round"/>
                </svg>
              </span> food fixes it.
            </p>

            <div className="data-row si4">
              {[["10g","Fiber /serving"],["4g","Protein"],["0g","Refined sugar"],["150","Kcal"]].map(([v,l])=>(
                <div key={l} className="data-cell">
                  <span className="data-num">{v}</span>
                  <span className="data-lbl">{l}</span>
                </div>
              ))}
            </div>

            <div className="cta-cluster si5">
              <div className="price-block">
                <div className="price-big">$28</div>
                <div className="price-note">Box of 12</div>
              </div>
              <button
                className="order-btn"
                onClick={handleBuy}
                onMouseEnter={()=>setHov(true)}
                onMouseLeave={()=>setHov(false)}
              >
                Pre-order now →
              </button>
            </div>

            <div className="confirm-txt" style={{opacity:conf?1:0}}>
              ✓ Reserved. We'll be in touch.
            </div>

            {clicks!==null && (
              <div className="counter-row si6">
                <span className={`counter-n${pop?" pop":""}`}>{clicks.toLocaleString()}</span>
                <span className="counter-txt">pre-orders<br/>and counting</span>
              </div>
            )}
          </div>
        </section>

        {/* ── SECTION 3: FOUNDERS ── */}
        <section className="founders-section">
          <div className="founders-inner">
            <div className="section-label" style={{marginBottom:48}}>
              <span className="section-num">01</span>
              <span className="section-title-txt">The founders</span>
            </div>
            <div className="founders-top">
              <div className="founder-col">
                <div className="fc-index">01 / Co-founder</div>
                <div className="fc-name-big">Emil Nordin</div>
                <div className="fc-role">Chef & Co-Founder</div>
                <div className="fc-cred-list">
                  {[
                    "Norway's Most Promising Young Chef '21",
                    "Michelin-trained, Restaurant Kontrast",
                    "National TV host, 1M+ viewers",
                    "Stanford Bioengineering & Biodesign '26",
                  ].map(c=><div key={c} className="fc-cred-item">{c}</div>)}
                </div>
              </div>
              <div className="founder-col">
                <div className="fc-index">02 / Co-founder</div>
                <div className="fc-name-big">Dr. Kelley Yuan, MD</div>
                <div className="fc-role">Physician & Co-Founder</div>
                <div className="fc-cred-list">
                  {[
                    "Stanford Medicine physician",
                    "Sustainability Fellow",
                    "Reversed autoimmune disease through diet",
                    "Leads clinical network: 10+ physicians, 7 specialties",
                  ].map(c=><div key={c} className="fc-cred-item">{c}</div>)}
                </div>
              </div>
            </div>
            <div className="backed-row">
              <div className="backed-lbl">Backed by</div>
              <div className="backed-names">
                {["Stanford Medicine","Emergence","Stanford Biodesign","Vituity","Cooley LLP","Step Change Innovations","Burnette Foods"].map(l=>(
                  <span key={l} className="b-chip">{l}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── SECTION 4: PRODUCT ── */}
        <section className="product-section">
          <div className="product-inner">
            <div className="section-label" style={{marginBottom:56}}>
              <span className="section-num" style={{color:"rgba(242,228,205,.2)",borderColor:"rgba(242,228,205,.1)"}}>02</span>
              <span className="section-title-txt" style={{color:"rgba(242,228,205,.25)"}}>The product</span>
            </div>

            <div className="product-top">
              <div>
                <h2 className="product-headline">
                  Two flavors.<br/><em>Both obsession-worthy.</em>
                </h2>
                <p className="product-desc">
                  Clinician-formulated. Chef-crafted.
                </p>
              </div>
            </div>

            <div className="flavor-grid">
              {[
                {
                  name:"Chocolate Raspberry Sea Salt",
                  desc:"Bright raspberry meets deep cocoa with a touch of sea salt that lingers on the finish. Tart, rich, and just complex enough to keep you reaching for another bite.",
                  data:[],
                },
                {
                  name:"Maple Pecan",
                  desc:"Real maple and toasted pecans bring warmth and depth to every bite. Nutty, gently sweet, and quietly irresistible.",
                  data:[],
                },
              ].map((fl,i)=>(
                <div key={i} className="flavor-card-v2"
                  onMouseEnter={()=>setHov(true)}
                  onMouseLeave={()=>setHov(false)}>
                  <div className="fc-name-v2">{fl.name}</div>
                  <p className="fc-desc">{fl.desc}</p>
                  <div className="fc-data">
                    {fl.data.map(([k,v])=>(
                      <div key={k} className="fc-data-row">
                        <span className="fc-data-key">{k}</span>
                        <span className="fc-data-val">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FOOTER CTA ── */}
        <div style={{background:"#1E1208"}}>
          <div className="footer-cta">
            <div className="footer-left">
              <h2 className="footer-headline">
                Your gut is sick.<br/><em>Give it fiber.</em>
              </h2>
              <div className="footer-sub">
                Clinician-formulated. Chef-crafted.
              </div>
            </div>
            <div className="footer-right">
              <div>
                <div className="footer-price">$28</div>
                <div className="footer-price-note">/ Box of 12</div>
              </div>
              <button
                className="footer-btn"
                onClick={handleBuy}
                onMouseEnter={()=>setHov(true)}
                onMouseLeave={()=>setHov(false)}
              >
                Pre-order now →
              </button>
              {clicks!==null&&(
                <div className="footer-counter">
                  Join <strong>{clicks.toLocaleString()}</strong> others on the list
                </div>
              )}
              <div className="footer-confirm" style={{opacity:conf2?1:0}}>
                ✓ Reserved. We'll be in touch.
              </div>
              <div style={{fontFamily:MONO,fontSize:9,letterSpacing:3,color:"rgba(242,228,205,.12)",textTransform:"uppercase"}}>
                Chocolate Raspberry · Maple Pecan
              </div>
            </div>
          </div>
        </div>

        <footer className="site-footer">
          <div className="sf-logo">ZUCA</div>
          <div className="sf-copy">© 2025 Zuca Snacks · letschat@zucasnacks.com · Stanford, CA</div>
        </footer>

      </div>{/* /page-b */}
    </>
  );
}
