/* ── FLUX PLANNER · splash.js — Flux Weapon Charging ── */
window.runSplash = function(callback) {
  const splash = document.getElementById('splash');
  if (!splash) { callback(); return; }

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', '#000508');

  splash.style.cssText = 'position:fixed;inset:0;background:#000508;z-index:9999;overflow:hidden;display:flex;align-items:center;justify-content:center';

  splash.innerHTML = `
    <canvas id="sCanvas" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
    <div id="sLogo" style="
      position:relative;z-index:2;
      display:flex;flex-direction:column;align-items:center;
      opacity:0;
      transition:opacity .8s ease;
    ">
      <!-- Static lens icon -->
      <svg id="sIcon" width="72" height="72" viewBox="0 0 72 72" style="margin-bottom:16px;filter:drop-shadow(0 0 18px #00d4ff) drop-shadow(0 0 6px #0080ff);opacity:0;transform:scale(0.6);transition:opacity .6s ease .1s, transform .7s cubic-bezier(.16,1,.3,1) .1s">
        <circle cx="36" cy="36" r="34" fill="none" stroke="rgba(0,180,255,.15)" stroke-width="1"/>
        <circle cx="36" cy="36" r="26" fill="none" stroke="rgba(0,200,255,.25)" stroke-width="1.5"/>
        <circle cx="36" cy="36" r="18" fill="none" stroke="rgba(0,220,255,.4)" stroke-width="2"/>
        <circle cx="36" cy="36" r="10" fill="none" stroke="rgba(0,240,255,.6)" stroke-width="2.5"/>
        <circle cx="36" cy="36" r="4" fill="#00e5ff" style="filter:blur(1px)"/>
        <circle cx="36" cy="36" r="2" fill="white"/>
        <!-- crosshair lines -->
        <line x1="36" y1="2" x2="36" y2="14" stroke="rgba(0,220,255,.5)" stroke-width="1"/>
        <line x1="36" y1="58" x2="36" y2="70" stroke="rgba(0,220,255,.5)" stroke-width="1"/>
        <line x1="2" y1="36" x2="14" y2="36" stroke="rgba(0,220,255,.5)" stroke-width="1"/>
        <line x1="58" y1="36" x2="70" y2="36" stroke="rgba(0,220,255,.5)" stroke-width="1"/>
      </svg>
      <div id="sWordmark" style="
        font-family:'Plus Jakarta Sans',sans-serif;
        font-size:clamp(2rem,8vw,3.2rem);
        font-weight:800;
        letter-spacing:-0.04em;
        background:linear-gradient(90deg,#fff 0%,#00d4ff 50%,#0066ff 100%);
        -webkit-background-clip:text;-webkit-text-fill-color:transparent;
        background-clip:text;
        opacity:0;transform:translateY(12px);
        transition:opacity .6s ease .5s, transform .6s cubic-bezier(.16,1,.3,1) .5s;
      ">Flux</div>
      <div id="sTagline" style="
        font-family:'JetBrains Mono',monospace;
        font-size:clamp(.55rem,1.8vw,.7rem);
        letter-spacing:.35em;
        color:rgba(0,180,255,.4);
        text-transform:uppercase;
        margin-top:8px;
        opacity:0;
        transition:opacity .5s ease .9s;
      ">Smart School Planner</div>
    </div>
    <style>
      @keyframes rotCW  { from{transform:rotate(0)}   to{transform:rotate(360deg)} }
      @keyframes rotCCW { from{transform:rotate(0)}   to{transform:rotate(-360deg)} }
      @keyframes pulse  { 0%,100%{opacity:.4} 50%{opacity:1} }
    </style>
  `;

  // ── Canvas ──────────────────────────────────────────────────
  const canvas = document.getElementById('sCanvas');
  const ctx    = canvas.getContext('2d');
  let W, H, cx, cy, animId, tick = 0;
  let phase = 0; // 0=tunnel charging, 1=flash, 2=logo reveal, 3=done

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    cx = W / 2; cy = H / 2;
  }
  resize();
  window.addEventListener('resize', resize);

  // Ring system — each ring has a radius, speed, opacity, thickness, color
  const RING_COUNT = 14;
  const rings = Array.from({length: RING_COUNT}, (_, i) => ({
    baseR: 40 + i * (Math.min(W,H) * 0.045),
    phase: (i / RING_COUNT) * Math.PI * 2,
    speed: 0.4 + Math.random() * 0.3,
    thickness: 1 + (RING_COUNT - i) * 0.25,
    segments: 3 + Math.floor(Math.random() * 4),
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.015,
    alive: false,
    birthTick: i * 8,
  }));

  // Depth lines (tunnel effect - lines converging to center)
  const LINES = 24;
  const tunnelLines = Array.from({length: LINES}, (_, i) => ({
    angle: (i / LINES) * Math.PI * 2,
    alpha: 0,
  }));

  // Particles streaming toward center
  const particles = Array.from({length: 60}, () => ({
    angle: Math.random() * Math.PI * 2,
    dist: Math.random() * Math.min(W,H) * 0.5 + 100,
    speed: Math.random() * 2 + 1,
    alpha: Math.random(),
    size: Math.random() * 1.5 + 0.3,
  }));

  let flashAlpha = 0;
  let chargeProgress = 0; // 0-1

  function drawRing(r, alpha, thickness, segments, rot, color) {
    if (segments === 0) {
      // Full circle
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = color.replace('A', `,${alpha})`).replace('rgb', 'rgba');
      ctx.lineWidth = thickness;
      ctx.stroke();
    } else {
      // Segmented ring
      const gap = 0.18;
      for (let s = 0; s < segments; s++) {
        const start = rot + (s / segments) * Math.PI * 2;
        const end   = start + (Math.PI * 2 / segments) - gap;
        ctx.beginPath();
        ctx.arc(cx, cy, r, start, end);
        ctx.strokeStyle = `rgba(0,200,255,${alpha})`;
        ctx.lineWidth = thickness;
        ctx.stroke();
      }
    }
  }

  function frame() {
    tick++;
    chargeProgress = Math.min(tick / 140, 1);

    ctx.clearRect(0, 0, W, H);

    // Background gradient — dark center, very dark edge (barrel depth)
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W,H) * 0.6);
    bg.addColorStop(0, `rgba(0,8,20,${0.3 + chargeProgress * 0.5})`);
    bg.addColorStop(0.5, `rgba(0,4,12,0.95)`);
    bg.addColorStop(1, 'rgba(0,0,4,1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Tunnel depth lines (radiate from center outward, faint)
    const lineAlpha = Math.min(chargeProgress * 0.8, 0.12);
    tunnelLines.forEach(l => {
      const farX = cx + Math.cos(l.angle) * Math.max(W, H);
      const farY = cy + Math.sin(l.angle) * Math.max(W, H);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(farX, farY);
      ctx.strokeStyle = `rgba(0,150,255,${lineAlpha})`;
      ctx.lineWidth = 0.4;
      ctx.stroke();
    });

    // Charging rings — appear from outside, contract toward center
    rings.forEach((ring, i) => {
      if (tick < ring.birthTick) return;
      ring.rot += ring.rotSpeed;
      const age = tick - ring.birthTick;
      const ageProgress = Math.min(age / 80, 1);

      // Ring contracts slightly as charge builds
      const contraction = chargeProgress * 18;
      const r = ring.baseR - contraction + Math.sin(tick * 0.04 + ring.phase) * 4;
      if (r < 8) return;

      const alpha = ageProgress * (0.2 + chargeProgress * 0.6) * (0.5 + 0.5 * Math.sin(tick * 0.06 + ring.phase));
      const thickness = ring.thickness * (0.8 + chargeProgress * 0.5);

      // Glow behind ring
      ctx.shadowBlur = 8 + chargeProgress * 12;
      ctx.shadowColor = `rgba(0,180,255,${alpha * 0.8})`;

      drawRing(r, Math.min(alpha, 0.85), thickness, ring.segments, ring.rot, 'rgba(0,200,255,A)');
      ctx.shadowBlur = 0;
    });

    // Inner charging rings (solid, closer to center)
    for (let ri = 0; ri < 5; ri++) {
      const r = 15 + ri * 14 + Math.sin(tick * 0.05 + ri) * 3;
      const a = chargeProgress * (0.3 + ri * 0.12) * (0.6 + 0.4 * Math.sin(tick * 0.08 + ri * 0.7));
      ctx.shadowBlur = 6 + ri * 3;
      ctx.shadowColor = `rgba(0,220,255,${a})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${ri < 2 ? '0,240,255' : '100,200,255'},${a})`;
      ctx.lineWidth = 1.5 - ri * 0.2;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Particles streaming toward center
    particles.forEach(p => {
      p.dist -= p.speed * (1 + chargeProgress * 2);
      if (p.dist < 5) {
        p.dist = Math.random() * Math.min(W,H) * 0.55 + 80;
        p.angle = Math.random() * Math.PI * 2;
      }
      const px = cx + Math.cos(p.angle) * p.dist;
      const py = cy + Math.sin(p.angle) * p.dist;
      const a = chargeProgress * p.alpha * (1 - p.dist / (Math.min(W,H) * 0.55));
      if (a < 0.01) return;
      ctx.beginPath();
      ctx.arc(px, py, p.size * (1 + chargeProgress), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,200,255,${a})`;
      ctx.fill();
    });

    // Center glow — intensifies as charge builds
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80 + chargeProgress * 60);
    cg.addColorStop(0, `rgba(0,220,255,${0.08 + chargeProgress * 0.25})`);
    cg.addColorStop(0.4, `rgba(0,120,255,${0.04 + chargeProgress * 0.12})`);
    cg.addColorStop(1, 'rgba(0,0,255,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, W, H);

    // Core bright point
    const coreA = chargeProgress * (0.5 + Math.sin(tick * 0.1) * 0.3);
    const coreGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20 + chargeProgress * 15);
    coreGrd.addColorStop(0, `rgba(255,255,255,${coreA})`);
    coreGrd.addColorStop(0.3, `rgba(0,220,255,${coreA * 0.7})`);
    coreGrd.addColorStop(1, 'rgba(0,100,255,0)');
    ctx.fillStyle = coreGrd;
    ctx.fillRect(0, 0, W, H);

    // Phase 1: FLASH at full charge
    if (chargeProgress >= 1 && flashAlpha < 1) {
      flashAlpha = Math.min(flashAlpha + 0.08, 1);
      ctx.fillStyle = `rgba(0,200,255,${flashAlpha * 0.7})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha * 0.4})`;
      ctx.fillRect(0, 0, W, H);
    }

    // After flash peaks, reveal logo
    if (flashAlpha >= 0.9 && phase < 2) {
      phase = 2;
      const logo = document.getElementById('sLogo');
      const icon = document.getElementById('sIcon');
      const word = document.getElementById('sWordmark');
      const tag  = document.getElementById('sTagline');
      if (logo) logo.style.opacity = '1';
      if (icon) { icon.style.opacity = '1'; icon.style.transform = 'scale(1)'; }
      if (word) { word.style.opacity = '1'; word.style.transform = 'translateY(0)'; }
      if (tag)  tag.style.opacity = '1';
    }

    // Flash fades out
    if (flashAlpha >= 1) {
      flashAlpha = Math.max(flashAlpha - 0.03, 0);
      if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(0,180,255,${flashAlpha * 0.5})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    animId = requestAnimationFrame(frame);
  }

  animId = requestAnimationFrame(frame);

  // Exit after logo has been visible for ~1.8s (total ~3.8s)
  setTimeout(() => {
    window.removeEventListener('resize', resize);
    cancelAnimationFrame(animId);
    splash.style.transition = 'opacity .6s ease, transform .6s ease';
    splash.style.opacity = '0';
    splash.style.transform = 'scale(1.04)';
    setTimeout(() => {
      splash.style.display = 'none';
      callback();
    }, 620);
  }, 3800);
};
