/* ── FLUX PLANNER · splash.js ── */
window.runSplash = function(callback) {
  const splash = document.getElementById('splash');
  if (!splash) { callback(); return; }

  splash.style.cssText = 'position:fixed;inset:0;background:#0c0d12;z-index:9999;overflow:hidden;display:block';

  splash.innerHTML = `
    <canvas id="splashCanvas" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
      <div style="display:flex;align-items:baseline;gap:0;margin-bottom:12px">
        <span id="splF" style="font-family:'Plus Jakarta Sans',sans-serif;font-size:clamp(3.5rem,10vw,5.5rem);font-weight:800;letter-spacing:-3px;background:linear-gradient(135deg,#6366f1,#a78bfa,#10d9a0);-webkit-background-clip:text;-webkit-text-fill-color:transparent;opacity:0;transform:translateY(50px) scale(.7);transition:opacity .65s cubic-bezier(.16,1,.3,1),transform .65s cubic-bezier(.16,1,.3,1)">F</span>
        <span id="splLux" style="font-family:'Plus Jakarta Sans',sans-serif;font-size:clamp(3.5rem,10vw,5.5rem);font-weight:800;letter-spacing:-3px;color:#eef0f7;-webkit-text-fill-color:#eef0f7;opacity:0;transform:translateX(-30px);transition:opacity .6s cubic-bezier(.16,1,.3,1) .18s,transform .6s cubic-bezier(.16,1,.3,1) .18s">lux</span>
        <span id="splPl" style="font-family:'JetBrains Mono',monospace;font-size:clamp(.75rem,2vw,1rem);font-weight:400;color:#5a6080;letter-spacing:3px;text-transform:uppercase;margin-left:14px;margin-bottom:10px;align-self:flex-end;opacity:0;transform:translateY(12px);transition:opacity .5s ease .65s,transform .5s ease .65s">Planner</span>
      </div>
      <div id="splSub" style="font-family:'JetBrains Mono',monospace;font-size:.68rem;letter-spacing:4px;color:#3a4060;text-transform:uppercase;opacity:0;transition:opacity .5s ease .9s">YOUR SMART SCHOOL PLANNER</div>
      <div id="splDots" style="display:flex;gap:8px;margin-top:40px;opacity:0;transition:opacity .4s ease 1.1s">
        <div style="width:7px;height:7px;border-radius:50%;background:#6366f1;animation:spB 1.2s ease-in-out infinite"></div>
        <div style="width:7px;height:7px;border-radius:50%;background:#a78bfa;animation:spB 1.2s ease-in-out .22s infinite"></div>
        <div style="width:7px;height:7px;border-radius:50%;background:#10d9a0;animation:spB 1.2s ease-in-out .44s infinite"></div>
      </div>
    </div>
    <style>@keyframes spB{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-12px);opacity:1}}</style>`;

  // Canvas particle network
  const canvas = document.getElementById('splashCanvas');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, animId;

  function resize() {
    W = canvas.width = splash.offsetWidth || window.innerWidth;
    H = canvas.height = splash.offsetHeight || window.innerHeight;
  }
  resize();

  const COLORS = ['#6366f1','#a78bfa','#10d9a0','#3b82f6','#e879f9','#fbbf24'];
  const pts = Array.from({length: 70}, () => ({
    x: Math.random() * W, y: Math.random() * H,
    r: Math.random() * 1.6 + 0.3,
    dx: (Math.random() - .5) * .5, dy: (Math.random() - .5) * .5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    a: Math.random() * .4 + .08
  }));

  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < 120) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(99,102,241,${(1-d/120)*.06})`;
          ctx.lineWidth = .5;
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
    }
    pts.forEach(p => {
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0 || p.x > W) p.dx *= -1;
      if (p.y < 0 || p.y > H) p.dy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      const hex = Math.floor(p.a * 255).toString(16).padStart(2,'0');
      ctx.fillStyle = p.color + hex;
      ctx.fill();
    });
    animId = requestAnimationFrame(frame);
  }
  animId = requestAnimationFrame(frame);

  // Stagger text reveals
  const show = (id, delay) => setTimeout(() => {
    const el = document.getElementById(id); if (!el) return;
    el.style.opacity = '1';
    el.style.transform = 'none';
  }, delay);
  show('splF', 180);
  show('splLux', 320);
  show('splPl', 650);
  show('splSub', 900);
  show('splDots', 1100);

  // Exit after 2.8s
  setTimeout(() => {
    cancelAnimationFrame(animId);
    splash.style.transition = 'opacity .6s ease';
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.style.display = 'none';
      callback();
    }, 620);
  }, 2800);
};
