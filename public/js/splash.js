/* ── FLUX PLANNER · splash.js — Hyperspace Railgun ── */
window.runSplash = function(callback) {
  const splash = document.getElementById('splash');
  if (!splash) { callback(); return; }

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', '#000810');

  splash.style.cssText = 'position:fixed;inset:0;background:#000810;z-index:9999;overflow:hidden;display:block';

  splash.innerHTML = `
    <canvas id="hCanvas" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
    <div id="hLogo" style="
      position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;z-index:2;
      opacity:0;transition:opacity .5s ease;pointer-events:none;
    ">
      <div style="
        font-family:'Plus Jakarta Sans',system-ui,sans-serif;
        font-size:clamp(2.4rem,9vw,3.8rem);font-weight:800;
        letter-spacing:-0.04em;
        background:linear-gradient(90deg,#fff 0%,#00d4ff 60%,#3b82f6 100%);
        -webkit-background-clip:text;-webkit-text-fill-color:transparent;
        background-clip:text;filter:drop-shadow(0 0 20px rgba(0,200,255,.5));
      ">Flux</div>
    </div>`;

  const canvas = document.getElementById('hCanvas');
  const ctx = canvas.getContext('2d');
  let W, H, cx, cy, animId, tick = 0;

  // Phase timing (frames at ~60fps)
  // warp: 0-70, flash: 70-85, logo: 85-120, exit: 120+
  const WARP_END = 70, FLASH_END = 85, LOGO_END = 120;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    cx = W / 2; cy = H / 2;
    buildStreaks();
  }

  // Each streak = a circle ring that shoots toward you down the barrel
  const STREAK_COUNT = 55;
  let streaks = [];

  function makeStreak(forced_z) {
    const z = forced_z !== undefined ? forced_z : Math.random();
    return {
      angle: Math.random() * Math.PI * 2,
      // Start scattered, end at edges
      startR: Math.random() * 0.04 + 0.01,  // near-center radius fraction
      z,          // 0=far, 1=close — maps to speed
      speed: 0.012 + z * 0.04,
      r: 0,       // current radius fraction (grows as it comes toward you)
      alpha: 0,
      // Ring or streak
      isRing: Math.random() > 0.35,
      ringR: Math.random() * 2 + 0.8,  // circle ring radius px at z=0
      color: Math.random() > 0.6 ? [80, 160, 255] : [0, 210, 255],
      life: 0,
      born: tick,
    };
  }

  function buildStreaks() {
    streaks = Array.from({ length: STREAK_COUNT }, (_, i) =>
      makeStreak(i / STREAK_COUNT)
    );
  }

  resize();
  window.addEventListener('resize', resize);

  let logoShown = false;
  let flashAlpha = 0;

  function frame() {
    tick++;
    const t = tick;
    const warpProgress = Math.min(t / WARP_END, 1);

    ctx.clearRect(0, 0, W, H);

    // Background — deep space
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H));
    bg.addColorStop(0, `rgba(0,10,28,1)`);
    bg.addColorStop(1, `rgba(0,2,8,1)`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Center tunnel glow — intensifies as warp builds
    if (warpProgress > 0.1) {
      const glowR = Math.min(W, H) * 0.35 * warpProgress;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      glow.addColorStop(0, `rgba(0,180,255,${warpProgress * 0.18})`);
      glow.addColorStop(0.5, `rgba(0,80,200,${warpProgress * 0.08})`);
      glow.addColorStop(1, 'rgba(0,0,100,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
    }

    // ── STREAKS ──
    streaks.forEach((s, i) => {
      s.r += s.speed * (0.3 + warpProgress * 1.4);
      s.life++;
      const curR = s.r * Math.min(W, H) * 0.85;
      const prevR = Math.max(0, (s.r - s.speed * (0.3 + warpProgress * 1.4) * 1.8)) * Math.min(W, H) * 0.85;

      if (curR > Math.max(W, H)) {
        // Reset this streak
        streaks[i] = makeStreak(Math.random() * 0.3);
        streaks[i].r = 0;
        return;
      }

      const depth = Math.min(s.r * 1.8, 1);
      const a = depth * (0.3 + warpProgress * 0.65) * Math.min(s.life / 8, 1);
      if (a < 0.02) return;

      const [cr, cg, cb] = s.color;

      if (s.isRing) {
        // Concentric ring expanding outward — the Flux weapon lens shape
        ctx.save();
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(cx, cy, curR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
        ctx.lineWidth = Math.max(0.5, depth * 1.8);
        // Motion blur: draw fainter trail circle
        if (prevR > 2) {
          ctx.shadowBlur = 6 * depth;
          ctx.shadowColor = `rgba(${cr},${cg},${cb},0.6)`;
        }
        ctx.stroke();
        ctx.restore();
      } else {
        // Radial streak — line shooting from center outward
        const sx = cx + Math.cos(s.angle) * prevR;
        const sy = cy + Math.sin(s.angle) * prevR;
        const ex = cx + Math.cos(s.angle) * curR;
        const ey = cy + Math.sin(s.angle) * curR;

        const grad = ctx.createLinearGradient(sx, sy, ex, ey);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},${a})`);

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(0.4, depth * 1.4);
        ctx.stroke();
      }
    });

    // ── FLASH at warp end ──
    if (t >= WARP_END && t < FLASH_END) {
      flashAlpha = Math.min(flashAlpha + 0.14, 1);
      ctx.fillStyle = `rgba(0,200,255,${flashAlpha * 0.55})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha * 0.28})`;
      ctx.fillRect(0, 0, W, H);
    } else if (t >= FLASH_END) {
      flashAlpha = Math.max(flashAlpha - 0.12, 0);
      if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(0,180,255,${flashAlpha * 0.4})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    // ── LOGO appears after flash ──
    if (t >= FLASH_END && !logoShown) {
      logoShown = true;
      document.getElementById('hLogo').style.opacity = '1';
    }

    // ── EXIT ──
    if (t >= LOGO_END) {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
      splash.style.transition = 'opacity .4s ease';
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.style.display = 'none';
        splash.innerHTML = '';
        callback();
      }, 400);
      return;
    }

    animId = requestAnimationFrame(frame);
  }

  animId = requestAnimationFrame(frame);
};
