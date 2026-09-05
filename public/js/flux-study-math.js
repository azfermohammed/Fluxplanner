/* ============================================================================
   FLUX STUDY HUB · Math module (Pass 1)
   Bespoke native tools: graphing calculator, unit circle, matrix calc,
   statistics, normal-distribution visualizer. Registers with fluxStudyHub.
   ========================================================================== */
(function () {
  'use strict';
  function boot() {
    const H = window.fluxStudyHub;
    if (!H || !H.register) { return setTimeout(boot, 60); }
    const esc = H.helpers.esc;
    const accent = () => { const r = document.getElementById('fshRoot'); return (r && getComputedStyle(r).getPropertyValue('--fsh-accent').trim()) || '#5b8def'; };
    function mkCanvas(host, h) { const wrap = document.createElement('div'); wrap.className = 'fsh-canvas-wrap'; const c = document.createElement('canvas'); wrap.appendChild(c); host.appendChild(wrap); const ctx = c.getContext('2d'); function size() { const w = wrap.clientWidth || 620; const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = w * dpr; c.height = h * dpr; c.style.height = h + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { w, h }; } return { c, ctx, size, alive: () => document.body.contains(c) }; }

    // ── expression compiler (safe-ish) ──────────────────────────────────────
    // Null prototypes so names like "constructor" can't resolve via the chain.
    const FNS = Object.assign(Object.create(null), {
      sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos,
      atan: Math.atan, sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10,
      exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round,
      sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sign: Math.sign,
      pow: Math.pow, max: Math.max, min: Math.min,
    });
    const CONSTS = Object.assign(Object.create(null), { pi: Math.PI, e: Math.E });
    function compile(src) {
      const e = String(src).replace(/\s+/g, ''); if (!e) throw new Error('Enter a function of x');
      // Tokenize against a fixed whitelist — anything else is rejected up front,
      // so evaluation never touches the JS engine (no new Function / eval).
      const toks = []; let i = 0;
      while (i < e.length) {
        const ch = e[i];
        if (/[0-9.]/.test(ch)) {
          const m = e.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
          if (!m) throw new Error('Unsupported: ' + ch);
          toks.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length;
        } else if (/[a-z]/i.test(ch)) {
          const m = e.slice(i).match(/^[a-z]+/i); const w = m[0].toLowerCase();
          if (w === 'x') toks.push({ t: 'x' });
          else if (w in CONSTS) toks.push({ t: 'num', v: CONSTS[w] });
          else if (w in FNS) toks.push({ t: 'fn', v: w });
          else throw new Error('Unsupported: ' + w);
          i += m[0].length;
        } else if ('+-*/^(),'.includes(ch)) { toks.push({ t: ch }); i++; }
        else throw new Error('Unsupported: ' + ch);
      }
      // Recursive-descent parse to a closure tree; precedence: ^ > unary- > */ > +-
      let p = 0;
      const peek = () => toks[p], eat = (t) => { if (!toks[p] || toks[p].t !== t) throw new Error('Bad expression'); return toks[p++]; };
      function sum() { let l = term(); while (peek() && (peek().t === '+' || peek().t === '-')) { const op = toks[p++].t; const r = term(); const a = l, plus = op === '+'; l = (x) => plus ? a(x) + r(x) : a(x) - r(x); } return l; }
      function term() { let l = unary(); while (peek() && (peek().t === '*' || peek().t === '/')) { const op = toks[p++].t; const r = unary(); const a = l, mul = op === '*'; l = (x) => mul ? a(x) * r(x) : a(x) / r(x); } return l; }
      function unary() { if (peek() && peek().t === '-') { p++; const r = unary(); return (x) => -r(x); } if (peek() && peek().t === '+') { p++; return unary(); } return power(); }
      function power() { const b = atom(); if (peek() && peek().t === '^') { p++; const ex = unary(); return (x) => Math.pow(b(x), ex(x)); } return b; }
      function atom() {
        const tk = peek(); if (!tk) throw new Error('Bad expression');
        if (tk.t === 'num') { p++; const v = tk.v; return () => v; }
        if (tk.t === 'x') { p++; return (x) => x; }
        if (tk.t === '(') { p++; const inner = sum(); eat(')'); return inner; }
        if (tk.t === 'fn') {
          p++; const f = FNS[tk.v]; eat('(');
          const args = [sum()]; while (peek() && peek().t === ',') { p++; args.push(sum()); }
          eat(')');
          return (x) => f.apply(null, args.map((a) => a(x)));
        }
        throw new Error('Bad expression');
      }
      const root = sum();
      if (p !== toks.length) throw new Error('Bad expression');
      return root;
    }

    // ── Graphing calculator (Desmos, with an offline fallback) ──────────────
    /* Desmos replaces the hand-rolled canvas plotter: it does implicit curves,
       sliders, tables, regressions, inequalities and proper axis labelling,
       none of which the native one could. The native plotter is kept below as
       renderGraphNative and used when Desmos can't load — Flux is an
       installable PWA and Desmos needs the network, so a student working
       offline still gets a usable graph instead of an error. */
    const DESMOS_API_VERSION = 'v1.11';
    /* Desmos embed keys are designed to ship in the page (the script is loaded
       client-side, so the key is public by construction — this is not a secret).
       Override with window.FLUX_DESMOS_API_KEY before the study hub boots.

       LICENSING — READ BEFORE ENABLING PAID PLANS: this key is Desmos's
       *non-commercial / personal projects* tier. Desmos's own notice: "If you
       would like to use the Desmos API for commercial purposes (e.g., as part
       of a business, or in an app or product that you charge users for),
       contact us at partnerships@desmos.com." Flux already ships Stripe
       checkout, a billing portal and Flux Pro entitlements — the moment paid
       plans are switched on, this key is out of terms and has to be replaced
       with a commercial one. */
    function desmosKey() {
      return window.FLUX_DESMOS_API_KEY || '358d93886703462aa44456773add8b79';
    }

    /* Desmos ships a light palette and an inverted one. This used to follow the
       Flux theme automatically, which meant dark by default — but Desmos's
       inverted mode is a straight colour inversion, so graph lines and the
       expression list come out muddy against the app's own dark chrome. Light
       is the default and reads correctly; the palette is now an explicit choice
       and it sticks. */
    const GRAPH_DARK_KEY = 'flux_desmos_dark';
    function graphDark() {
      try { return localStorage.getItem(GRAPH_DARK_KEY) === '1'; } catch (_) { return false; }
    }
    function setGraphDark(on) {
      try { localStorage.setItem(GRAPH_DARK_KEY, on ? '1' : '0'); } catch (_) {}
    }

    /* Loaded in an iframe rather than injected into this page. Desmos needs
       eval() and new Function(), which the app's CSP forbids — in-page the
       bundle half-executes and leaves a Desmos global with no
       GraphingCalculator on it. public/desmos-frame.html carries its own,
       narrower CSP permitting eval for that document alone, so the planner
       keeps its stricter policy. See the comment at the top of that file. */
    function renderGraph(body) {
      /* Params go in the hash rather than the query string — a host that
         rewrites `/x.html` to `/x` drops the query on the redirect and the
         frame would boot with no key. See the note in desmos-frame.html. */
      const src = new URL('public/desmos-frame.html', document.baseURI);
      src.hash = new URLSearchParams({
        apiKey: desmosKey(),
        dark: graphDark() ? '1' : '0',
        v: DESMOS_API_VERSION,
      }).toString();

      body.innerHTML = `<div class="fsh-card" style="padding:20px">
        <div class="fsh-desmos-head">
          <div class="fsh-desmos-head-text">
            <h3 style="margin:0 0 4px;font-size:16px">Graphing calculator</h3>
            <p class="sub" style="color:var(--fsh-mut);font-size:12px;margin:0">Powered by Desmos — type equations on the left. Sliders, tables, regressions and inequalities all work.</p>
          </div>
          <div class="fsh-desmos-actions">
            <button type="button" class="fsh-btn fsh-desmos-theme" id="dsmTheme" aria-pressed="${graphDark() ? 'true' : 'false'}">${graphDark() ? '☀︎ Light graph' : '☾ Dark graph'}</button>
            <button type="button" class="fsh-btn fsh-desmos-theme" id="dsmFull" aria-pressed="false">⛶ Fullscreen</button>
          </div>
        </div>
        <iframe id="dsmFrame" class="fsh-desmos" title="Desmos graphing calculator" src="${esc(src.toString())}"></iframe>
        <div class="fsh-out" id="dsmErr"></div></div>`;

      const frame = document.getElementById('dsmFrame');

      /* Fullscreen uses a CSS class rather than the Fullscreen API: requesting
         real fullscreen on an iframe reloads its document in some browsers,
         which would throw away the equations the student has typed. A
         fixed-inset overlay keeps the same frame alive, so the graph survives
         going in and out. iOS Safari also refuses requestFullscreen on iframes
         outright, and this works there. */
      const card = frame.closest('.fsh-card');
      const fullBtn = document.getElementById('dsmFull');
      function setFull(on) {
        card.classList.toggle('fsh-desmos-full', on);
        // Stop the page behind the overlay scrolling under it.
        document.body.classList.toggle('fsh-desmos-locked', on);
        fullBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        fullBtn.textContent = on ? '⤡ Exit fullscreen' : '⛶ Fullscreen';
      }
      fullBtn.addEventListener('click', () => setFull(!card.classList.contains('fsh-desmos-full')));
      document.addEventListener('keydown', function onEsc(e) {
        if (e.key !== 'Escape') return;
        // Self-detach once the tool is gone, rather than leaking a listener
        // per visit to the grapher.
        if (!document.body.contains(card)) { document.removeEventListener('keydown', onEsc); return; }
        if (card.classList.contains('fsh-desmos-full')) { e.preventDefault(); setFull(false); }
      });

      document.getElementById('dsmTheme').addEventListener('click', (e) => {
        const on = !graphDark();
        setGraphDark(on);
        const btn = e.currentTarget;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.textContent = on ? '☀︎ Light graph' : '☾ Dark graph';
        /* Message the frame rather than reloading it, so whatever the student
           has already typed survives the switch. */
        try {
          frame.contentWindow.postMessage(
            { source: 'flux-desmos-cmd', invertedColors: on }, location.origin);
        } catch (_) {}
      });
      let settled = false;

      function fallback(msg) {
        if (settled || !document.body.contains(frame)) return;
        settled = true;
        window.removeEventListener('message', onMsg);
        renderGraphNative(body);
        const err = document.getElementById('gErr');
        if (err) err.innerHTML = `<span class="fsh-err">${esc(msg)}</span>`;
      }

      /* The frame reports back rather than being polled: a cross-origin script
         failing inside it is invisible from out here. */
      function onMsg(e) {
        if (!e.data || e.data.source !== 'flux-desmos') return;
        if (e.data.ok) { settled = true; window.removeEventListener('message', onMsg); return; }
        fallback('Desmos could not load — you are offline or it is blocked on this network. Using the built-in plotter.');
      }
      window.addEventListener('message', onMsg);

      /* If the frame itself never loads (offline, 404) no message arrives at
         all, so time out too. */
      setTimeout(() => fallback('Desmos is taking too long — using the built-in plotter.'), 12000);
    }

    // ── Built-in plotter (offline fallback for the above) ───────────────────
    // Opens empty on purpose. A pre-filled sin(x) tells a student in a lower
    // maths level that they are looking at something they were meant to
    // recognise; an empty grid asks them for their own function instead.
    let gExpr = '', gExpr2 = '', gZoom = 10;
    function renderGraphNative(body) {
      body.innerHTML = `<div class="fsh-card" style="padding:20px"><h3 style="margin:0 0 4px;font-size:16px">Graphing calculator</h3><p class="sub" style="color:var(--fsh-mut);font-size:12px;margin:0 0 14px">Plot y = f(x). Use x, +−*/^, and sin cos tan sqrt ln log abs exp pi.</p>
        <div class="fsh-field"><input id="gIn1" class="fsh-input" value="${esc(gExpr)}" spellcheck="false"></div>
        <div class="fsh-field" style="margin-top:8px"><input id="gIn2" class="fsh-input" value="${esc(gExpr2)}" spellcheck="false" placeholder="optional second function"><button type="button" class="fsh-btn" id="gPlot">Plot</button></div>
        <div class="fsh-field" style="margin-top:10px;align-items:center"><span style="font-size:12px;color:var(--fsh-mut)">Zoom</span><input id="gZoom" class="fsh-range" type="range" min="2" max="40" step="1" value="${gZoom}"></div>
        <div id="gCanvas" style="margin-top:12px"></div><div class="fsh-out" id="gErr"></div></div>`;
      const cv = mkCanvas(document.getElementById('gCanvas'), 320);
      function plot() {
        const { w, h } = cv.size(), ctx = cv.ctx; const err = document.getElementById('gErr'); err.innerHTML = '';
        const X0 = w / 2, Y0 = h / 2, sc = w / (gZoom * 2);
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
        for (let gx = -gZoom; gx <= gZoom; gx++) { const px = X0 + gx * sc; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke(); }
        for (let gy = -Math.ceil(Y0 / sc); gy <= Math.ceil(Y0 / sc); gy++) { const py = Y0 + gy * sc; ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, Y0); ctx.lineTo(w, Y0); ctx.moveTo(X0, 0); ctx.lineTo(X0, h); ctx.stroke();
        const cols = [accent(), '#ff7a59'];
        [document.getElementById('gIn1').value, document.getElementById('gIn2').value].forEach((src, idx) => {
          if (!src.trim()) return; let fn; try { fn = compile(src); } catch (e) { err.innerHTML = `<span class="fsh-err">${esc(e.message)}</span>`; return; }
          ctx.strokeStyle = cols[idx]; ctx.lineWidth = 2.5; ctx.beginPath(); let pen = false;
          for (let px = 0; px <= w; px++) { const xv = (px - X0) / sc; let yv; try { yv = fn(xv); } catch (e) { yv = NaN; } if (!isFinite(yv)) { pen = false; continue; } const py = Y0 - yv * sc; if (py < -2000 || py > h + 2000) { pen = false; continue; } pen ? ctx.lineTo(px, py) : ctx.moveTo(px, py); pen = true; }
          ctx.stroke();
        });
      }
      document.getElementById('gPlot').addEventListener('click', () => { gExpr = document.getElementById('gIn1').value; gExpr2 = document.getElementById('gIn2').value; plot(); });
      document.getElementById('gZoom').addEventListener('input', (e) => { gZoom = +e.target.value; plot(); });
      requestAnimationFrame(plot);
    }

    // ── Unit circle ──────────────────────────────────────────────────────────
    function renderUnitCircle(body) {
      body.innerHTML = `<div class="fsh-card" style="padding:20px"><h3 style="margin:0 0 4px;font-size:16px">Unit circle</h3><p class="sub" style="color:var(--fsh-mut);font-size:12px;margin:0 0 14px">Drag the angle to read sin, cos and tan.</p>
        <div id="ucCanvas"></div><div class="fsh-field" style="margin-top:12px;align-items:center"><span style="font-size:12px;color:var(--fsh-mut)">Angle</span><input id="ucAng" class="fsh-range" type="range" min="0" max="360" step="1" value="30"></div>
        <div class="fsh-sim-readout" id="ucOut"></div></div>`;
      const cv = mkCanvas(document.getElementById('ucCanvas'), 300);
      function draw() {
        const { w, h } = cv.size(), ctx = cv.ctx; const ang = +document.getElementById('ucAng').value, rad = ang * Math.PI / 180;
        const R = Math.min(w, h) / 2 - 30, cx = w / 2, cy = h / 2; const acc = accent();
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - R - 12, cy); ctx.lineTo(cx + R + 12, cy); ctx.moveTo(cx, cy - R - 12); ctx.lineTo(cx, cy + R + 12); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
        const px = cx + R * Math.cos(rad), py = cy - R * Math.sin(rad);
        ctx.strokeStyle = 'rgba(52,211,153,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, cy); ctx.lineTo(px, py); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,122,89,.85)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, cy); ctx.stroke();
        ctx.strokeStyle = acc; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.shadowColor = acc; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(px, py, 6, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
        const s = Math.sin(rad), c = Math.cos(rad), t = Math.abs(c) < 1e-9 ? '∞' : (s / c).toFixed(3);
        document.getElementById('ucOut').innerHTML = `<div class="fsh-readout-pill">angle<b>${ang}° · ${(rad).toFixed(3)} rad</b></div><div class="fsh-readout-pill">sin<b>${s.toFixed(3)}</b></div><div class="fsh-readout-pill">cos<b>${c.toFixed(3)}</b></div><div class="fsh-readout-pill">tan<b>${t}</b></div>`;
      }
      document.getElementById('ucAng').addEventListener('input', draw); requestAnimationFrame(draw);
    }

    // ── Matrix calculator ───────────────────────────────────────────────────
    function parseMatrix(txt) { const rows = txt.trim().split('\n').map((r) => r.trim().split(/[\s,]+/).map(Number)).filter((r) => r.length && r.every((x) => !isNaN(x))); if (!rows.length) throw new Error('Enter numbers, one row per line'); const n = rows[0].length; if (!rows.every((r) => r.length === n)) throw new Error('Rows must be equal length'); return rows; }
    function det(M) { const n = M.length; if (n !== M[0].length) throw new Error('Determinant needs a square matrix'); const A = M.map((r) => r.slice()); let d = 1; for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; if (Math.abs(A[p][i]) < 1e-12) return 0; if (p !== i) { [A[i], A[p]] = [A[p], A[i]]; d = -d; } d *= A[i][i]; for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; } } return d; }
    function inverse(M) { const n = M.length; if (n !== M[0].length) throw new Error('Inverse needs a square matrix'); const A = M.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))); for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; if (Math.abs(A[p][i]) < 1e-12) throw new Error('Matrix is singular (no inverse)'); [A[i], A[p]] = [A[p], A[i]]; const pv = A[i][i]; for (let c = 0; c < 2 * n; c++) A[i][c] /= pv; for (let r = 0; r < n; r++) { if (r === i) continue; const f = A[r][i]; for (let c = 0; c < 2 * n; c++) A[r][c] -= f * A[i][c]; } } return A.map((r) => r.slice(n).map((x) => Math.round(x * 1e6) / 1e6)); }
    const matHTML = (M) => `<table class="fsh-sol" style="min-width:auto;margin-top:8px"><tbody>${M.map((r) => `<tr>${r.map((x) => `<td style="background:rgba(255,255,255,.05);color:var(--fsh-ink)">${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    function renderMatrix(body) {
      body.innerHTML = `<div class="fsh-card" style="padding:20px"><h3 style="margin:0 0 4px;font-size:16px">⊞ Matrix calculator</h3><p class="sub" style="color:var(--fsh-mut);font-size:12px;margin:0 0 14px">One row per line, numbers separated by spaces. Square matrix for det/inverse.</p>
        <textarea id="mxIn" class="fsh-input" style="min-height:90px;font-family:monospace" spellcheck="false">2 1
1 3</textarea>
        <div class="fsh-field" style="margin-top:10px"><button type="button" class="fsh-btn" data-mx="det">Determinant</button><button type="button" class="fsh-btn ghost" data-mx="inv">Inverse</button><button type="button" class="fsh-btn ghost" data-mx="tr">Transpose</button></div>
        <div class="fsh-out" id="mxOut"></div></div>`;
      body.querySelectorAll('[data-mx]').forEach((b) => b.addEventListener('click', () => {
        const o = document.getElementById('mxOut'); try { const M = parseMatrix(document.getElementById('mxIn').value); const op = b.dataset.mx;
          if (op === 'det') o.innerHTML = `<span class="big">det = ${Math.round(det(M) * 1e6) / 1e6}</span>`;
          else if (op === 'inv') o.innerHTML = matHTML(inverse(M));
          else o.innerHTML = matHTML(M[0].map((_, c) => M.map((r) => r[c])));
        } catch (e) { o.innerHTML = `<span class="fsh-err">${esc(e.message)}</span>`; }
      }));
    }

    // ── Statistics ───────────────────────────────────────────────────────────
    function stats(nums) {
      const a = nums.slice().sort((x, y) => x - y), n = a.length; if (!n) throw new Error('No numbers');
      const sum = a.reduce((s, x) => s + x, 0), mean = sum / n;
      const med = n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
      const q = (p) => { const i = (n - 1) * p, lo = Math.floor(i); return a[lo] + (a[Math.min(lo + 1, n - 1)] - a[lo]) * (i - lo); };
      const varce = a.reduce((s, x) => s + (x - mean) * (x - mean), 0) / n; const sampVar = n > 1 ? a.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (n - 1) : 0;
      const r = (x) => Math.round(x * 1e4) / 1e4;
      return { n, mean: r(mean), median: r(med), min: a[0], max: a[n - 1], range: r(a[n - 1] - a[0]), sd: r(Math.sqrt(sampVar)), variance: r(sampVar), popSd: r(Math.sqrt(varce)), q1: r(q(0.25)), q3: r(q(0.75)), iqr: r(q(0.75) - q(0.25)), sum: r(sum) };
    }
    function renderStats(body) {
      body.innerHTML = `<div class="fsh-card" style="padding:20px"><h3 style="margin:0 0 4px;font-size:16px">𝝈 Statistics</h3><p class="sub" style="color:var(--fsh-mut);font-size:12px;margin:0 0 14px">Paste numbers (spaces, commas or new lines).</p>
        <textarea id="stIn" class="fsh-input" style="min-height:80px;font-family:monospace" spellcheck="false">12, 15, 14, 10, 18, 20, 13, 16</textarea>
        <div class="fsh-field" style="margin-top:10px"><button type="button" class="fsh-btn" id="stGo">Summarise</button></div><div class="fsh-out" id="stOut"></div></div>`;
      document.getElementById('stGo').addEventListener('click', () => { const o = document.getElementById('stOut'); try { const nums = document.getElementById('stIn').value.split(/[\s,]+/).map(Number).filter((x) => !isNaN(x)); const s = stats(nums); o.innerHTML = `<div class="fsh-sim-readout">${[['n', s.n], ['mean', s.mean], ['median', s.median], ['sd', s.sd], ['min', s.min], ['max', s.max], ['Q1', s.q1], ['Q3', s.q3], ['IQR', s.iqr], ['range', s.range], ['Σ', s.sum]].map((p) => `<div class="fsh-readout-pill">${p[0]}<b>${p[1]}</b></div>`).join('')}</div>`; } catch (e) { o.innerHTML = `<span class="fsh-err">${esc(e.message)}</span>`; } });
    }

    // ── Normal distribution ──────────────────────────────────────────────────
    function cdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
    function renderNormal(body) {
      body.innerHTML = `<div class="fsh-card" style="padding:20px"><h3 style="margin:0 0 4px;font-size:16px">Normal distribution</h3><p class="sub" style="color:var(--fsh-mut);font-size:12px;margin:0 0 14px">Shade P(X ≤ x) under the bell curve.</p>
        <div id="ndCanvas"></div>
        <div class="fsh-sim-controls"><div class="fsh-ws-group"><div class="fsh-label"><span>Mean μ</span><b id="ndM_v">0</b></div><input id="ndM" class="fsh-range" type="range" min="-5" max="5" step="0.1" value="0"></div>
        <div class="fsh-ws-group"><div class="fsh-label"><span>Std σ</span><b id="ndS_v">1</b></div><input id="ndS" class="fsh-range" type="range" min="0.3" max="4" step="0.1" value="1"></div>
        <div class="fsh-ws-group"><div class="fsh-label"><span>x</span><b id="ndX_v">1</b></div><input id="ndX" class="fsh-range" type="range" min="-8" max="8" step="0.1" value="1"></div></div>
        <div class="fsh-sim-readout" id="ndOut"></div></div>`;
      const cv = mkCanvas(document.getElementById('ndCanvas'), 240);
      function draw() {
        const { w, h } = cv.size(), ctx = cv.ctx; const mu = +document.getElementById('ndM').value, sg = +document.getElementById('ndS').value, xv = +document.getElementById('ndX').value;
        document.getElementById('ndM_v').textContent = mu; document.getElementById('ndS_v').textContent = sg; document.getElementById('ndX_v').textContent = xv;
        const acc = accent(); ctx.clearRect(0, 0, w, h); const X = (x) => (x + 8) / 16 * w; const pdf = (x) => Math.exp(-((x - mu) * (x - mu)) / (2 * sg * sg)) / (sg * Math.sqrt(2 * Math.PI)); const peak = pdf(mu); const Y = (y) => h - 24 - y / peak * (h - 44);
        ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.moveTo(0, h - 24); ctx.lineTo(w, h - 24); ctx.stroke();
        ctx.fillStyle = 'rgba(52,208,255,.22)'; ctx.beginPath(); ctx.moveTo(X(-8), h - 24); for (let x = -8; x <= xv; x += 0.05) ctx.lineTo(X(x), Y(pdf(x))); ctx.lineTo(X(xv), h - 24); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = acc; ctx.lineWidth = 2.5; ctx.beginPath(); for (let x = -8; x <= 8; x += 0.04) { const px = X(x), py = Y(pdf(x)); x === -8 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } ctx.stroke();
        ctx.strokeStyle = 'rgba(255,122,89,.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(xv), 8); ctx.lineTo(X(xv), h - 24); ctx.stroke();
        const z = (xv - mu) / sg; document.getElementById('ndOut').innerHTML = `<div class="fsh-readout-pill">z-score<b>${z.toFixed(3)}</b></div><div class="fsh-readout-pill">P(X ≤ x)<b>${(cdf(z) * 100).toFixed(2)}%</b></div><div class="fsh-readout-pill">P(X > x)<b>${((1 - cdf(z)) * 100).toFixed(2)}%</b></div>`;
      }
      ['ndM', 'ndS', 'ndX'].forEach((id) => document.getElementById(id).addEventListener('input', draw)); requestAnimationFrame(draw);
    }

    H.register('math', [
      { id: 'graph', name: 'Desmos', icon: '📈', desc: 'graphing calculator plot function desmos', render: renderGraph, ai: { name: 'graphEval', description: 'Evaluate f(x). Arg: "x^2+1 @ 3" (expr @ x).', params: { expr: 'string', x: 'number' }, run: (a) => { const m = String(a).split('@'); const fn = compile(m[0]); return +fn(parseFloat(m[1] || 0)).toFixed(6); } } },
      { id: 'unit', name: 'Unit circle', icon: '🧭', desc: 'unit circle sin cos tan trigonometry angle', render: renderUnitCircle },
      { id: 'matrix', name: 'Matrix', icon: '⊞', desc: 'matrix determinant inverse transpose', render: renderMatrix },
      { id: 'stats', name: 'Statistics', icon: '𝝈', desc: 'statistics mean median standard deviation quartiles', render: renderStats, ai: { name: 'statsSummary', description: 'Summary statistics. Arg: "12 15 14 10".', params: { numbers: 'list' }, run: (a) => stats(String(a).split(/[\s,]+/).map(Number).filter((x) => !isNaN(x))) } },
      { id: 'normal', name: 'Normal', icon: '🔔', desc: 'normal distribution probability z-score bell curve', render: renderNormal },
    ]);
  }
  boot();
})();
