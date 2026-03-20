/* ── FLUX PLANNER · splash.js — full redesign ── */
window.runSplash = function(callback) {
  const splash = document.getElementById('splash');
  if (!splash) { callback(); return; }

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', '#05060f');

  splash.style.cssText = 'position:fixed;inset:0;background:#05060f;z-index:9999;overflow:hidden;display:flex;align-items:center;justify-content:center';

  splash.innerHTML = `
    <canvas id="sCanvas" style="position:absolute;inset:0;width:100%;height:100%"></canvas>

    <!-- Central content — absolutely centered as a unit -->
    <div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 24px;">

      <!-- Icon mark -->
      <div id="sMark" style="
        width:64px;height:64px;border-radius:18px;
        background:linear-gradient(135deg,#6366f1,#a78bfa 50%,#10d9a0);
        display:flex;align-items:center;justify-content:center;
        margin-bottom:22px;
        opacity:0;transform:scale(0.4) rotate(-15deg);
        transition:opacity .5s cubic-bezier(.16,1,.3,1),transform .7s cubic-bezier(.16,1,.3,1);
        box-shadow:0 0 0 1px rgba(255,255,255,.1),0 20px 60px rgba(99,102,241,.5);
        flex-shrink:0;
      ">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M8 8h16v4H12v4h10v4H12v8H8V8z" fill="white" opacity="0.95"/>
          <circle cx="24" cy="24" r="3" fill="#10d9a0"/>
        </svg>
      </div>

      <!-- App name — single line, perfectly centered -->
      <div id="sName" style="
        font-family:'Plus Jakarta Sans',sans-serif;
        font-size:clamp(2.8rem,10vw,4.5rem);
        font-weight:800;
        letter-spacing:-0.04em;
        line-height:1;
        color:#ffffff;
        opacity:0;
        transform:translateY(20px);
        transition:opacity .55s cubic-bezier(.16,1,.3,1),transform .65s cubic-bezier(.16,1,.3,1);
        white-space:nowrap;
      ">Flux Planner</div>

      <!-- Subtitle line -->
      <div id="sSub" style="
        font-family:'JetBrains Mono',monospace;
        font-size:clamp(.6rem,2vw,.75rem);
        letter-spacing:0.3em;
        color:rgba(255,255,255,.28);
        text-transform:uppercase;
        margin-top:12px;
        opacity:0;
        transform:translateY(10px);
        transition:opacity .5s ease,transform .5s ease;
      ">AI-powered school planner</div>

      <!-- Progress bar -->
      <div style="margin-top:40px;width:120px;height:2px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;">
        <div id="sBar" style="
          height:100%;width:0%;
          background:linear-gradient(90deg,#6366f1,#a78bfa,#10d9a0);
          border-radius:2px;
          transition:width 2.2s cubic-bezier(.4,0,.2,1);
        "></div>
      </div>

    </div>

    <style>
      @keyframes aurora {
        0%   { transform:translate(0,0) scale(1) rotate(0deg); }
        33%  { transform:translate(40px,-30px) scale(1.08) rotate(5deg); }
        66%  { transform:translate(-30px,20px) scale(.95) rotate(-3deg); }
        100% { transform:translate(0,0) scale(1) rotate(0deg); }
      }
      @keyframes auroraSlow {
        0%   { transform:translate(0,0) scale(1); }
        50%  { transform:translate(-50px,40px) scale(1.1); }
        100% { transform:translate(0,0) scale(1); }
      }
    </style>
  `;

  // ── Canvas: aurora + grid ────────────────────────────────────
  const canvas = document.getElementById('sCanvas');
  const ctx    = canvas.getContext('2d');
  let W, H, animId, tick = 0;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // Shooting stars
  const shots = [];
  function addShot() {
    const side = Math.random() > .5;
    shots.push({
      x: Math.random() * W,
      y: Math.random() * H * .5,
      vx: (Math.random() * 4 + 3) * (side ? 1 : -1),
      vy: Math.random() * 2 + 1,
      len: Math.random() * 100 + 60,
      life: 0, max: Math.random() * 40 + 25,
      w: Math.random() * 1.5 + .5
    });
  }

  // Grid dots
  const GRID_SPACING = 48;
  let gridDots = [];
  function buildGrid() {
    gridDots = [];
    const cols = Math.ceil(W / GRID_SPACING) + 1;
    const rows = Math.ceil(H / GRID_SPACING) + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        gridDots.push({ x: c * GRID_SPACING, y: r * GRID_SPACING, phase: Math.random() * Math.PI * 2 });
      }
    }
  }
  buildGrid();

  function frame() {
    tick++;
    ctx.clearRect(0, 0, W, H);

    // Aurora blobs
    const blobs = [
      { x: W * .2, y: H * .3, r: W * .45, c: '99,102,241', a: .1 },
      { x: W * .8, y: H * .7, r: W * .4,  c: '16,217,160', a: .07 },
      { x: W * .6, y: H * .15, r: W * .35, c: '167,139,250', a: .06 },
    ];
    blobs.forEach((b, i) => {
      const ox = Math.sin(tick * .008 + i * 2.1) * 60;
      const oy = Math.cos(tick * .006 + i * 1.7) * 40;
      const grd = ctx.createRadialGradient(b.x+ox, b.y+oy, 0, b.x+ox, b.y+oy, b.r);
      grd.addColorStop(0, `rgba(${b.c},${b.a})`);
      grd.addColorStop(1, `rgba(${b.c},0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
    });

    // Subtle grid dots
    const cx = W / 2, cy = H / 2;
    gridDots.forEach(d => {
      const dist = Math.sqrt((d.x-cx)**2 + (d.y-cy)**2);
      const maxDist = Math.sqrt(cx**2 + cy**2);
      const fade = Math.max(0, 1 - dist / maxDist * 1.4);
      const pulse = .3 + Math.sin(tick * .04 + d.phase) * .15;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 1, 0, Math.PI*2);
      ctx.fillStyle = `rgba(99,102,241,${fade * pulse * .4})`;
      ctx.fill();
    });

    // Grid lines (very faint)
    ctx.strokeStyle = 'rgba(99,102,241,0.025)';
    ctx.lineWidth = .5;
    for (let x = 0; x < W; x += GRID_SPACING) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
    }
    for (let y = 0; y < H; y += GRID_SPACING) {
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
    }

    // Shooting stars
    if (tick % 45 === 0 && shots.length < 6) addShot();
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.life++;
      const t = s.life / s.max;
      const alpha = t < .15 ? t/.15 : t > .7 ? 1-(t-.7)/.3 : 1;
      const tx = s.x + s.vx * s.life;
      const ty = s.y + s.vy * s.life;
      const tailX = tx - s.vx * (s.len / Math.sqrt(s.vx**2+s.vy**2));
      const tailY = ty - s.vy * (s.len / Math.sqrt(s.vx**2+s.vy**2));
      const g = ctx.createLinearGradient(tailX, tailY, tx, ty);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(.7, `rgba(200,210,255,${alpha * .5})`);
      g.addColorStop(1, `rgba(255,255,255,${alpha * .9})`);
      ctx.beginPath();
      ctx.strokeStyle = g;
      ctx.lineWidth = s.w;
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      if (s.life >= s.max) shots.splice(i, 1);
    }

    // Center radial glow (breathes)
    const breathe = .06 + Math.sin(tick * .03) * .02;
    const cg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.min(W,H) * .4);
    cg.addColorStop(0, `rgba(99,102,241,${breathe})`);
    cg.addColorStop(1, 'rgba(99,102,241,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, W, H);

    animId = requestAnimationFrame(frame);
  }
  animId = requestAnimationFrame(frame);

  // ── Staggered reveals ───────────────────────────────────────
  const show = (id, delay, extra) => setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.opacity = '1';
    el.style.transform = 'none';
    if (extra) extra(el);
  }, delay);

  // Icon bounces in first
  show('sMark', 150);

  // Name slides up
  show('sName', 420);

  // Subtitle fades
  show('sSub', 700);

  // Progress bar fills
  setTimeout(() => {
    const bar = document.getElementById('sBar');
    if (bar) bar.style.width = '100%';
  }, 800);

  // ── Exit ────────────────────────────────────────────────────
  setTimeout(() => {
    window.removeEventListener('resize', resize);
    cancelAnimationFrame(animId);
    splash.style.transition = 'opacity .5s ease, transform .5s ease';
    splash.style.opacity = '0';
    splash.style.transform = 'scale(1.03)';
    setTimeout(() => {
      splash.style.display = 'none';
      callback();
    }, 500);
  }, 3200);
};
