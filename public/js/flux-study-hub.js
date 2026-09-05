/* ============================================================================
   FLUX STUDY HUB  ·  flux-study-hub.js   (Pass 1)
   Native in-app study tools. Owns the #toolbox panel (overrides renderToolbox).

   Core (this file): shell + subject rail + search, the Chemistry flagship
   (Table · Atom · Tools · Ions · Worksheet), a tool REGISTRY that subject
   modules (flux-study-physics/math/music.js) plug into, and the Flux-AI
   bridge (callable tools + slash commands + system-prompt awareness).
   ========================================================================== */
(function () {
  'use strict';
  if (window.__fluxStudyHub) return;
  window.__fluxStudyHub = true;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS_KEY = 'flux_study_hub';

  /* Go through the app's own storage helpers rather than localStorage directly.
     They route every key through fluxNamespacedKey(), which prefixes it while
     an owner is viewing another account, and they are what the sign-out
     preserve/restore pass understands. Reading and writing the raw key — as
     this module used to — put study state outside all of that, so a starred
     subject could be written under one namespace and read back from another,
     which reads as "it didn't save". Falls back to raw access if app.js has
     not defined the helpers yet. */
  const hubLoad = (def) => {
    try {
      if (typeof window.load === 'function') return window.load(LS_KEY, def);
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : def;
    } catch (e) { return def; }
  };
  const save = () => {
    try {
      if (typeof window.save === 'function') { window.save(LS_KEY, state); return; }
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {}
    /* Writing locally is only half of it. Saving to this device kept starred
       subjects across a reload but not across a phone and a laptop, which is
       what "per-device and temporary" meant. syncKey queues a debounced push of
       the whole payload; it no-ops when signed out and while an owner previews
       another account, so it is safe to call on every write. Deliberately after
       the persist above — a failed sync must not cost you the local save. */
    try { if (typeof window.syncKey === 'function') window.syncKey('studyHub', state); } catch (e) {}
  };

  let state = { subject: 'chemistry', chemTab: 'table', tool: {}, favs: [] };
  let stored = hubLoad(null);
  /* Anything saved before this module used the helpers sits under the bare key.
     Adopt it once so existing favourites survive the move. */
  if (!stored) {
    try {
      const legacy = localStorage.getItem(LS_KEY);
      if (legacy) stored = JSON.parse(legacy);
    } catch (e) {}
  }
  if (stored && typeof stored === 'object') state = Object.assign(state, stored);
  if (!state.tool) state.tool = {};
  // Records written before favourites existed have no `favs`, and a corrupted
  // one could hold anything — a bad value here would throw on every rail
  // render, so normalise instead of trusting it.
  if (!Array.isArray(state.favs)) state.favs = [];

  let selEl = 6, atomN = 6, atomSpeed = 1, searchQ = '';

  // ── element data ─────────────────────────────────────────────────────────
  const FALLBACK_MASS = { H:1.008,He:4.003,Li:6.94,Be:9.012,B:10.81,C:12.011,N:14.007,O:15.999,F:18.998,Ne:20.18,Na:22.99,Mg:24.305,Al:26.982,Si:28.085,P:30.974,S:32.06,Cl:35.45,Ar:39.948,K:39.098,Ca:40.078,Fe:55.845,Cu:63.546,Zn:65.38,Ag:107.868,Ba:137.327,Pb:207.2,I:126.904,Br:79.904,Mn:54.938,Hg:200.59 };
  const elements = () => { const E = window.fluxPeriodic && window.fluxPeriodic.ELEMENTS; return Array.isArray(E) && E.length ? E : []; };
  function massOf(sym) { const e = elements().find((x) => x.s === sym); return e ? e.mass : (FALLBACK_MASS[sym] != null ? FALLBACK_MASS[sym] : null); }
  const elByN = (n) => elements().find((e) => e.n === n) || null;

  // ── formula parsing ──────────────────────────────────────────────────────
  function parseFormula(f) {
    f = String(f).replace(/[·•]/g, '.').replace(/\s/g, '');
    const frags = f.split('.').filter(Boolean), total = {};
    const add = (dst, src, m) => { for (const k in src) dst[k] = (dst[k] || 0) + src[k] * m; };
    function parseFrag(s) {
      let i = 0;
      const num = () => { let t = ''; while (/\d/.test(s[i] || '')) { t += s[i]; i++; } return t ? parseInt(t, 10) : 1; };
      function seq() {
        const out = {};
        while (i < s.length) {
          const c = s[i];
          if (c === '(' || c === '[') { i++; const inner = seq(); if (s[i] !== ')' && s[i] !== ']') throw new Error('Unbalanced brackets'); i++; add(out, inner, num()); }
          else if (c === ')' || c === ']') break;
          else if (/[A-Z]/.test(c)) { let sym = c; i++; while (/[a-z]/.test(s[i] || '')) { sym += s[i]; i++; } out[sym] = (out[sym] || 0) + num(); }
          else if (/\d/.test(c)) { const m = num(); add(out, seq(), m); }
          else throw new Error('Unexpected "' + c + '"');
        }
        return out;
      }
      const out = seq(); if (i < s.length) throw new Error('Parse error'); return out;
    }
    for (let p = 0; p < frags.length; p++) {
      let part = frags[p], coef = 1; const m = part.match(/^(\d+)(.+)$/);
      if (m) { coef = parseInt(m[1], 10); part = m[2]; }
      add(total, parseFrag(part), coef);
    }
    return total;
  }
  const subFmt = (f) => esc(f).replace(/(\d+)/g, '<sub class="sub">$1</sub>');
  const subPlain = (f) => esc(f).replace(/(\d+)/g, '<sub>$1</sub>');

  // ── balancer (fractions + null space) ────────────────────────────────────
  const igcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; };
  const ilcm = (a, b) => (a === 0 || b === 0 ? 0 : Math.abs(a / igcd(a, b) * b));
  const fr = (n, d = 1) => { if (d === 0) throw new Error('div0'); if (d < 0) { n = -n; d = -d; } const g = igcd(n, d) || 1; return { n: n / g, d: d / g }; };
  const fsub = (x, y) => fr(x.n * y.d - y.n * x.d, x.d * y.d);
  const fmul = (x, y) => fr(x.n * y.n, x.d * y.d);
  const fdiv = (x, y) => fr(x.n * y.d, x.d * y.n);
  const fzero = (x) => x.n === 0;

  function splitEquation(input) {
    // accept ->, =>, →, ⟶, –>, —>, a lone "=", or a spaced dash " - "
    const norm = String(input).replace(/—>|–>|=>|->|⟶|→/g, '=').replace(/\s[-–—]\s/g, '=');
    return norm.split('=').map((s) => s.trim()).filter(Boolean);
  }
  function balance(input) {
    const sides = splitEquation(input);
    if (sides.length !== 2) throw new Error('Use one separator (=, → or - ) between sides.');
    const toSpecies = (txt) => txt.split('+').map((t) => t.trim()).filter(Boolean).map((raw) => {
      const formula = raw.replace(/^\d+\s*/, ''); return { formula, counts: parseFormula(formula) };
    });
    const R = toSpecies(sides[0]), P = toSpecies(sides[1]);
    if (!R.length || !P.length) throw new Error('Need reactants and products.');
    const species = R.concat(P), els = [];
    species.forEach((sp) => Object.keys(sp.counts).forEach((e) => { if (!els.includes(e)) els.push(e); }));
    const M = els.map((e) => species.map((sp, j) => fr((sp.counts[e] || 0) * (j < R.length ? 1 : -1))));
    const cols = species.length, pivCols = []; let r = 0;
    for (let c = 0; c < cols && r < M.length; c++) {
      let piv = -1; for (let i = r; i < M.length; i++) if (!fzero(M[i][c])) { piv = i; break; }
      if (piv < 0) continue;
      [M[r], M[piv]] = [M[piv], M[r]];
      const lead = M[r][c]; for (let j = 0; j < cols; j++) M[r][j] = fdiv(M[r][j], lead);
      for (let i = 0; i < M.length; i++) { if (i === r) continue; const f = M[i][c]; if (fzero(f)) continue; for (let j = 0; j < cols; j++) M[i][j] = fsub(M[i][j], fmul(f, M[r][j])); }
      pivCols.push(c); r++;
    }
    const free = []; for (let c = 0; c < cols; c++) if (!pivCols.includes(c)) free.push(c);
    if (free.length === 0) throw new Error('No valid balance — check the formulas.');
    if (free.length > 1) throw new Error('Under-determined — add/remove a species.');
    const f = free[0], x = new Array(cols).fill(null).map(() => fr(0)); x[f] = fr(1);
    pivCols.forEach((p, i) => { x[p] = fr(-M[i][f].n, M[i][f].d); });
    let L = 1; x.forEach((v) => { L = ilcm(L, v.d) || L; });
    let ints = x.map((v) => v.n * (L / v.d)); let g = 0; ints.forEach((v) => { g = igcd(g, v); }); if (!g) g = 1;
    ints = ints.map((v) => v / g);
    if (ints.some((v) => v > 0) && ints.some((v) => v < 0)) throw new Error('Cannot balance as written.');
    if (ints.every((v) => v <= 0)) ints = ints.map((v) => -v);
    if (ints.some((v) => v === 0)) throw new Error('Cannot balance — a species drops out.');
    return { R, P, coeffs: ints, type: classify(R, P) };
  }
  function classify(R, P) {
    const isEl = (c) => Object.keys(c).length === 1;
    const fuel = R.find((s) => s.counts.C && s.counts.H), hasO2 = R.some((s) => isEl(s.counts) && s.counts.O);
    const hasCO2 = P.some((s) => s.formula === 'CO2'), hasH2O = P.some((s) => s.formula === 'H2O');
    if (fuel && hasO2 && hasCO2 && hasH2O) return { k: 'Combustion', d: 'Fuel + O₂ → CO₂ + H₂O' };
    if (P.length === 1) return { k: 'Synthesis', d: 'Reactants combine into one product' };
    if (R.length === 1) return { k: 'Decomposition', d: 'One compound splits apart' };
    if (R.length === 2 && P.length === 2) {
      const er = R.filter((s) => isEl(s.counts)).length, ep = P.filter((s) => isEl(s.counts)).length;
      if (er === 1 && ep === 1) return { k: 'Single replacement', d: 'An element displaces another' };
      if (er === 0 && ep === 0) { if (hasH2O && /^H/.test(R[0].formula + R[1].formula)) return { k: 'Neutralization', d: 'Acid + base → salt + water' }; return { k: 'Double replacement', d: 'Ions swap partners' }; }
    }
    return { k: 'Redox / other', d: 'General balanced reaction' };
  }

  // ── chemistry reference data ─────────────────────────────────────────────
  const EQUATIONS = [
    // easy
    ['H2 + O2 = H2O','synthesis','easy'],['N2 + H2 = NH3','synthesis','easy'],['Na + Cl2 = NaCl','synthesis','easy'],
    ['K + Cl2 = KCl','synthesis','easy'],['Mg + O2 = MgO','synthesis','easy'],['Ca + O2 = CaO','synthesis','easy'],
    ['Li + O2 = Li2O','synthesis','easy'],['H2 + Cl2 = HCl','synthesis','easy'],['C + O2 = CO2','synthesis','easy'],
    ['S + O2 = SO2','synthesis','easy'],['Ca + Cl2 = CaCl2','synthesis','easy'],['Al + Br2 = AlBr3','synthesis','easy'],
    ['CaCO3 = CaO + CO2','decomposition','easy'],['H2O = H2 + O2','decomposition','easy'],['HgO = Hg + O2','decomposition','easy'],
    ['Zn + HCl = ZnCl2 + H2','single','easy'],['Mg + HCl = MgCl2 + H2','single','easy'],['Fe + CuSO4 = FeSO4 + Cu','single','easy'],
    ['Zn + CuSO4 = ZnSO4 + Cu','single','easy'],['AgNO3 + NaCl = AgCl + NaNO3','double','easy'],['HCl + NaOH = NaCl + H2O','double','easy'],
    ['KOH + HCl = KCl + H2O','double','easy'],['NaOH + HBr = NaBr + H2O','double','easy'],
    // medium
    ['Fe + O2 = Fe2O3','synthesis','medium'],['Al + O2 = Al2O3','synthesis','medium'],['SO2 + O2 = SO3','synthesis','medium'],
    ['N2 + O2 = NO2','synthesis','medium'],['CaO + H2O = Ca(OH)2','synthesis','medium'],['Na2O + H2O = NaOH','synthesis','medium'],
    ['KClO3 = KCl + O2','decomposition','medium'],['H2O2 = H2O + O2','decomposition','medium'],['NaCl = Na + Cl2','decomposition','medium'],
    ['CH4 + O2 = CO2 + H2O','combustion','medium'],['C2H6 + O2 = CO2 + H2O','combustion','medium'],['C3H8 + O2 = CO2 + H2O','combustion','medium'],
    ['Al + HCl = AlCl3 + H2','single','medium'],['K + H2O = KOH + H2','single','medium'],['Na + H2O = NaOH + H2','single','medium'],
    ['Cl2 + NaBr = NaCl + Br2','single','medium'],['Fe + HCl = FeCl2 + H2','single','medium'],['CuO + H2 = Cu + H2O','single','medium'],
    ['BaCl2 + Na2SO4 = BaSO4 + NaCl','double','medium'],['Pb(NO3)2 + KI = PbI2 + KNO3','double','medium'],['H2SO4 + NaOH = Na2SO4 + H2O','double','medium'],
    ['Ca(OH)2 + HCl = CaCl2 + H2O','double','medium'],['AgNO3 + CaCl2 = AgCl + Ca(NO3)2','double','medium'],
    // hard
    ['C2H5OH + O2 = CO2 + H2O','combustion','hard'],['C6H12O6 + O2 = CO2 + H2O','combustion','hard'],['C8H18 + O2 = CO2 + H2O','combustion','hard'],
    ['C4H10 + O2 = CO2 + H2O','combustion','hard'],['C5H12 + O2 = CO2 + H2O','combustion','hard'],['C7H16 + O2 = CO2 + H2O','combustion','hard'],
    ['C6H6 + O2 = CO2 + H2O','combustion','hard'],['C2H2 + O2 = CO2 + H2O','combustion','hard'],['CH3OH + O2 = CO2 + H2O','combustion','hard'],
    ['C3H6 + O2 = CO2 + H2O','combustion','hard'],['NaHCO3 = Na2CO3 + H2O + CO2','decomposition','hard'],['P4 + O2 = P2O5','synthesis','hard'],
    ['AlCl3 + NaOH = Al(OH)3 + NaCl','double','hard'],['Fe2(SO4)3 + NaOH = Fe(OH)3 + Na2SO4','double','hard'],['Ca(OH)2 + H3PO4 = Ca3(PO4)2 + H2O','double','hard'],
    ['Al + Fe2O3 = Al2O3 + Fe','single','hard'],['Fe2O3 + CO = Fe + CO2','redox','hard'],['NH3 + O2 = NO + H2O','redox','hard'],
    ['Cu + HNO3 = Cu(NO3)2 + NO2 + H2O','redox','hard'],['KMnO4 + HCl = KCl + MnCl2 + H2O + Cl2','redox','hard'],['FeS2 + O2 = Fe2O3 + SO2','redox','hard'],
    ['H2 + N2 = NH3','synthesis','hard'],['Sb + O2 = Sb4O6','synthesis','hard'],['C2H4 + O2 = CO2 + H2O','combustion','hard'],
  ];
  const TYPE_LABEL = { synthesis:'Synthesis', decomposition:'Decomposition', combustion:'Combustion', single:'Single replacement', double:'Double replacement', redox:'Redox' };
  const SOL_CATIONS = ['Na⁺/K⁺/NH₄⁺','Ca²⁺','Ba²⁺','Ag⁺','Pb²⁺','Cu²⁺/Fe³⁺'];
  const SOL_ANIONS = ['NO₃⁻','Cl⁻','SO₄²⁻','CO₃²⁻','OH⁻','S²⁻'];
  const SOL_GRID = [['S','S','S','S','S','S'],['S','S','s','I','s','I'],['S','S','I','I','S','I'],['S','I','s','I','I','I'],['S','s','I','I','I','I'],['S','S','S','I','I','I']];
  const IONS_CAT = [['H⁺','Hydrogen'],['Na⁺','Sodium'],['K⁺','Potassium'],['NH₄⁺','Ammonium'],['Ag⁺','Silver'],['Ca²⁺','Calcium'],['Mg²⁺','Magnesium'],['Ba²⁺','Barium'],['Zn²⁺','Zinc'],['Cu²⁺','Copper(II)'],['Fe²⁺','Iron(II)'],['Fe³⁺','Iron(III)'],['Al³⁺','Aluminium'],['Pb²⁺','Lead(II)']];
  const IONS_AN = [['OH⁻','Hydroxide'],['NO₃⁻','Nitrate'],['Cl⁻','Chloride'],['Br⁻','Bromide'],['HCO₃⁻','Hydrogencarbonate'],['CH₃COO⁻','Acetate'],['CO₃²⁻','Carbonate'],['SO₄²⁻','Sulfate'],['SO₃²⁻','Sulfite'],['O²⁻','Oxide'],['S²⁻','Sulfide'],['PO₄³⁻','Phosphate'],['MnO₄⁻','Permanganate'],['Cr₂O₇²⁻','Dichromate']];
  const CONSTANTS = [['Avogadro','6.022×10²³ mol⁻¹'],['Gas constant R','8.314 J·mol⁻¹·K⁻¹'],['Molar volume (STP)','22.7 L·mol⁻¹'],['Faraday','96 485 C·mol⁻¹'],['Std pressure','100 kPa'],['Kw (25 °C)','1.0×10⁻¹⁴'],['Planck h','6.626×10⁻³⁴ J·s'],['Speed of light','2.998×10⁸ m·s⁻¹']];


  /* Grouped into umbrellas rather than one flat row of pills. Thirteen
     subjects side by side is the "Study Tools is overwhelming" complaint in
     its most literal form: no hierarchy, so nothing tells you where to look.
     Five umbrellas is a glanceable number; the subjects underneath are only
     drawn for the umbrella you're in.

     Two subjects folded away in the same pass, both on the same reasoning —
     they were courses, not fields. Astronomy's three tools (solar system, moon
     phases, planet facts) are physics; Gov & Civics is history, and History is
     renamed History & Politics to say so rather than leaving civics looking
     like a guest. */
  const GROUPS = [
    { id:'science',    name:'Science',    ico:'⚗' },
    { id:'maths-tech', name:'Maths & Computing', ico:'∑' },
    { id:'humanities', name:'Humanities', ico:'🏛' },
    // Just "Languages" now that French, German and Spanish each have a pill —
    // "English & Languages" read as though English were the exception.
    { id:'languages-arts', name:'Languages', ico:'🌍' },
    { id:'arts',       name:'Arts',       ico:'🎵' },
  ];
  const SUBJECTS = [
    { id:'chemistry', name:'Chemistry', ico:'⚗', accent:'#34d0ff', flagship:true, group:'science' },
    { id:'physics', name:'Physics', ico:'🪐', accent:'#7c8cff', group:'science' },
    { id:'biology', name:'Biology', ico:'🧬', accent:'#37c98a', group:'science' },
    { id:'math', name:'Mathematics', ico:'∑', accent:'#5b8def', group:'maths-tech' },
    { id:'cs', name:'Computer Science', ico:'💻', accent:'#4fb6c9', group:'maths-tech' },
    // "& Geo" because it still carries the capitals quiz and the world map;
    // plain "History" undersold what is actually in it.
    { id:'history', name:'History & Geo', ico:'🏛', accent:'#d8a657', group:'humanities' },
    /* Split back out of History. Merging the two was my call and it was the
       wrong one: Global Politics is a course in its own right, and burying it
       inside a timeline-and-capitals module made it look like an appendix.
       Gov & Civics lives here rather than under History for the same reason —
       branches, amendments and case law are politics, not chronology.
       ⚖ not 🏛, which History keeps. */
    { id:'glopo', name:'Global Politics', ico:'⚖', accent:'#c9a227', group:'humanities' },
    { id:'psychology', name:'Psychology', ico:'🧠', accent:'#f2545b', group:'humanities' },
    { id:'econ', name:'Economics', ico:'💹', accent:'#f4a13f', group:'humanities' },
    { id:'english', name:'English', ico:'✒', accent:'#e069b4', group:'languages-arts' },
    /* One "Languages" pill with a Spanish/French toggle inside every tool was
       fine for two languages and stopped being fine at three: whichever one
       you took, the tools opened on the wrong one. Three pills, and each tool
       already knows which language it is in.

       The icons are letters, not flags. 🇫🇷 🇩🇪 🇪🇸 all map to the same glyph in
       flux-iconify, so all three pills would have come out identical — and a
       cedilla, an Eszett and an eñe say which language they belong to faster
       than a flag does anyway. Being plain text, they are also never swapped
       for an SVG, so these pills never change width after paint. */
    { id:'french', name:'French', ico:'ç', accent:'#36c5d6', group:'languages-arts' },
    { id:'german', name:'German', ico:'ß', accent:'#f0b429', group:'languages-arts' },
    { id:'spanish', name:'Spanish', ico:'ñ', accent:'#ef6c4d', group:'languages-arts' },
    { id:'music', name:'Music', ico:'🎵', accent:'#ff7a59', group:'arts' },
    { id:'art', name:'Visual Arts', ico:'🖼', accent:'#b98cff', group:'arts' },
  ];
  const subjById = (id) => SUBJECTS.find((s) => s.id === id) || SUBJECTS[0];
  /* Anyone whose saved subject was 'astronomy', 'civics' or 'languages' — or
     whose starred list still holds one — must land somewhere real rather than
     silently falling back to Chemistry. 'languages' splitting into three means
     the migration has to pick one; French wins by being first of the three,
     and the other two are sitting immediately beside it in the rail. */
  const MERGED = { astronomy:'physics', civics:'glopo', languages:'french' };
  const canonicalSubject = (id) => MERGED[id] || id;
  const groupOf = (sid) => (subjById(canonicalSubject(sid)) || {}).group || GROUPS[0].id;

  /* Migrate anything already saved on a device. This runs here, not up with the
     state loader, because MERGED is a const and would still be in its temporal
     dead zone there. Without it, someone whose last subject was Astronomy would
     open Study Tools on Chemistry — subjById falls back to SUBJECTS[0] — and a
     starred Civics would sit in favs forever matching no pill. */
  state.subject = canonicalSubject(state.subject);
  if (!subjById(state.subject) || !SUBJECTS.some((s) => s.id === state.subject)) state.subject = SUBJECTS[0].id;
  state.favs = state.favs
    .map(canonicalSubject)
    .filter((id, i, a) => a.indexOf(id) === i && SUBJECTS.some((s) => s.id === id));
  if (!GROUPS.some((g) => g.id === state.group)) state.group = groupOf(state.subject);

  // ── favourites ───────────────────────────────────────────────────────────
  // Twelve subjects in one horizontal rail means the one you actually use is
  // often scrolled off-screen. Starred subjects sort to the front so they're
  // always the first thing under your cursor.
  const isFav = (id) => state.favs.indexOf(id) >= 0;
  function toggleFav(id) {
    const i = state.favs.indexOf(id);
    if (i >= 0) state.favs.splice(i, 1); else state.favs.push(id);
    save();
    renderRail();
  }
  /** Favourites first, each group keeping the canonical SUBJECTS order. */
  function orderedSubjects() {
    const fav = SUBJECTS.filter((s) => isFav(s.id));
    const rest = SUBJECTS.filter((s) => !isFav(s.id));
    return fav.concat(rest);
  }
  function pillHtml(s) {
    const on = isFav(s.id);
    return `<div class="fsh-pill-wrap${on ? ' faved' : ''}">`
      + `<button type="button" class="fsh-pill${s.id === state.subject ? ' active' : ''}" data-sub="${s.id}">`
      + `<span class="fsh-pill-ico">${s.ico}</span>${esc(s.name)}</button>`
      + `<button type="button" class="fsh-fav-btn${on ? ' on' : ''}" data-fav="${s.id}"`
      + ` aria-pressed="${on ? 'true' : 'false'}"`
      + ` title="${on ? 'Remove from favourites' : 'Add to favourites'}"`
      + ` aria-label="${on ? 'Remove' : 'Add'} ${esc(s.name)} ${on ? 'from' : 'to'} favourites">`
      + `${on ? '★' : '☆'}</button></div>`;
  }
  /* The umbrella row. Five of these replace one thirteen-pill scroller as the
     top-level choice; the subject rail below then only ever draws the handful
     inside the umbrella you're in, so nothing is hidden off the right edge. */
  function groupRowHtml() {
    const active = state.group || groupOf(state.subject);
    return GROUPS.map((g) => {
      const n = SUBJECTS.reduce((t, s) => t + (s.group === g.id ? 1 : 0), 0);
      return `<button type="button" class="fsh-group${g.id === active ? ' active' : ''}" data-group="${esc(g.id)}"`
        + ` aria-pressed="${g.id === active ? 'true' : 'false'}">`
        + `<span class="fsh-group-ico" aria-hidden="true">${g.ico}</span>${esc(g.name)}`
        + `<span class="fsh-group-n" aria-hidden="true">${n}</span></button>`;
    }).join('');
  }
  function railHtml() {
    const active = state.group || groupOf(state.subject);
    const items = orderedSubjects().filter((s) => s.group === active).map(pillHtml);
    /* Count the favourites that actually matched a subject, not state.favs
       .length. The two diverge as soon as favs holds an id with no subject
       behind it — a renamed subject, or a record written by a different
       version — and then the divider lands that many slots too far right,
       sitting after a subject you never starred. Harmless while favourites
       never left the device that wrote them; now that they sync between
       devices, a stale id is a normal thing to receive.

       Counted within the active umbrella now that the rail only draws one:
       counting across all eleven would put the divider past the end of a
       three-subject group. */
    const inGroup = SUBJECTS.filter((s) => s.group === active);
    const favCount = inGroup.reduce((n, s) => n + (isFav(s.id) ? 1 : 0), 0);
    // A divider only reads as meaningful when there is something on both sides.
    if (favCount > 0 && favCount < inGroup.length) {
      items.splice(favCount, 0, '<span class="fsh-rail-sep" aria-hidden="true"></span>');
    }
    return items.join('');
  }
  function renderRail() {
    const rail = $('fshRail'); if (!rail) return;
    rail.innerHTML = railHtml();
    const gr = $('fshGroups'); if (gr) gr.innerHTML = groupRowHtml();
  }
  /* Switching umbrella lands you on a subject inside it rather than leaving the
     stage showing something from the group you just left. Your starred subject
     wins if one is in there, otherwise the first. */
  function selectGroup(gid) {
    if (!GROUPS.some((g) => g.id === gid)) return;
    const inGroup = SUBJECTS.filter((s) => s.group === gid);
    if (!inGroup.length) { state.group = gid; save(); renderRail(); return; }
    const target = inGroup.find((s) => isFav(s.id)) || inGroup[0];
    /* Deliberately not setting state.group here. selectSubject decides whether
       the rail needs rebuilding by comparing the old umbrella with the new
       one, so setting it first would make the change invisible to that check
       and leave the rail showing the umbrella you just navigated away from. */
    selectSubject(target.id);
  }

  function hexRgb(hex) { const v = hex.replace('#', ''); const h = v.length === 3 ? v.split('').map((c) => c + c).join('') : v; const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function applyAccent(hex) { const r = $('fshRoot'); if (!r) return; r.style.setProperty('--fsh-accent', hex); r.style.setProperty('--fsh-accent-rgb', hexRgb(hex).join(',')); }

  // ════════════════════════════════════════════════════════════════════════
  //  TOOL REGISTRY  +  FLUX-AI BRIDGE
  // ════════════════════════════════════════════════════════════════════════
  const registry = {};          // subjectId -> [tool]
  const aiTools = {};           // name -> fn(args)
  const aiManifest = [];        // [{name, subject, description, params}]
  function addAITool(d) {
    if (!d || !d.name || typeof d.run !== 'function') return;
    aiTools[d.name] = d.run;
    if (!aiManifest.some((m) => m.name === d.name)) aiManifest.push({ name: d.name, subject: d.subject || '', description: d.description || '', params: d.params || {} });
  }
  function register(subjectId, tools) {
    if (!Array.isArray(tools)) tools = [tools];
    registry[subjectId] = (registry[subjectId] || []).concat(tools);
    tools.forEach((t) => { if (t && t.ai) addAITool(Object.assign({ subject: subjectId }, t.ai)); });
    if ($('fshRoot') && state.subject === subjectId && !searchQ) renderStage();
  }

  function aiSystemAddendum() {
    if (!aiManifest.length) return '';
    const lines = aiManifest.map((m) => `• ${m.name}(${Object.keys(m.params || {}).join(', ')}) — ${m.description}`);
    return 'FLUX STUDY TOOLS available in-app. You may reference these and tell the student to run them via the Study tab or a slash command (e.g. /balance, /molar). Tools:\n' + lines.join('\n');
  }
  // make every AI request aware of the tools (non-invasive fetch wrapper)
  (function patchFetch() {
    if (window.__fshFetchPatched) return; window.__fshFetchPatched = true;
    const orig = window.fetch;
    window.fetch = function (url, opts) {
      try {
        const u = typeof url === 'string' ? url : (url && url.url) || '';
        const aiUrl = (window.API && window.API.ai) || '';
        if (opts && typeof opts.body === 'string' && aiUrl && u && u.indexOf(aiUrl) !== -1 && /"messages"/.test(opts.body)) {
          const b = JSON.parse(opts.body);
          if (b && Array.isArray(b.messages)) { const add = aiSystemAddendum(); if (add) { b.system = (b.system ? b.system + '\n\n' : '') + add; opts = Object.assign({}, opts, { body: JSON.stringify(b) }); } }
        }
      } catch (e) {}
      return orig.call(this, url, opts);
    };
  })();
  // slash command runner: "/balance H2 + O2 = H2O"
  function slash(text) {
    const m = String(text || '').trim().match(/^\/(\w+)\s*(.*)$/s);
    if (!m) return null;
    const name = m[1].toLowerCase(), arg = m[2].trim();
    const map = { balance: 'balanceEquation', molar: 'molarMass', element: 'elementInfo', ph: 'phCalc', gas: 'gasLaw', convert: 'convertUnit', suvat: 'suvat', ohms: 'ohmsLaw', projectile: 'projectile', stats: 'statsSummary', matrix: 'matrixOp', circle5: 'circleOfFifths', scale: 'scaleNotes', chord: 'chordNotes' };
    const fn = aiTools[map[name]] || aiTools[name];
    if (!fn) return null;
    try { const out = fn(arg); return typeof out === 'string' ? out : JSON.stringify(out, null, 2); } catch (e) { return 'Error: ' + e.message; }
  }
  // register chemistry AI tools (UI is bespoke, so add directly)
  addAITool({ name: 'balanceEquation', subject: 'chemistry', description: 'Balance a chemical equation. Arg: "H2 + O2 = H2O".', params: { equation: 'string' }, run: (a) => { const r = balance(typeof a === 'string' ? a : a.equation); const side = (sp, o) => sp.map((s, i) => (r.coeffs[o + i] > 1 ? r.coeffs[o + i] : '') + s.formula).join(' + '); return `${side(r.R, 0)} → ${side(r.P, r.R.length)}  [${r.type.k}]`; } });
  addAITool({ name: 'molarMass', subject: 'chemistry', description: 'Molar mass (g/mol) of a formula, e.g. "Ca(OH)2".', params: { formula: 'string' }, run: (a) => { const f = typeof a === 'string' ? a : a.formula; const c = parseFormula(f); let m = 0; for (const s in c) { const z = massOf(s); if (z == null) throw new Error('Unknown element ' + s); m += z * c[s]; } return +m.toFixed(3); } });
  addAITool({ name: 'elementInfo', subject: 'chemistry', description: 'Look up an element by symbol/name/number.', params: { query: 'string' }, run: (a) => { const q = String(typeof a === 'string' ? a : a.query).trim().toLowerCase(); const e = elements().find((x) => x.s.toLowerCase() === q || x.name.toLowerCase() === q || String(x.n) === q); if (!e) throw new Error('No element'); return { number: e.n, symbol: e.s, name: e.name, mass: e.mass, category: e.cat, config: e.ec }; } });
  addAITool({ name: 'phCalc', subject: 'chemistry', description: 'pH from [H+] (mol/L). Arg: concentration.', params: { conc: 'number' }, run: (a) => { const c = parseFloat(typeof a === 'string' ? a : a.conc); if (!(c > 0)) throw new Error('Need [H+] > 0'); return +(-Math.log10(c)).toFixed(2); } });
  addAITool({ name: 'gasLaw', subject: 'chemistry', description: 'Ideal gas: give 3 of P(kPa),V(L),n(mol),T(K) to find the 4th. Arg: "P=100 V=2 T=298".', params: { P: 'number', V: 'number', n: 'number', T: 'number' }, run: (a) => gasSolve(typeof a === 'string' ? parseKV(a) : a) });

  // ── helpers shared with chemistry tools ──────────────────────────────────
  function parseKV(s) { const o = {}; String(s).split(/[\s,]+/).forEach((t) => { const m = t.split('='); if (m.length === 2) o[m[0].trim().toUpperCase()] = parseFloat(m[1]); }); return o; }
  function gasSolve(o) { const R = 8.314; let { P, V, n, T } = o; const known = ['P', 'V', 'n', 'T'].filter((k) => o[k] != null && !isNaN(o[k])); if (known.length !== 3) throw new Error('Give exactly 3 of P,V,n,T'); if (P == null) P = (n * R * T) / V / 1000; else if (V == null) V = (n * R * T) / (P * 1000); else if (n == null) n = (P * 1000 * V) / (R * T); else T = (P * 1000 * V) / (n * R); return { P: +(P).toFixed(3) + ' kPa', V: +(V).toFixed(3) + ' L', n: +(n).toFixed(4) + ' mol', T: +(T).toFixed(2) + ' K' }; }

  // ════════════════════════════════════════════════════════════════════════
  //  CHEMISTRY FLAGSHIP
  // ════════════════════════════════════════════════════════════════════════
  const CATS = [['all','All','#8b90ad'],['alkali','Alkali','#e23e57'],['alkaline','Alkaline earth','#f47b2f'],['transition','Transition','#3a5bd9'],['post-transition','Post-transition','#2d8aa6'],['metalloid','Metalloid','#5b3fd6'],['nonmetal','Nonmetal','#1f9e74'],['halogen','Halogen','#1f9bb8'],['noble','Noble gas','#8a3fd6'],['lanthanide','Lanthanide','#c23d96'],['actinide','Actinide','#c23d5a']];
  let ptCat = 'all', ptQuery = '';
  function elCell(e) { const m = e.mass === Math.round(e.mass) ? e.mass : e.mass.toFixed(2); return `<button type="button" class="fsh-el" data-cat="${e.cat}" data-n="${e.n}" style="grid-row:${e.row};grid-column:${e.col}" aria-label="${esc(e.name)}"><span class="e-n">${e.n}</span><span class="e-s">${esc(e.s)}</span><span class="e-m">${m}</span></button>`; }
  function renderTableTab() {
    const els = elements(); if (!els.length) return `<div class="fsh-card" style="padding:24px">Periodic data loading… reopen in a moment.</div>`;
    const grid = els.map(elCell).join('') + `<div class="fsh-pt-spacer" style="grid-row:8;grid-column:1/-1"></div><div class="fsh-pt-fnote" style="grid-row:11">La–Lu (57–71) · Ac–Lr (89–103) shown in the lower two rows.</div>`;
    return `<div class="fsh-panel">
      <div class="fsh-pt-toolbar">
        <div class="fsh-search" style="min-width:220px;flex:1;max-width:320px"><span class="fsh-search-ico">⌕</span><input id="fshPtSearch" type="search" placeholder="Find element, symbol or #…" value="${esc(ptQuery)}"></div>
        <div class="fsh-pt-cats" id="fshPtCats">${CATS.map((c) => `<button type="button" class="fsh-cat-chip${ptCat === c[0] ? ' active' : ''}" data-cat="${c[0]}">${c[0] === 'all' ? '' : `<span class="dot" style="background:${c[2]}"></span>`}${esc(c[1])}</button>`).join('')}</div>
      </div>
      <div class="fsh-pt-scroll"><div class="fsh-pt" id="fshPtGrid">${grid}</div></div>
      <div class="fsh-el-detail" id="fshElDetail">${elDetail(elByN(selEl))}</div></div>`;
  }
  const phaseAt = (e) => { if (e.mp != null && 25 < e.mp) return 'Solid'; if (e.bp != null && 25 > e.bp) return 'Gas'; if (e.mp != null && e.bp != null) return 'Liquid'; return e.phase === 'g' ? 'Gas' : e.phase === 'l' ? 'Liquid' : 'Solid'; };
  function elDetail(e) {
    if (!e) return '';
    const p = (k, v) => v == null || v === '' ? '' : `<div class="fsh-prop"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    return `<div class="fsh-eld fsh-card"><div class="fsh-eld-badge" data-cat="${e.cat}" style="background:var(--el-c)"><span class="b-n">${e.n}</span><span class="b-s">${esc(e.s)}</span><span class="b-name">${esc(e.name)}</span><span class="b-m">${e.mass}</span></div>
      <div class="fsh-eld-main"><h3>${esc(e.name)}</h3><div class="fsh-eld-cat">${esc(e.cat.replace('-', ' '))} · Period ${e.p}${e.g ? ' · Group ' + e.g : ''}</div>
      <div class="fsh-eld-props">${p('Atomic mass', e.mass)}${p('Config', esc(e.ec))}${p('Phase 25°C', phaseAt(e))}${p('Melting', e.mp != null ? e.mp + ' °C' : null)}${p('Boiling', e.bp != null ? e.bp + ' °C' : null)}${p('Density', e.d != null ? e.d + ' g/cm³' : null)}${p('Electroneg.', e.en)}${p('Found', e.year ? (e.year < 0 ? Math.abs(e.year) + ' BCE' : e.year) : null)}</div>
      ${e.fact ? `<p class="fsh-eld-fact">${esc(e.fact)}</p>` : ''}<div style="margin-top:14px"><button type="button" class="fsh-btn ghost" data-act="view-atom" data-n="${e.n}">View 3D atom →</button></div></div></div>`;
  }
  function applyPtFilter() { const q = ptQuery.trim().toLowerCase(); document.querySelectorAll('#fshPtGrid .fsh-el').forEach((c) => { const e = elByN(+c.dataset.n); const ok = (ptCat === 'all' || e.cat === ptCat) && (!q || e.name.toLowerCase().includes(q) || e.s.toLowerCase() === q || String(e.n) === q); c.classList.toggle('dim', !ok); }); }

  // atom
  function shellFill(z) { const cap = [2, 8, 18, 32, 32, 18, 8], out = []; let rem = z; for (const c of cap) { if (rem <= 0) break; out.push(Math.min(c, rem)); rem -= c; } return out; }
  // interactive 3D atom — canvas, perspective, depth-sorted electron spheres, drag-orbit + scroll-zoom
  let atomRot = { yaw: 0, pitch: -1.15 }, atomZoom = 1, atomRAF = 0, atomDrag = null;
  const rotXp = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
  const rotYp = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
  function atomSideHTML(e) {
    const shells = shellFill(e.n);
    return `<div class="fsh-card"><div class="fsh-atom-picker"><button type="button" class="fsh-iconbtn" data-act="atom-prev" aria-label="Previous">‹</button><input id="fshAtomInput" type="text" value="${esc(e.s)}" aria-label="Element"><button type="button" class="fsh-iconbtn" data-act="atom-next" aria-label="Next">›</button></div>
      <div style="margin-top:14px"><div style="font-size:22px;font-weight:740">${esc(e.name)} <span style="color:var(--fsh-mut);font-weight:500">· ${e.n}</span></div><div style="font-size:12.5px;color:var(--fsh-mut);margin-top:2px;text-transform:capitalize">${esc(e.cat.replace('-', ' '))} · ${e.mass} u</div></div>
      <div class="fsh-shellbars">${shells.map((c, i) => `<span class="fsh-shellbar">n${i + 1}: ${c}e⁻</span>`).join('')}</div>
      <div style="margin-top:12px;font-size:13px;color:var(--fsh-ink-2)">Configuration<br><b style="font-family:monospace;font-size:14px">${esc(e.ec)}</b></div></div>
    <div class="fsh-card" style="padding:16px 18px"><div class="fsh-atom-controls"><span style="font-size:12px;color:var(--fsh-mut)">Orbit speed</span><input id="fshAtomSpeed" class="fsh-range" type="range" min="0" max="3" step="0.1" value="${atomSpeed}"></div>
      <div class="fsh-atom-controls" style="margin-top:10px"><button type="button" class="fsh-btn ghost mini" data-act="atom-reset">⟳ Reset view</button><span class="fsh-note" style="margin:0">Drag to rotate · scroll to zoom</span></div></div>`;
  }
  function renderAtomTab() {
    const e = elByN(atomN) || elements()[0]; if (!e) return `<div class="fsh-card" style="padding:24px">Loading…</div>`;
    return `<div class="fsh-panel"><div class="fsh-atom-wrap">
      <div class="fsh-atom-stage"><div id="fshAtomCanvas"></div><div class="fsh-atom-hint">Drag to rotate · scroll to zoom</div></div>
      <div class="fsh-atom-info" id="fshAtomSide">${atomSideHTML(e)}</div></div></div>`;
  }
  function updateAtomInfo() { const side = $('fshAtomSide'); const e = elByN(atomN); if (side && e) side.innerHTML = atomSideHTML(e); }
  function mountAtom3D() {
    const wrap = $('fshAtomCanvas'); if (!wrap) return;
    const root = $('fshRoot');
    const cvs = document.createElement('canvas'); wrap.innerHTML = ''; wrap.appendChild(cvs);
    const ctx = cvs.getContext('2d'); let W = 0; const Hh = 360; let dpr = 1;
    function size() { W = wrap.clientWidth || 520; dpr = Math.min(2, window.devicePixelRatio || 1); cvs.width = W * dpr; cvs.height = Hh * dpr; cvs.style.width = W + 'px'; cvs.style.height = Hh + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size();
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    let last = performance.now();
    // ── nucleus: golden-spiral packed proton/neutron cluster (ZPeriod-style) ──
    let nucFor = 0, nucleons = [];
    function packNucleus(e) {
      nucFor = e.n;
      const mass = Math.round(massOf(e.s) || e.n * 2);
      const protons = e.n, total = Math.max(1, protons + Math.max(0, mass - protons));
      const shown = Math.min(44, total);
      let pLeft = Math.max(1, Math.round(shown * protons / total));
      const GA = Math.PI * (3 - Math.sqrt(5));
      nucleons = [];
      for (let i = 0; i < shown; i++) {
        const t = (i + 0.5) / shown, rr = Math.cbrt(t), ph = Math.acos(1 - 2 * t), th = GA * i;
        const kind = (i % 2 === 0 && pLeft > 0) ? (pLeft--, 'p') : (pLeft >= shown - i ? (pLeft--, 'p') : 'n');
        nucleons.push({ p: [rr * Math.sin(ph) * Math.cos(th), rr * Math.sin(ph) * Math.sin(th), rr * Math.cos(ph)], kind });
      }
    }
    // ── each shell gets its own orbital plane (tilt + golden-angle node) ──
    const ringPoint = (R, a, ci, si, cn, sn) => {
      const x = R * Math.cos(a), y = R * Math.sin(a);
      const y1 = y * ci, z1 = y * si;
      return [x * cn + z1 * sn, y1, -x * sn + z1 * cn];
    };
    function frame(now) {
      if (!document.body.contains(cvs)) { cancelAnimationFrame(atomRAF); atomRAF = 0; return; }
      last = now;
      const e = elByN(atomN) || elements()[0]; if (!e) { atomRAF = requestAnimationFrame(frame); return; }
      if (nucFor !== e.n) packNucleus(e);
      if (Math.abs(W - (wrap.clientWidth || W)) > 1) size();
      const acc = (root && getComputedStyle(root).getPropertyValue('--fsh-accent').trim()) || '#34d0ff';
      const accRgb = (root && getComputedStyle(root).getPropertyValue('--fsh-accent-rgb').trim()) || '52,208,255';
      const shells = shellFill(e.n), tsec = reduced ? 0 : now / 1000;
      const cx = W / 2, cy = Hh / 2, F = 470, base = Math.min(W, Hh) * 0.11 * atomZoom;
      const cosY = Math.cos(atomRot.yaw), sinY = Math.sin(atomRot.yaw), cosP = Math.cos(atomRot.pitch), sinP = Math.sin(atomRot.pitch);
      const proj = (p) => { const x1 = p[0] * cosY + p[2] * sinY, z1 = -p[0] * sinY + p[2] * cosY, y1 = p[1]; const y2 = y1 * cosP - z1 * sinP, z2 = y1 * sinP + z1 * cosP; const s = F / (F - z2); return { x: cx + x1 * s, y: cy + y2 * s, z: z2, s }; };
      ctx.clearRect(0, 0, W, Hh);
      // vignette backdrop
      const bg = ctx.createRadialGradient(cx, cy, 8, cx, cy, Math.max(W, Hh) * 0.62);
      bg.addColorStop(0, 'rgba(' + accRgb + ',0.10)'); bg.addColorStop(0.45, 'rgba(' + accRgb + ',0.03)'); bg.addColorStop(1, 'rgba(2,6,16,0)');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, Hh);
      const items = []; let maxR = 1;
      shells.forEach((cnt, i) => {
        const R = base * (1.7 + i * 1.45); maxR = Math.max(maxR, R);
        // All shells share one flat orbital plane (incl = node = 0) — the
        // viewer tilts the whole atom with drag instead of per-shell tilts.
        const ci = 1, si = 0, cn = 1, sn = 0;
        // orbit ring (depth-faded in two passes: back half dimmer)
        ctx.lineWidth = 1.2;
        for (let pass = 0; pass < 2; pass++) {
          ctx.beginPath();
          let started = false;
          for (let k = 0; k <= 96; k++) {
            const a = k / 96 * 2 * Math.PI;
            const pr = proj(ringPoint(R, a, ci, si, cn, sn));
            const backHalf = pr.z < 0;
            if ((pass === 0) === backHalf) { if (started) ctx.lineTo(pr.x, pr.y); else { ctx.moveTo(pr.x, pr.y); started = true; } }
            else started = false;
          }
          ctx.strokeStyle = 'rgba(' + accRgb + (pass === 0 ? ',.10)' : ',.30)');
          ctx.stroke();
        }
        const phase = tsec * 0.6 * Math.max(0.04, atomSpeed) / (i * 0.28 + 1) + i * 0.7;
        for (let j = 0; j < cnt; j++) {
          const a = j / cnt * 2 * Math.PI + phase;
          const pr = proj(ringPoint(R, a, ci, si, cn, sn));
          // motion trail: short fading arc behind the electron
          if (!reduced) {
            for (let k = 1; k <= 5; k++) {
              const tp = proj(ringPoint(R, a - k * 0.085, ci, si, cn, sn));
              ctx.globalAlpha = 0.16 * (1 - k / 6);
              ctx.fillStyle = acc;
              ctx.beginPath(); ctx.arc(tp.x, tp.y, Math.max(1, 4.6 * tp.s * (1 - k / 7)), 0, 7); ctx.fill();
            }
            ctx.globalAlpha = 1;
          }
          items.push({ z: pr.z, x: pr.x, y: pr.y, s: pr.s, kind: 'e' });
        }
      });
      // nucleus cluster (slow tumble), depth-sorted with the electrons
      const nucR = base * 0.85, tum = tsec * 0.25;
      const ct = Math.cos(tum), st = Math.sin(tum);
      nucleons.forEach((nu) => {
        const p = nu.p, x1 = p[0] * ct + p[2] * st, z1 = -p[0] * st + p[2] * ct;
        const pr = proj([x1 * nucR, p[1] * nucR, z1 * nucR]);
        items.push({ z: pr.z, x: pr.x, y: pr.y, s: pr.s, kind: nu.kind });
      });
      items.sort((a, b) => a.z - b.z);
      const sphere = (x, y, r, col, dark) => { const hx = x - r * 0.38, hy = y - r * 0.42; const g = ctx.createRadialGradient(hx, hy, r * 0.08, x, y, r * 1.05); g.addColorStop(0, '#ffffff'); g.addColorStop(0.2, '#f2f6ff'); g.addColorStop(0.55, col); g.addColorStop(1, dark || '#04101b'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
      const depthOf = (z) => Math.max(0, Math.min(1, (z + maxR) / (2 * maxR)));
      items.forEach((it) => {
        const depth = depthOf(it.z);
        if (it.kind === 'e') {
          const r = Math.max(2.5, 6.4 * it.s);
          ctx.globalAlpha = 0.45 + 0.55 * depth;
          ctx.shadowColor = acc; ctx.shadowBlur = 14 * depth;
          sphere(it.x, it.y, r, acc);
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          return;
        }
        const r = Math.max(2.2, base * 0.30 * it.s);
        const proton = it.kind === 'p';
        ctx.globalAlpha = 0.6 + 0.4 * depth;
        ctx.shadowColor = proton ? '#ff6f61' : '#7d8fb3';
        ctx.shadowBlur = proton ? 10 * depth : 5 * depth;
        sphere(it.x, it.y, r, proton ? '#ff6f61' : '#8b9bb8', proton ? '#3a0d0d' : '#0d1322');
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      });
      // element badge (top-left, off the model)
      ctx.fillStyle = 'rgba(' + accRgb + ',.9)';
      ctx.font = '800 15px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(e.s, 14, 12);
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.font = '600 11px system-ui';
      ctx.fillText(e.name + ' · Z=' + e.n, 14, 31);
      atomRAF = requestAnimationFrame(frame);
    }
    cancelAnimationFrame(atomRAF); atomRAF = 0; frame(performance.now());
    cvs.style.touchAction = 'none';
    cvs.addEventListener('pointerdown', (ev) => { atomDrag = { x: ev.clientX, y: ev.clientY, yaw: atomRot.yaw, pitch: atomRot.pitch }; try { cvs.setPointerCapture(ev.pointerId); } catch (e2) {} });
    // Drag moves the model with the cursor on both axes. Screen Y grows
    // downward and proj() rotates the model, not the camera, so both deltas
    // are negated.
    cvs.addEventListener('pointermove', (ev) => { if (!atomDrag) return; atomRot.yaw = atomDrag.yaw - (ev.clientX - atomDrag.x) * 0.01; atomRot.pitch = atomDrag.pitch - (ev.clientY - atomDrag.y) * 0.01; });
    const end = () => { atomDrag = null; }; cvs.addEventListener('pointerup', end); cvs.addEventListener('pointercancel', end);
    cvs.addEventListener('wheel', (ev) => { ev.preventDefault(); atomZoom = Math.max(0.5, Math.min(2.6, atomZoom * (1 - ev.deltaY * 0.0012))); }, { passive: false });
  }

  // tools tab
  let balInput = 'C3H8 + O2 = CO2 + H2O', molInput = 'C6H12O6';
  function balOut() {
    let r; try { r = balance(balInput); } catch (e) { return `<div class="fsh-err">⚠ ${esc(e.message)}</div>`; }
    const side = (sp, o) => sp.map((s, i) => `${r.coeffs[o + i] > 1 ? `<span class="coef">${r.coeffs[o + i]}</span>` : ''}${subFmt(s.formula)}`).join('<span class="op">+</span>');
    return `<div class="fsh-eq">${side(r.R, 0)}<span class="arrow">→</span>${side(r.P, r.R.length)}</div><div class="fsh-eq-type">⚗ <b>${esc(r.type.k)}</b> · ${esc(r.type.d)}</div>`;
  }
  function molOut() {
    let c; try { c = parseFormula(molInput); } catch (e) { return `<div class="fsh-err">⚠ ${esc(e.message)}</div>`; }
    let mass = 0; const rows = []; for (const s in c) { const m = massOf(s); if (m == null) return `<div class="fsh-err">⚠ Unknown element: ${esc(s)}</div>`; const sub = m * c[s]; mass += sub; rows.push({ s, n: c[s], sub }); }
    if (!mass) return ''; rows.sort((a, b) => b.sub - a.sub);
    return `<div class="fsh-mm-total">${mass.toFixed(3)} <small>g/mol</small></div><div class="fsh-mm-rows">${rows.map((r) => `<div><div class="fsh-mm-row"><span class="el">${esc(r.s)} × ${r.n}</span><span>${r.sub.toFixed(2)} · ${(r.sub / mass * 100).toFixed(1)}%</span></div><div class="fsh-mm-bar" style="width:${(r.sub / mass * 100).toFixed(1)}%"></div></div>`).join('')}</div>`;
  }
  function renderToolsTab() {
    return `<div class="fsh-panel"><div class="fsh-tools-grid">
      <div class="fsh-tool fsh-card"><h3>⚖ Equation balancer</h3><p class="sub">Type a skeleton equation — separate sides with <b>=</b>, <b>→</b> or <b>-</b>. Solves instantly.</p>
        <div class="fsh-chips-row">${['H2 + O2 = H2O','CH4 + O2 = CO2 + H2O','Fe + O2 = Fe2O3','Al + HCl = AlCl3 + H2'].map((q) => `<button type="button" class="fsh-cat-chip" data-bal="${esc(q)}">${subFmt(q)}</button>`).join('')}</div>
        <div class="fsh-field"><input id="fshBalIn" class="fsh-input" value="${esc(balInput)}" spellcheck="false"><button type="button" class="fsh-btn ghost mini" data-act="ins-arrow" title="Insert arrow">＋ →</button><button type="button" class="fsh-btn" data-act="balance">Balance</button></div>
        <div class="fsh-note">Can't type →? Just use “=” or “-”. The ＋→ button inserts one too.</div>
        <div class="fsh-eq-out" id="fshBalOut">${balOut()}</div></div>
      <div class="fsh-tool fsh-card"><h3>⚗ Molar mass</h3><p class="sub">Parse any formula — try Ca(OH)2 or (NH4)2SO4.</p>
        <div class="fsh-field"><input id="fshMolIn" class="fsh-input" value="${esc(molInput)}" spellcheck="false"><button type="button" class="fsh-btn" data-act="molar">Compute</button></div>
        <div class="fsh-eq-out" id="fshMolOut">${molOut()}</div></div>
      <div class="fsh-tool fsh-card"><h3>pH &amp; dilution</h3><p class="sub">pH from [H⁺], and C₁V₁ = C₂V₂.</p>
        <div class="fsh-label"><span>[H⁺] (mol/L)</span></div><div class="fsh-field"><input id="fshPhIn" class="fsh-input" value="1e-3"><button type="button" class="fsh-btn" data-act="ph">pH</button></div><div class="fsh-out" id="fshPhOut"></div>
        <div class="fsh-label" style="margin-top:16px"><span>Dilution — leave one blank</span></div>
        <div class="fsh-field"><input id="fshD_c1" class="fsh-input short" placeholder="C₁"><input id="fshD_v1" class="fsh-input short" placeholder="V₁"><input id="fshD_c2" class="fsh-input short" placeholder="C₂"><input id="fshD_v2" class="fsh-input short" placeholder="V₂"><button type="button" class="fsh-btn" data-act="dil">Solve</button></div><div class="fsh-out" id="fshDilOut"></div></div>
      <div class="fsh-tool fsh-card"><h3>Ideal gas law</h3><p class="sub">PV = nRT — fill any three, leave one blank.</p>
        <div class="fsh-field"><input id="fshG_P" class="fsh-input short" placeholder="P kPa"><input id="fshG_V" class="fsh-input short" placeholder="V L"><input id="fshG_n" class="fsh-input short" placeholder="n mol"><input id="fshG_T" class="fsh-input short" placeholder="T K"><button type="button" class="fsh-btn" data-act="gas">Solve</button></div><div class="fsh-out" id="fshGasOut"></div></div>
      <div class="fsh-tool fsh-card"><h3>Solubility table</h3><p class="sub">Common ionic compounds in water (25 °C).</p>
        <div class="fsh-sol-scroll"><table class="fsh-sol"><thead><tr><th></th>${SOL_ANIONS.map((a) => `<th>${a}</th>`).join('')}</tr></thead><tbody>${SOL_CATIONS.map((cat, i) => `<tr><th>${cat}</th>${SOL_GRID[i].map((s) => `<td data-s="${s}">${s === 's' ? 'sl' : s}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="fsh-sol-legend"><span><i style="background:rgba(52,211,153,.5)"></i>Soluble</span><span><i style="background:rgba(251,191,36,.5)"></i>Slightly</span><span><i style="background:rgba(248,113,113,.5)"></i>Insoluble</span></div></div>
      <div class="fsh-tool fsh-card"><h3>Constants</h3><p class="sub">Data-booklet values.</p><div class="fsh-const">${CONSTANTS.map((c) => `<div class="fsh-prop"><div class="k">${esc(c[0])}</div><div class="v" style="font-size:13px">${esc(c[1])}</div></div>`).join('')}</div></div>
    </div></div>`;
  }
  function renderIonsTab() {
    const grid = (arr) => `<div class="fsh-ion-grid">${arr.map((i) => `<div class="fsh-ion"><span class="f">${i[0]}</span><div class="n">${esc(i[1])}</div></div>`).join('')}</div>`;
    return `<div class="fsh-panel"><div class="fsh-section-head"><span class="fsh-sh-ico">＋</span><span><h2>Cations</h2><p>Positive ions — name & charge</p></span></div>${grid(IONS_CAT)}
      <div class="fsh-section-head"><span class="fsh-sh-ico">－</span><span><h2>Anions</h2><p>Negative ions — including polyatomics</p></span></div>${grid(IONS_AN)}</div>`;
  }

  // worksheet
  let wsCfg = { types: new Set(['synthesis','decomposition','combustion','single','double','redox']), diff: 'all', count: 10, mode: 'balance' }, wsGen = [];
  const wsPool = () => EQUATIONS.filter(([eq, t, d]) => wsCfg.types.has(t) && (wsCfg.diff === 'all' || wsCfg.diff === d));
  function wsGenerate() {
    const pool = wsPool().slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    wsGen = pool.slice(0, wsCfg.count).map(([eq, t]) => { let b = null; try { b = balance(eq); } catch (e) {} return { eq, t, bal: b }; }).filter((x) => x.bal);
  }
  function skeleton(eq, blanks) { const s = splitEquation(eq); const side = (txt) => txt.split('+').map((f) => `${blanks ? '<span class="blank">__ </span>' : ''}${subFmt(f.trim())}`).join(' <span class="op">+</span> '); return `${side(s[0])} <span class="arrow">→</span> ${side(s[1])}`; }
  function balancedStr(it) { const r = it.bal, side = (sp, o) => sp.map((s, i) => (r.coeffs[o + i] > 1 ? r.coeffs[o + i] : '') + subPlain(s.formula)).join(' + '); return `${side(r.R, 0)} → ${side(r.P, r.R.length)}`; }
  const wsActive = (g, v) => g === 'diff' ? wsCfg.diff === v : g === 'count' ? String(wsCfg.count) === v : g === 'mode' ? wsCfg.mode === v : false;
  function wsPreview() { if (!wsGen.length) return `<p style="color:var(--fsh-mut)">No equations match — pick at least one reaction type.</p>`; return wsGen.map((it, i) => `<div class="fsh-ws-q"><span class="num">${i + 1}</span><span class="eq">${skeleton(it.eq, wsCfg.mode !== 'type')}${wsCfg.mode !== 'balance' ? ` &nbsp;<span class="blank">— type: ______</span>` : ''}</span></div>`).join(''); }
  function renderWorksheetTab() {
    if (!wsGen.length) wsGenerate();
    const seg = (g, opts) => `<div class="fsh-seg">${opts.map(([v, l]) => `<button type="button" data-ws="${g}" data-v="${v}" class="${wsActive(g, v) ? 'active' : ''}">${l}</button>`).join('')}</div>`;
    const avail = wsPool().length;
    return `<div class="fsh-panel"><div class="fsh-card" style="padding:22px"><div class="fsh-ws-controls">
      <div class="fsh-ws-group"><label>Reaction types</label><div class="fsh-seg">${[['synthesis','Synth'],['decomposition','Decomp'],['combustion','Combust'],['single','Single'],['double','Double'],['redox','Redox']].map(([v, l]) => `<button type="button" data-ws="type" data-v="${v}" class="${wsCfg.types.has(v) ? 'active' : ''}">${l}</button>`).join('')}</div></div>
      <div class="fsh-ws-group"><label>Difficulty</label>${seg('diff', [['all','All'],['easy','Easy'],['medium','Medium'],['hard','Hard']])}</div>
      <div class="fsh-ws-group"><label>Questions</label>${seg('count', [['5','5'],['10','10'],['15','15'],['20','20']])}</div>
      <div class="fsh-ws-group"><label>Mode</label>${seg('mode', [['balance','Balance'],['type','Identify'],['combined','Combined']])}</div></div>
      <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap"><button type="button" class="fsh-btn" data-act="ws-gen">↻ Generate new set</button><button type="button" class="fsh-btn ghost" data-act="ws-print">Print / Save PDF</button><span style="align-self:center;color:var(--fsh-mut);font-size:12.5px">${wsGen.length} shown · ${avail} available for these filters</span></div>
      <div class="fsh-ws-preview" id="fshWsPreview">${wsPreview()}</div></div></div>`;
  }
  function wsPrint() {
    if (!wsGen.length) return; let root = $('fshPrintRoot'); if (!root) { root = document.createElement('div'); root.id = 'fshPrintRoot'; document.body.appendChild(root); }
    const blanks = (txt) => txt.split('+').map((f) => `____ ${subPlain(f.trim())}`).join(' + ');
    const plain = (txt) => txt.split('+').map((f) => subPlain(f.trim())).join(' + ');
    const pq = (eq) => { const s = splitEquation(eq); if (wsCfg.mode === 'type') return `${plain(s[0])} → ${plain(s[1])} &nbsp; Type: ________`; if (wsCfg.mode === 'combined') return `${blanks(s[0])} → ${blanks(s[1])} &nbsp; Type: ______`; return `${blanks(s[0])} → ${blanks(s[1])}`; };
    const q = wsGen.map((it, i) => `<p class="pq"><span class="n">${i + 1}.</span>${pq(it.eq)}</p>`).join('');
    const key = wsGen.map((it, i) => `<p class="ak">${i + 1}. ${balancedStr(it)} &nbsp;<i>[${TYPE_LABEL[it.t] || it.t}]</i></p>`).join('');
    root.innerHTML = `<h1>Chemistry — Balancing Worksheet</h1><div class="meta">Name: __________________ · Date: ${new Date().toLocaleDateString()} · ${wsGen.length} questions · ${wsCfg.mode}</div>${q}<div class="ans-key"><h2>Answer key</h2>${key}</div>`;
    window.print();
  }

  const TAB_SLIDER = '<div class="fsh-tabs-slider" id="fshTabSlider" hidden><div class="fsh-tabs-thumb" id="fshTabThumb"></div></div>';
  // 'formulas' lives here rather than in the shared science sheet: chemistry's
  // formulas used to be reachable only as a tab inside the *physics* tool.
  const CHEM_TABS = [['table','⊞','Table'],['atom','◎','Atom'],['tools','⚗','Tools'],['ions','±','Ions'],['formulas','∑','Formulas'],['worksheet','📝','Worksheet']];
  function renderChemBody() {
    const b = $('fshChemBody'); if (!b) return;
    if (state.chemTab && state.chemTab.indexOf('lg-') === 0) { const chip = legacyChipsFor('chemistry').find((c) => 'lg-' + c.id === state.chemTab); if (chip) { renderLegacyTool(b, chip); return; } state.chemTab = 'table'; }
    if (state.chemTab === 'formulas') {
      if (typeof window.renderFormulaSheet === 'function') { window.renderFormulaSheet(b, 'Chemistry'); return; }
      state.chemTab = 'table';
    }
    b.innerHTML = state.chemTab === 'table' ? renderTableTab() : state.chemTab === 'atom' ? renderAtomTab() : state.chemTab === 'tools' ? renderToolsTab() : state.chemTab === 'ions' ? renderIonsTab() : renderWorksheetTab();
    if (state.chemTab === 'table') applyPtFilter();
    else if (state.chemTab === 'atom') setTimeout(mountAtom3D, 0);
  }
  function renderChem() {
    const tabs = CHEM_TABS.concat(legacyChipsFor('chemistry').map((c) => ['lg-' + c.id, c.icon || '🧰', c.label || c.id]));
    if (!tabs.some((t) => t[0] === state.chemTab)) state.chemTab = 'table';
    $('fshStage').innerHTML = `<div class="fsh-chem fsh-panel"><div class="fsh-tabs-wrap"><div class="fsh-chem-tabs" id="fshChemTabs"><div class="fsh-chem-tab-glide" id="fshTabGlide"></div>${tabs.map((t) => `<button type="button" class="fsh-chem-tab${state.chemTab === t[0] ? ' active' : ''}" data-tab="${esc(t[0])}"><span class="fsh-ct-ico">${t[1]}</span>${esc(t[2])}</button>`).join('')}</div>${TAB_SLIDER}</div><div class="fsh-chem-body" id="fshChemBody"></div></div>` + refStrip('chemistry');
    renderChemBody(); requestAnimationFrame(moveTabGlide);
  }

  // ── generic subject (registered tools) ───────────────────────────────────
  // `picked` is true only when the user just chose this tool (tool tab, quick
  // chip, search hit) — plain re-renders (opening the Study tab, switching
  // subject) must not fire a tool's open side effects. See renderLegacyTool.
  function renderRegistered(sid, picked) {
    const tools = (registry[sid] || []).filter((t) => typeof t.render === 'function');
    const stage = $('fshStage');
    if (!tools.length) { stage.innerHTML = soonHTML(sid) + refStrip(sid); return; }
    let active = state.tool[sid]; if (!tools.some((t) => t.id === active)) active = tools[0].id; state.tool[sid] = active; save();
    /* Languages showed eight tabs in one undifferentiated row — a trainer, a
       drill, two charts, and four legacy chips that only pop a modal — with
       nothing saying which was which. That row is what "Study Tools is
       overwhelming" looks like up close.

       The legacy chips (id 'lg-…', added by mergeLegacyOnce) are reference
       material: they leave the panel rather than doing anything inside it. So
       they sit behind a labelled divider instead of being interleaved with the
       tools you actually work in. Ordering only — every tool is still one
       click away and nothing about registration changes. */
    const own = tools.filter((t) => String(t.id).indexOf('lg-') !== 0);
    const legacy = tools.filter((t) => String(t.id).indexOf('lg-') === 0);
    const tabBtn = (t) => `<button type="button" class="fsh-chem-tab${t.id === active ? ' active' : ''}" data-tool="${t.id}"><span class="fsh-ct-ico">${t.icon || '•'}</span>${esc(t.name)}</button>`;
    // The divider only earns its place when there is something on both sides.
    const divider = own.length && legacy.length
      ? '<span class="fsh-tab-divider" aria-hidden="true">Reference</span>'
      : '';
    // data-sid so a click can ask the strip which subject it belongs to
    // instead of trusting a global that something else may have moved.
    stage.innerHTML = `<div class="fsh-chem fsh-panel"><div class="fsh-tabs-wrap"><div class="fsh-chem-tabs" id="fshChemTabs" data-sid="${esc(sid)}"><div class="fsh-chem-tab-glide" id="fshTabGlide"></div>${own.map(tabBtn).join('')}${divider}${legacy.map(tabBtn).join('')}</div>${TAB_SLIDER}</div><div class="fsh-chem-body" id="fshSubBody"></div></div>` + refStrip(sid);
    renderToolBody(sid, picked);
    requestAnimationFrame(moveTabGlide);
  }
  /* Re-render only the panel body, leaving the tab strip standing.
     This is what lets the highlight slide. The highlight is a real element
     (#fshTabGlide) animating its own left/width, so it can only travel if it
     survives the click — and rebuilding the whole stage replaced it with a
     brand-new one that simply appeared at the destination. Chemistry always
     animated because its click handler only ever re-rendered the body; every
     other subject went through renderRegistered and threw the strip away.
     Returns false when there is no body to draw into, so the caller can fall
     back to building the whole panel. */
  function renderToolBody(sid, picked) {
    const tools = (registry[sid] || []).filter((t) => typeof t.render === 'function');
    const old = $('fshSubBody');
    const tool = tools.find((t) => t.id === state.tool[sid]);
    if (!old || !tool) return false;
    /* Swap in a fresh element rather than rewriting this one.

       Some tools finish rendering later than they return. The grapher is the
       clearest: it mounts a Desmos iframe and, if that frame reports back that
       it failed, draws the built-in plotter into the body it captured — up to
       twelve seconds afterwards. Rewriting the same node leaves that captured
       reference pointing at whatever tool you have since switched to, so a
       slow or blocked network could paint a graph over the Limits sheet.
       Replacing the node sends every stale write to a detached element
       instead, which is the isolation the old full-stage rebuild gave us for
       free and the only part of it worth keeping. */
    const body = old.cloneNode(false);
    old.replaceWith(body);
    try { tool.render(body, !!picked); } catch (e) { body.innerHTML = `<div class="fsh-err">Tool error: ${esc(e.message)}</div>`; }
    return true;
  }
  function soonHTML(sid) { const s = subjById(sid); return `<div class="fsh-card fsh-soon fsh-panel"><div class="ic">${s.ico}</div><h3>${esc(s.name)} tools didn't load</h3><p>The ${esc(s.name)} module isn't available right now — try reloading. Meanwhile, here are the best interactive sites.</p></div>`; }
  // Reference-site strips removed per product decision — Study Tools keeps the
  // in-app tools only, no external website links.
  function refStrip() { return ''; }

  /* Geometry only — no scrolling — so this is safe to fire from a
     ResizeObserver while the user is part-way along the strip.

     Split out because the highlight was measured one frame after render
     (requestAnimationFrame), while flux-iconify swaps every emoji icon for an
     SVG on a setTimeout(…, 32) — a tick later. An <svg class="fxi"> is about
     4px narrower than the emoji it replaces, so each tab shrank *after* the
     highlight had recorded its width, and the error piled up left to right:
     measured across all 13 subjects, 71 of 84 sub-tabs were out, the worst by
     32px. The giveaway was which ones were fine — 〜Waves, ⊞Matrix, ∑Formulas
     and the rest whose icon is a plain text glyph iconify never touches. Those
     sat at exactly 0. */
  /* `animate` false means this is a *correction*, not a move you asked for.
     Corrections must not slide, or you see the highlight land in the wrong
     place and then visibly crawl to the right one a moment later — which is
     the lag-then-snap this whole mechanism is supposed to prevent. Suppressing
     the transition for the correction makes the icon swap invisible: the
     highlight is simply in the right place by the time you look at it. */
  function positionGlide(animate) {
    const tabs = $('fshChemTabs'), g = $('fshTabGlide'); if (!tabs || !g) return;
    const a = tabs.querySelector('.fsh-chem-tab.active'); if (!a) return;
    const left = a.offsetLeft + 'px', width = a.offsetWidth + 'px';
    if (g.style.left === left && g.style.width === width) return; // nothing moved
    if (animate) { g.style.left = left; g.style.width = width; return; }
    const prev = g.style.transition;
    g.style.transition = 'none';
    g.style.left = left; g.style.width = width;
    // Flush the un-transitioned values before restoring, or the browser
    // coalesces both writes into one animated change and the snap comes back.
    void g.offsetWidth;
    g.style.transition = prev;
  }
  function moveTabGlide() {
    const tabs = $('fshChemTabs'), g = $('fshTabGlide'); if (!tabs || !g) return;
    wireTabSlider();
    const a = tabs.querySelector('.fsh-chem-tab.active');
    if (a) {
      // A click is a move you asked for, so this one slides.
      positionGlide(true);
      try { a.scrollIntoView({ inline: 'nearest', block: 'nearest' }); } catch (e) {}
    }
    syncTabSlider();
  }

  // ── tab-strip slider ─────────────────────────────────────────────────────
  // Sizes the thumb to the visible fraction of the strip and hides the whole
  // control when everything already fits.
  function syncTabSlider() {
    const tabs = $('fshChemTabs'), sl = $('fshTabSlider'), th = $('fshTabThumb');
    if (!tabs || !sl || !th) return;
    const max = tabs.scrollWidth - tabs.clientWidth;
    if (max <= 1) { sl.hidden = true; return; }
    sl.hidden = false;
    const track = sl.clientWidth;
    const w = Math.max(30, Math.round(track * tabs.clientWidth / tabs.scrollWidth));
    th.style.width = w + 'px';
    th.style.left = Math.round((tabs.scrollLeft / max) * (track - w)) + 'px';
  }
  function wireTabSlider() {
    const tabs = $('fshChemTabs'), sl = $('fshTabSlider'), th = $('fshTabThumb');
    if (!tabs || !sl || !th || sl.__wired) return;
    sl.__wired = true;
    tabs.addEventListener('scroll', syncTabSlider, { passive: true });
    // The strip is measured before icon fonts settle, so the first sync can see
    // a non-overflowing strip and hide the slider. Re-measure on any resize.
    // The highlight needs the identical treatment and wasn't getting it: this
    // observer existed, knew the strip resizes late, and moved only the
    // scrollbar thumb. Repositioning the glide here too fixes it for every
    // cause of a late resize — icon swaps, web fonts, zoom, window width —
    // rather than special-casing the one we happened to find.
    const reflow = () => { syncTabSlider(); positionGlide(); };
    if (window.ResizeObserver) {
      try {
        const ro = new ResizeObserver(reflow);
        ro.observe(tabs);
        /* Every tab, not just the strip. The strip is width:100% so its own box
           never changes when a tab inside it shrinks — it only gains scroll —
           so observing the container alone caught the icon swap purely by
           luck, via the callback ResizeObserver fires on first observe. That
           race left chemistry's "Tools" tab 3px out. Observing the buttons
           makes it deterministic: any tab that resizes repositions the
           highlight. */
        tabs.querySelectorAll('.fsh-chem-tab').forEach((b) => ro.observe(b));
      } catch (e) {}
    }
    requestAnimationFrame(() => requestAnimationFrame(reflow));
    // Web fonts land after first paint and change every tab's width at once.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(reflow).catch(() => {});
    let grab = null;
    // scroll-behavior:smooth on the strip makes a dragged thumb lag behind the
    // pointer, so jumps are done with it temporarily disabled.
    const scrollTo = (clientX) => {
      const max = tabs.scrollWidth - tabs.clientWidth; if (max <= 0) return;
      const track = sl.clientWidth, w = th.offsetWidth;
      const left = Math.max(0, Math.min(track - w, clientX - sl.getBoundingClientRect().left - grab));
      const prev = tabs.style.scrollBehavior; tabs.style.scrollBehavior = 'auto';
      tabs.scrollLeft = (left / (track - w)) * max;
      tabs.style.scrollBehavior = prev;
      syncTabSlider();
    };
    th.addEventListener('pointerdown', (ev) => {
      grab = ev.clientX - th.getBoundingClientRect().left;
      th.classList.add('dragging');
      try { th.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault(); ev.stopPropagation();
    });
    th.addEventListener('pointermove', (ev) => { if (grab != null) scrollTo(ev.clientX); });
    const end = () => { grab = null; th.classList.remove('dragging'); };
    th.addEventListener('pointerup', end); th.addEventListener('pointercancel', end);
    // click anywhere on the track jumps there, centring the thumb
    sl.addEventListener('pointerdown', (ev) => {
      if (ev.target === th) return;
      grab = th.offsetWidth / 2; scrollTo(ev.clientX); grab = null;
    });
    window.addEventListener('resize', syncTabSlider);
  }

  // ── search ───────────────────────────────────────────────────────────────
  const CHEM_SEARCH = [
    ['chem:table', '⊞', 'Periodic Table', 'periodic table elements groups categories'],
    ['chem:atom', '◎', '3D Atom Model', '3d atom model bohr electron shells orbit nucleus'],
    ['chem:tools', '⚗', 'Chem Calculators', 'balance balancer equation molar mass ph gas law dilution calculator'],
    ['chem:ions', '±', 'Ions & Solubility', 'ions polyatomic solubility table constants'],
    ['chem:worksheet', '📝', 'Worksheet Maker', 'worksheet practice problems generator print quiz redox'],
  ];
  function renderSearch() {
    const q = searchQ.trim().toLowerCase();
    const toolHits = [];
    CHEM_SEARCH.forEach(([tid, ico, name, kw]) => { if ((name + ' ' + kw).toLowerCase().includes(q)) toolHits.push({ sid: 'chemistry', t: { id: tid, icon: ico, name } }); });
    legacyChipsFor('chemistry').forEach((c) => { if (((c.label || '') + ' ' + (c.desc || '')).toLowerCase().includes(q)) toolHits.push({ sid: 'chemistry', t: { id: 'chem:lg-' + c.id, icon: c.icon || '🧰', name: c.label || c.id } }); });
    Object.keys(registry).forEach((sid) => (registry[sid] || []).forEach((t) => { if (t.render && (t.name + ' ' + (t.desc || '')).toLowerCase().includes(q)) toolHits.push({ sid, t }); }));
    const subHits = SUBJECTS.filter((s) => s.name.toLowerCase().includes(q));
    const elHits = elements().filter((e) => e.name.toLowerCase().includes(q) || e.s.toLowerCase() === q).slice(0, 8);
    const none = !toolHits.length && !elHits.length && !subHits.length;
    $('fshStage').innerHTML = `<div class="fsh-panel"><div class="fsh-section-head"><span class="fsh-sh-ico">⌕</span><span><h2>Results for "${esc(searchQ)}"</h2><p>${toolHits.length} tools · ${subHits.length} subjects · ${elHits.length} elements</p></span></div>
      ${subHits.length ? `<div class="fsh-chips-row" style="margin-bottom:16px">${subHits.map((s) => `<button type="button" class="fsh-qchip" data-act="open-sub" data-sid="${s.id}"><span class="qi">${s.ico}</span>${esc(s.name)} →</button>`).join('')}</div>` : ''}
      ${elHits.length ? `<div class="fsh-grid" style="margin-bottom:18px">${elHits.map((e) => `<button type="button" class="fsh-res" data-act="open-el" data-n="${e.n}" style="text-align:left"><div class="fsh-res-head"><span class="fsh-res-logo fsh-el" data-cat="${e.cat}" style="background:var(--el-c)">${esc(e.s)}</span><span><span class="fsh-res-title">${esc(e.name)}</span><span class="fsh-res-host">Element ${e.n} · ${e.mass} u</span></span></div><span class="fsh-res-open">Open in periodic table →</span></button>`).join('')}</div>` : ''}
      ${toolHits.length ? `<div class="fsh-grid">${toolHits.map((h) => `<button type="button" class="fsh-res" data-act="open-tool" data-sid="${h.sid}" data-tid="${h.t.id}" style="text-align:left"><div class="fsh-res-head"><span class="fsh-res-logo">${h.t.icon || '•'}</span><span><span class="fsh-res-title">${esc(h.t.name)}</span><span class="fsh-res-host">${esc(subjById(h.sid).name)}</span></span></div><span class="fsh-res-open">Open tool →</span></button>`).join('')}</div>` : ''}
      ${none ? `<p style="color:var(--fsh-mut)">No matches — try a tool name ("balancer"), an element ("Fe"), or a subject ("physics").</p>` : ''}</div>`;
  }

  function openToolRef(sid, tid) {
    searchQ = ''; const si = $('fshSearch'); if (si) si.value = ''; const sc = $('fshSearchClear'); if (sc) sc.hidden = true;
    state.subject = sid;
    if (sid === 'chemistry' && tid && tid.indexOf('chem:') === 0) state.chemTab = tid.slice(5);
    else if (tid) state.tool[sid] = tid;
    save(); selectSubject(sid, !!tid);
  }

  // ── stage dispatch ───────────────────────────────────────────────────────
  function renderStage(picked) {
    if (searchQ.trim()) { renderSearch(); return; }
    const s = subjById(state.subject); applyAccent(s.accent);
    if (state.subject === 'chemistry') renderChem(); else renderRegistered(state.subject, picked);
  }
  function selectSubject(id, picked) {
    /* Anything still asking for 'astronomy' or 'civics' — a saved preference, a
       deep link, a search hit — resolves to the subject that absorbed it
       instead of falling through subjById's default and silently landing on
       Chemistry. */
    id = canonicalSubject(id);
    const groupChanged = state.group !== groupOf(id);
    state.subject = id; state.group = groupOf(id); searchQ = ''; save();
    const si = $('fshSearch'); if (si) si.value = ''; const c = $('fshSearchClear'); if (c) c.hidden = true;

    /* Only when the umbrella actually changed. renderRail() replaces the rail
       and group-row markup wholesale, throwing away and rebuilding every pill;
       doing that to move a highlight between two pills that are already on
       screen is work you can see. */
    if (groupChanged) renderRail();
    document.querySelectorAll('#fshRail .fsh-pill').forEach((p) => p.classList.toggle('active', p.dataset.sub === id));
    const a = document.querySelector('#fshRail .fsh-pill.active'); if (a && a.scrollIntoView) a.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });

    /* Paint the new selection before building the panel underneath it.
       Everything above is cheap class-toggling; renderStage is not — Chemistry
       alone lays out 118 elements — and running it in the same task meant the
       browser had nothing to show until it finished. The pill you clicked
       stayed unlit for the whole build, which reads as the click not landing.
       One frame later the highlight is already on screen and the panel fills
       in under it. */
    requestAnimationFrame(() => renderStage(picked));
  }

  // ── shell + events ───────────────────────────────────────────────────────
  function buildShell() {
    const host = $('stSections'); if (!host) return false;
    if ($('toolbox')) $('toolbox').classList.add('fsh-active');
    host.innerHTML = `<div id="fshRoot" class="fsh"><div class="fsh-hero"><div class="fsh-hero-text"><h1>Study Tools</h1><p>Native, interactive tools for all ${SUBJECTS.length} subjects — calculators, simulations, references and your Classic tools, no tab-hopping.</p></div><div class="fsh-search"><span class="fsh-search-ico">⌕</span><input id="fshSearch" type="search" placeholder="Search tools, subjects & elements…" autocomplete="off"><button type="button" class="fsh-search-clear" id="fshSearchClear" hidden aria-label="Clear">×</button><span class="fsh-search-key" aria-hidden="true">/</span></div></div>
      <div class="fsh-group-row" id="fshGroups" role="tablist" aria-label="Subject areas">${groupRowHtml()}</div>
      <div class="fsh-rail-wrap"><div class="fsh-rail" id="fshRail">${railHtml()}</div></div>
      <div class="fsh-stage" id="fshStage"></div></div>`;
    wire(); return true;
  }
  function wire() {
    const root = $('fshRoot'); if (!root || root.__wired) return; root.__wired = true;
    $('fshRail').addEventListener('click', (e) => {
      // Star first: it sits on top of the pill, and starring must not also
      // switch the subject out from under you.
      const f = e.target.closest('.fsh-fav-btn');
      if (f) { e.stopPropagation(); toggleFav(f.dataset.fav); return; }
      const p = e.target.closest('.fsh-pill'); if (p) selectSubject(p.dataset.sub);
    });
    const groups = $('fshGroups');
    if (groups) groups.addEventListener('click', (e) => {
      const g = e.target.closest('.fsh-group'); if (g) selectGroup(g.dataset.group);
    });
    const si = $('fshSearch'), sc = $('fshSearchClear');
    si.addEventListener('input', () => { searchQ = si.value; sc.hidden = !searchQ; renderStage(); });
    si.addEventListener('keydown', (e) => { if (e.key === 'Escape') { searchQ = ''; si.value = ''; sc.hidden = true; renderStage(); si.blur(); } });
    sc.addEventListener('click', () => { searchQ = ''; si.value = ''; sc.hidden = true; renderStage(); });

    $('fshRail').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const pills = [...document.querySelectorAll('#fshRail .fsh-pill')];
      const i = pills.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault();
      const next = pills[(i + (e.key === 'ArrowRight' ? 1 : -1) + pills.length) % pills.length];
      next.focus(); selectSubject(next.dataset.sub);
    });
    if (!window.__fshKeys) {
      window.__fshKeys = true;
      // capture phase + stopPropagation: on the Study tab "/" focuses tool search
      // instead of the app-wide "/" → AI panel shortcut in app.js
      document.addEventListener('keydown', (e) => {
        if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
        const t = e.target;
        if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
        // __fluxLastNavPanel updates synchronously in nav(); the panel's .active
        // class lingers ~500ms during the leave transition, so don't trust it alone
        const cur = window.__fluxLastNavPanel || (($('toolbox') || {}).classList && $('toolbox').classList.contains('active') ? 'toolbox' : '');
        if (cur !== 'toolbox' || !$('fshRoot')) return;
        const inp = $('fshSearch'); if (inp) { e.preventDefault(); e.stopPropagation(); inp.focus(); inp.select(); }
      }, true);
    }

    $('fshStage').addEventListener('click', (e) => {
      const t = e.target;
      const a0 = t.closest('[data-act]');
      if (a0 && a0.dataset.act === 'open-el') { selEl = +a0.dataset.n; openToolRef('chemistry', 'chem:table'); return; }
      if (a0 && a0.dataset.act === 'open-tool') { openToolRef(a0.dataset.sid, a0.dataset.tid); return; }
      if (a0 && a0.dataset.act === 'open-sub') { openToolRef(a0.dataset.sid, ''); return; }
      const chemTab = t.closest('.fsh-chem-tab[data-tab]');
      /* Highlight first, panel second. Both happen on the same click, but the
         order decides whether the slide is visible: drawing the panel first
         blocks the main thread long enough (≈70ms for a big table) that the
         transition cannot start until it finishes, so the highlight sat still
         and then hurried. Moving it before the body render costs one forced
         layout of a strip that has not changed, and the slide begins on the
         very next frame. */
      if (chemTab) {
        state.chemTab = chemTab.dataset.tab; save();
        document.querySelectorAll('.fsh-chem-tab').forEach((b) => b.classList.toggle('active', b === chemTab));
        moveTabGlide();
        requestAnimationFrame(renderChemBody);
        return;
      }
      const subTab = t.closest('.fsh-chem-tab[data-tool]');
      if (subTab) {
        /* Which subject this strip belongs to comes from the strip, not from
           state.subject. The two can disagree — a cloud pull used to move
           state.subject out from under a panel that stayed on screen — and
           when they did, the click was filed against a subject with no such
           tool, so nothing happened and every later click on that strip was
           dead as well. The markup cannot be wrong about what it is showing,
           so it is the authority, and the global is corrected to match. */
        const strip = subTab.closest('.fsh-chem-tabs');
        const sid = (strip && strip.dataset.sid) || state.subject;
        state.subject = sid;
        state.tool[sid] = subTab.dataset.tool; save();
        // Same shape as the chemistry branch above, and for the same reasons:
        // move the class, slide the highlight, then draw the panel a frame
        // later. Falls back to rebuilding the whole stage if there is no body
        // to draw into — which also rebuilds the strip, so no glide.
        document.querySelectorAll('#fshChemTabs .fsh-chem-tab').forEach((b) => b.classList.toggle('active', b === subTab));
        /* A false from renderToolBody means it found no body or no such tool.
           Rebuilding is the only honest response: leaving the tab lit above a
           panel still showing the previous tool is indistinguishable from a
           button that does nothing. */
        if ($('fshSubBody')) { moveTabGlide(); requestAnimationFrame(() => { if (!renderToolBody(sid, true)) renderRegistered(sid, true); }); }
        else renderRegistered(sid, true);
        return;
      }
      const cell = t.closest('.fsh-el');
      if (cell && cell.dataset.n && !a0) { selEl = +cell.dataset.n; const d = $('fshElDetail'); if (d) { d.innerHTML = elDetail(elByN(selEl)); d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } return; }
      const cat = t.closest('.fsh-cat-chip[data-cat]');
      if (cat) { ptCat = cat.dataset.cat; document.querySelectorAll('#fshPtCats .fsh-cat-chip').forEach((c) => c.classList.toggle('active', c === cat)); applyPtFilter(); return; }
      const bc = t.closest('[data-bal]');
      if (bc) { balInput = bc.dataset.bal; const i = $('fshBalIn'); if (i) i.value = balInput; $('fshBalOut').innerHTML = balOut(); return; }
      const ws = t.closest('[data-ws]');
      if (ws) { const g = ws.dataset.ws, v = ws.dataset.v; if (g === 'type') { wsCfg.types.has(v) ? wsCfg.types.delete(v) : wsCfg.types.add(v); } else if (g === 'diff') wsCfg.diff = v; else if (g === 'count') wsCfg.count = +v; else if (g === 'mode') wsCfg.mode = v; wsGenerate(); renderChemBody(); requestAnimationFrame(moveTabGlide); return; }
      const act = t.closest('[data-act]'); if (!act) return; const a = act.dataset.act;
      if (a === 'lg-open') { const md = act.dataset.mode; if (md === 'link' && act.dataset.nav && window.nav) window.nav(act.dataset.nav); else if (act.dataset.fn && typeof window[act.dataset.fn] === 'function') window[act.dataset.fn](); return; }
      if (a === 'balance') { const i = $('fshBalIn'); balInput = i ? i.value : balInput; $('fshBalOut').innerHTML = balOut(); }
      else if (a === 'ins-arrow') { const i = $('fshBalIn'); if (i) { i.value = i.value.replace(/\s*$/, '') + ' → '; i.focus(); balInput = i.value; $('fshBalOut').innerHTML = balOut(); } }
      else if (a === 'molar') { const i = $('fshMolIn'); molInput = i ? i.value : molInput; $('fshMolOut').innerHTML = molOut(); }
      else if (a === 'ph') { const v = parseFloat(($('fshPhIn') || {}).value); const o = $('fshPhOut'); if (o) o.innerHTML = v > 0 ? `<span class="big">pH ${(-Math.log10(v)).toFixed(2)}</span>` : `<span class="fsh-err">Need [H⁺] > 0</span>`; }
      else if (a === 'dil') { dilSolve(); }
      else if (a === 'gas') { const o = $('fshGasOut'); try { const r = gasSolve({ P: num('fshG_P'), V: num('fshG_V'), n: num('fshG_n'), T: num('fshG_T') }); o.innerHTML = `<span class="big">${esc([r.P, r.V, r.n, r.T].join(' · '))}</span>`; } catch (e) { o.innerHTML = `<span class="fsh-err">${esc(e.message)}</span>`; } }
      else if (a === 'view-atom') { atomN = +act.dataset.n; state.chemTab = 'atom'; save(); document.querySelectorAll('.fsh-chem-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'atom')); renderChemBody(); requestAnimationFrame(moveTabGlide); }
      else if (a === 'atom-prev' || a === 'atom-next') { atomN = Math.max(1, Math.min(elements().length, atomN + (a === 'atom-next' ? 1 : -1))); updateAtomInfo(); }
      else if (a === 'atom-reset') { atomRot = { yaw: 0, pitch: -1.15 }; atomZoom = 1; }
      else if (a === 'ws-gen') { wsGenerate(); $('fshWsPreview').innerHTML = wsPreview(); }
      else if (a === 'ws-print') { wsPrint(); }
    });
    $('fshStage').addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'fshBalIn') { balInput = t.value; $('fshBalOut').innerHTML = balOut(); }
      else if (t.id === 'fshMolIn') { molInput = t.value; $('fshMolOut').innerHTML = molOut(); }
      else if (t.id === 'fshPtSearch') { ptQuery = t.value; applyPtFilter(); }
      else if (t.id === 'fshAtomSpeed') { atomSpeed = +t.value; }
      else if (t.id === 'fshAtomInput') { const v = t.value.trim(); let e2 = /^\d+$/.test(v) ? elByN(+v) : elements().find((x) => x.s.toLowerCase() === v.toLowerCase()); if (e2) atomN = e2.n; }
    });
  }
  const num = (id) => { const v = ($(id) || {}).value; return v === '' || v == null ? null : parseFloat(v); };
  function dilSolve() {
    const o = $('fshDilOut'); const c1 = num('fshD_c1'), v1 = num('fshD_v1'), c2 = num('fshD_c2'), v2 = num('fshD_v2');
    const vals = { c1, v1, c2, v2 }; const blanks = Object.keys(vals).filter((k) => vals[k] == null);
    if (blanks.length !== 1) { o.innerHTML = `<span class="fsh-err">Leave exactly one blank.</span>`; return; }
    let r; const b = blanks[0]; if (b === 'c1') r = c2 * v2 / v1; else if (b === 'v1') r = c2 * v2 / c1; else if (b === 'c2') r = c1 * v1 / v2; else r = c1 * v1 / c2;
    o.innerHTML = `<span class="big">${b.toUpperCase()} = ${(+r).toPrecision(4)}</span>`;
  }

  // ── public entry ─────────────────────────────────────────────────────────
  // ── merge legacy (original) tools as a "Classic" tab per subject ──────────
  let _legacyIdx = null, _merged = false;
  function buildLegacyIndex() {
    if (_legacyIdx) return _legacyIdx;
    const UL = window.fluxToolbox && window.fluxToolbox.UNIFIED_LAYOUT; if (!UL) return null;
    const SECTION = { math: 'math', cs: 'cs' };
    const OVERRIDE = { 'physics-sandbox': 'physics', 'chem-ref': 'chemistry', 'unit-conv': 'chemistry', 'codon': 'biology', 'psych-ref': 'psychology', 'math-analysis': 'math', 'math-formulas': 'math', 'geo-ref': 'math', 'gopo-ref': 'glopo', 'hist-skills': 'history', 'lit-ref': 'english', 'arts-ref': 'english', 'music-theory': 'music', 'cs-ref': 'cs' };
    /* spanish-conj, french-conj and translate-ai were dropped rather than
       rehomed. The two conjugators were a second implementation with their own
       hand-written verb tables sitting one tab away from the engine-backed
       one — the precise arrangement that let "yo podo" survive while a correct
       table existed elsewhere in the app. Translation was a link that left
       Study Tools for the AI tab, so as a language tool it was a tab that took
       you somewhere else. */
    const SKIP = { 'periodic-tbl': 1, 'molar-mass': 1, 'graphing': 1, 'matrix': 1, 'stats': 1, 'timeline': 1, 'map-quiz': 1, 'grammar': 1, 'essay': 1, 'literary': 1, 'cite-notes': 1, 'ipa': 1, 'econ-formulas': 1, 'fin-calc': 1, 'dp-dimensions': 1, 'dp-chart': 1, 'lit-devices': 1, 'hist-map': 1, 'spanish-conj': 1, 'french-conj': 1, 'translate-ai': 1 };
    const idx = {};
    UL.forEach((sec) => (sec.tools || []).forEach((c) => {
      if (SKIP[c.id]) return;
      const sub = OVERRIDE[c.id] || SECTION[sec.id]; if (!sub) return;
      (idx[sub] = idx[sub] || []).push({ id: c.id, label: c.label, icon: c.icon, mode: c.mode, sub: c.sub, tid: c.tid, fn: c.fn, nav: c.nav, desc: c.desc, btn: c.btn });
    }));
    _legacyIdx = idx; return idx;
  }
  const legacyChipsFor = (sub) => { const idx = buildLegacyIndex(); return (idx && idx[sub]) || []; };
  function renderLegacyTool(body, chip, picked) {
    if (chip.mode === 'inline' && window.fluxToolbox && window.fluxToolbox.renderToolIntoBody) {
      body.innerHTML = '<div class="fsh-panel" id="fshLgMount"></div>';
      try { window.fluxToolbox.renderToolIntoBody($('fshLgMount'), chip.sub, chip.tid); } catch (e3) { body.innerHTML = `<div class="fsh-panel"><div class="fsh-err">${esc(e3.message)}</div></div>`; }
      return;
    }
    // Reference tools (chip.fn → openToolModal) render INLINE into the panel
    // body instead of popping a modal: ask flux-reference-tools to mount the
    // next tool into our body, then invoke the tool's open function.
    if (chip.fn && typeof window[chip.fn] === 'function' && window.FluxRefTools && typeof window.FluxRefTools.setInlineHost === 'function') {
      body.innerHTML = '<div class="fsh-panel" id="fshLgMount"></div>';
      try {
        window.FluxRefTools.setInlineHost($('fshLgMount'));
        window[chip.fn]();
        // If the tool ignored the inline host (didn't route through
        // openToolModal), fall back to a clear "opened" note.
        if (!$('fshLgMount').querySelector('.ref-tool-inline')) {
          window.FluxRefTools.setInlineHost(null);
          body.innerHTML = `<div class="fsh-panel"><div class="fsh-card fsh-soon"><div class="ic">${chip.icon || '▣'}</div><h3>${esc(chip.label || chip.id)}</h3><p>Opened — it’s on screen now.</p></div></div>`;
        }
        return;
      } catch (e5) {
        try { window.FluxRefTools.setInlineHost(null); } catch (e6) {}
        body.innerHTML = `<div class="fsh-panel"><div class="fsh-err">${esc(e5.message)}</div></div>`;
        return;
      }
    }
    // Clicking the chip opens the tool directly — no intermediate button. Only
    // on a real pick, though: these tools leave the panel (link mode navigates
    // to another tab, fn mode pops a modal) and the selection is persisted, so
    // firing on every render would bounce the user out of Study tools each
    // time they opened it.
    let opened = false;
    if (picked) {
      try {
        if (chip.mode === 'link' && chip.nav && window.nav) { window.nav(chip.nav); opened = true; }
        else if (chip.fn && typeof window[chip.fn] === 'function') { window[chip.fn](); opened = true; }
      } catch (e4) { opened = false; }
    }
    body.innerHTML = `<div class="fsh-panel"><div class="fsh-card fsh-soon"><div class="ic">${chip.icon || '▣'}</div><h3>${esc(chip.label || chip.id)}</h3><p>${opened ? 'Opened — it’s on screen now.' : esc(chip.desc || 'Could not open this tool automatically.')} <button type="button" class="fsh-btn fsh-btn--ghost" data-act="lg-open" data-fn="${esc(chip.fn || '')}" data-nav="${esc(chip.nav || '')}" data-mode="${esc(chip.mode || '')}">${opened ? 'Reopen' : esc(chip.btn || 'Open ' + (chip.label || 'tool'))}</button></p></div></div>`;
  }
  function mergeLegacyOnce() {
    if (_merged) return; const idx = buildLegacyIndex(); if (!idx) return; _merged = true;
    Object.keys(idx).forEach((sub) => { if (sub === 'chemistry') return; register(sub, idx[sub].map((chip) => ({ id: 'lg-' + chip.id, name: chip.label || chip.id, icon: chip.icon || '🧰', desc: 'classic ' + (chip.desc || chip.label || ''), render: (b, picked) => renderLegacyTool(b, chip, picked) }))); });
  }
  function renderHub() { if (!$('fshRoot')) { if (!buildShell()) return; } mergeLegacyOnce(); renderStage(); }
  window.renderToolbox = renderHub;
  window.renderStudyTools = renderHub;
  /* ── cloud sync ──────────────────────────────────────────────────────────
     Same two-function contract every other synced module uses (see
     FluxUnitConverterFavorites): getCloudSlice is read by getCloudPayload on
     the way up, applyFromCloud is handed the stored slice on the way down.
     Hung off the existing fluxStudyHub object rather than a new FluxStudyHub
     global — two names differing only in one capital letter is a trap. */
  function getCloudSlice() {
    return { subject: state.subject, chemTab: state.chemTab, tool: state.tool, favs: state.favs };
  }
  /* Is the student looking at Study Tools right now?
     Two sources because neither is enough alone: the panel's .active class
     lingers ~500ms into the leave transition (so it over-reports on the way
     out), while __fluxLastNavPanel is set synchronously in nav() but is empty
     before the first navigation. OR-ing them errs towards "yes, in use", which
     is the safe direction — the cost of a false yes is one stale cursor, the
     cost of a false no is the bug below. */
  function hubInUse() {
    if (!$('fshRoot')) return false;
    const tb = $('toolbox');
    return (!!tb && tb.classList.contains('active')) || window.__fluxLastNavPanel === 'toolbox';
  }
  function applyFromCloud(data) {
    if (!data || typeof data !== 'object') return;
    /* Favourites are the point of syncing this, and they are the one field a
       half-written record can destroy: assigning a missing or corrupted favs
       would silently unstar everything on this device. Only take what is
       actually an array, and keep what is here otherwise. */
    if (Array.isArray(data.favs)) state.favs = data.favs.filter((id) => typeof id === 'string');
    /* subject/chemTab/tool are a cursor — where you are looking this second —
       not data, and the cloud pull runs every 8 seconds. Taking them while the
       student is standing in the panel is what "I click Matrix and it just
       doesn't work" actually was, in two flavours:

         · The pull lands in the one-frame gap the click handler leaves between
           setting state.tool and rendering (requestAnimationFrame). The tab
           you clicked lights up, state.tool is reverted underneath it, and the
           frame then draws whatever the cloud said. Measured: active tab
           "Matrix", panel "Graphing calculator", state.tool.math "graph".
         · Worse and longer-lived, the pull moves state.subject to whatever the
           record holds. The Math strip is still on screen but every click on
           it is now filed under Chemistry — state.tool.chemistry = 'matrix' —
           and renderToolBody finds no such tool, so it returns false and the
           panel never changes again. Every tab on that strip is dead until you
           leave the subject.

       So the cursor is only adopted while the hub is off screen, which is
       still every path that needs it: signing in from the dashboard, a fresh
       load, or another device's choice arriving before you open Study Tools.
       Once you are in there it is yours. */
    if (!hubInUse()) {
      if (typeof data.subject === 'string') state.subject = data.subject;
      if (typeof data.chemTab === 'string') state.chemTab = data.chemTab;
      if (data.tool && typeof data.tool === 'object') state.tool = data.tool;
    }
    /* Persist through window.save directly, NOT through save(): save() calls
       syncKey, which would queue a push of what we just pulled down and bounce
       the same record back to the server on every sign-in. */
    try {
      if (typeof window.save === 'function') window.save(LS_KEY, state);
      else localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {}
    // Only repaint if the rail is actually on screen; renderRail no-ops otherwise.
    try { renderRail(); } catch (e) {}
  }

  window.fluxStudyHub = { render: renderHub, register, addAITool, tools: aiTools, aiManifest, slash, balance, parseFormula, selectSubject,
    getCloudSlice, applyFromCloud,
    /* Lets a shared tool tell which subject opened it — the formula sheet uses
       this to show only the relevant science instead of all three. */
    currentSubject: () => state.subject,
    helpers: { elements, elByN, massOf, shellFill, esc, subFmt } };

  document.addEventListener('DOMContentLoaded', () => { const tb = $('toolbox'); if (tb && tb.classList.contains('active')) renderHub(); });
})();
