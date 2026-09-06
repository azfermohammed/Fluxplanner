/**
 * Flux · GPA and standardised test scores.
 *
 * Lives on the Profile tab, under Academic Stats. Three things a student
 * actually needs in one place:
 *
 *   · GPA — unweighted and weighted, on whatever scale their school uses.
 *   · SAT and ACT — every sitting, kept as *section* scores rather than a
 *     single total, because that is the only way a superscore can be computed.
 *     Colleges that superscore take your best section from any date, so a
 *     record that stores only "1420, March" throws away the information that
 *     matters most.
 *   · Where those numbers sit against a target, and against each other.
 *
 * Nothing here is a prediction. The concordance is the official 2018
 * SAT/ACT table published jointly by College Board and ACT; it is labelled
 * "about" everywhere it appears because that is what a concordance is.
 *
 * Self-contained IIFE. Exposes window.FluxAcademicScores.
 */
(function () {
  'use strict';

  var KEY = 'flux_academic_scores_v1';

  /* ── storage ─────────────────────────────────────────────────────────────
     Through window.load/window.save when they exist, so this rides the app's
     per-account namespacing instead of writing to a global key that would
     leak one student's scores into the next sign-in on a shared laptop. */
  function readRaw() {
    try {
      if (typeof window.load === 'function') return window.load(KEY, null);
      return JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch (e) { return null; }
  }
  function writeRaw(v) {
    try {
      if (typeof window.save === 'function') window.save(KEY, v);
      else localStorage.setItem(KEY, JSON.stringify(v));
    } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── validation ──────────────────────────────────────────────────────────
     Every number that comes back out of storage is re-checked, not just the
     ones typed today: a half-written cloud record or a hand-edited export
     would otherwise put NaN into an average and quietly show a superscore of
     "NaN" next to a real one. */
  function clampInt(v, lo, hi) {
    var n = parseInt(v, 10);
    if (!isFinite(n)) return null;
    return Math.max(lo, Math.min(hi, n));
  }
  /** SAT sections run 200–800 and only ever land on a multiple of 10. */
  function satSection(v) {
    var n = clampInt(v, 200, 800);
    return n == null ? null : Math.round(n / 10) * 10;
  }
  function actSection(v) { return clampInt(v, 1, 36); }

  function cleanGpa(v, scale) {
    var n = parseFloat(v);
    if (!isFinite(n) || n < 0) return '';
    // Weighted scales go above the unweighted maximum, so the ceiling is the
    // student's own scale plus the usual headroom, not a flat 4.0.
    var max = (parseFloat(scale) || 4) + 1.5;
    return String(Math.min(n, max).toFixed(2)).replace(/\.?0+$/, '') || '0';
  }

  /* AP runs 1–5, IB subjects run 1–7. Two different ceilings, so the board has
     to be known before the score can be judged — storing a bare "6" and
     guessing later would silently turn an IB 6 into an invalid AP score. */
  var BOARDS = { ap: { label: 'AP', max: 5, good: 3 }, ib: { label: 'IB', max: 7, good: 4 } };
  function boardOf(v) { return BOARDS[String(v)] ? String(v) : 'ap'; }
  function examScore(v, board) { return clampInt(v, 1, BOARDS[boardOf(board)].max); }
  function yearOrBlank(v) { var n = clampInt(v, 1990, 2100); return n == null ? '' : String(n); }

  function satTotalOrBlank(v) { var n = clampInt(v, 400, 1600); return n == null ? '' : Math.round(n / 10) * 10; }
  function isoOrBlank(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : ''; }
  function rid() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function actParts(s) {
    return ['english', 'math', 'reading', 'science']
      .map(function (k) { return s[k]; }).filter(function (n) { return n != null; });
  }

  function sanitise(raw) {
    var d = raw && typeof raw === 'object' ? raw : {};
    var g = d.gpa && typeof d.gpa === 'object' ? d.gpa : {};
    var scale = ['4.0', '5.0', '100', '7'].indexOf(String(g.scale)) >= 0 ? String(g.scale) : '4.0';
    var t = d.targets && typeof d.targets === 'object' ? d.targets : {};
    return {
      gpa: { unweighted: cleanGpa(g.unweighted, scale), weighted: cleanGpa(g.weighted, scale), scale: scale },
      targets: { sat: satTotalOrBlank(t.sat), act: actSection(t.act) || '' },
      sat: (Array.isArray(d.sat) ? d.sat : []).map(function (s) {
        return { id: String((s && s.id) || rid()), date: isoOrBlank(s && s.date),
          ebrw: satSection(s && s.ebrw), math: satSection(s && s.math) };
      }).filter(function (s) { return s.ebrw != null || s.math != null; }).slice(0, 30),
      act: (Array.isArray(d.act) ? d.act : []).map(function (s) {
        return { id: String((s && s.id) || rid()), date: isoOrBlank(s && s.date),
          english: actSection(s && s.english), math: actSection(s && s.math),
          reading: actSection(s && s.reading), science: actSection(s && s.science) };
      }).filter(function (s) { return actParts(s).length > 0; }).slice(0, 30),
      exams: (Array.isArray(d.exams) ? d.exams : []).map(function (e) {
        var board = boardOf(e && e.board);
        return { id: String((e && e.id) || rid()), board: board,
          name: String((e && e.name) || '').slice(0, 60),
          score: examScore(e && e.score, board), year: yearOrBlank(e && e.year) };
      }).filter(function (e) { return e.name && e.score != null; }).slice(0, 60),
    };
  }

  var state = sanitise(readRaw());

  function persist() {
    writeRaw(state);
    // Same contract every other synced module uses.
    try { if (typeof window.syncKey === 'function') window.syncKey(KEY, state); } catch (e) {}
    /* The opportunity matcher (flux-opportunities.js) reads profile.gpa to
       decide which scholarships a student qualifies for, and nothing has ever
       written it — so every "needs GPA 3.5+" was being scored against a blank.
       Mirror it here. Unweighted, because that is what those thresholds mean. */
    try {
      if (typeof window.load === 'function' && typeof window.save === 'function') {
        var p = window.load('profile', {}) || {};
        var g = state.gpa.unweighted;
        if (String(p.gpa || '') !== String(g)) { p.gpa = g; window.save('profile', p); }
      }
    } catch (e) {}
  }

  /* ── scoring ─────────────────────────────────────────────────────────────
     A sitting with a missing section is not scored rather than scored as
     zero — a student who only has their Math back should not be told their
     total is 760. */
  function satTotal(s) { return s.ebrw != null && s.math != null ? s.ebrw + s.math : null; }
  /** ACT composite is the mean of the four subject scores, rounded to whole. */
  function actComposite(s) {
    var p = actParts(s);
    if (p.length < 4) return null;
    return Math.round(p.reduce(function (a, b) { return a + b; }, 0) / 4);
  }

  function bestOf(list, key) {
    var vals = list.map(function (s) { return s[key]; }).filter(function (n) { return n != null; });
    return vals.length ? Math.max.apply(null, vals) : null;
  }
  /** Best section from any date — what a college that superscores actually sees. */
  function satSuper() {
    var e = bestOf(state.sat, 'ebrw'), m = bestOf(state.sat, 'math');
    return e != null && m != null ? e + m : null;
  }
  function actSuper() {
    var p = ['english', 'math', 'reading', 'science'].map(function (k) { return bestOf(state.act, k); });
    if (p.some(function (n) { return n == null; })) return null;
    return Math.round(p.reduce(function (a, b) { return a + b; }, 0) / 4);
  }
  function bestSatSitting() {
    return state.sat.reduce(function (best, s) {
      var t = satTotal(s); if (t == null) return best;
      return best == null || t > best ? t : best;
    }, null);
  }
  function bestActSitting() {
    return state.act.reduce(function (best, s) {
      var c = actComposite(s); if (c == null) return best;
      return best == null || c > best ? c : best;
    }, null);
  }

  /* Official 2018 SAT/ACT concordance, as [ACT composite, lowest SAT total in
     that band, published single-score SAT equivalent]. Read downwards for
     SAT→ACT; the third column is the ACT→SAT direction. */
  var CONCORD = [[36, 1570, 1590], [35, 1530, 1540], [34, 1490, 1500], [33, 1450, 1460],
    [32, 1420, 1430], [31, 1390, 1400], [30, 1360, 1370], [29, 1330, 1340], [28, 1300, 1310],
    [27, 1260, 1280], [26, 1230, 1240], [25, 1200, 1210], [24, 1160, 1180], [23, 1130, 1140],
    [22, 1100, 1110], [21, 1060, 1080], [20, 1030, 1040], [19, 990, 1010], [18, 960, 970],
    [17, 920, 930], [16, 880, 890], [15, 830, 850], [14, 780, 800], [13, 730, 760],
    [12, 690, 710], [11, 650, 670], [10, 620, 630], [9, 590, 590]];
  function satToAct(total) {
    if (total == null) return null;
    for (var i = 0; i < CONCORD.length; i++) if (total >= CONCORD[i][1]) return CONCORD[i][0];
    return null;
  }
  function actToSat(comp) {
    if (comp == null) return null;
    for (var i = 0; i < CONCORD.length; i++) if (CONCORD[i][0] === comp) return CONCORD[i][2];
    return null;
  }

  /* ── view ────────────────────────────────────────────────────────────────*/
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? MON[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1] : 'No date';
  }

  function statBox(value, label, hint) {
    return '<div class="fas-stat">'
      + '<div class="fas-stat-v">' + esc(value == null || value === '' ? '—' : value) + '</div>'
      + '<div class="fas-stat-l">' + esc(label) + '</div>'
      + (hint ? '<div class="fas-stat-h">' + esc(hint) + '</div>' : '')
      + '</div>';
  }

  /** Progress towards a target, or nothing at all when none has been set. */
  function targetBar(best, target, floor, ceiling) {
    if (!target || best == null) return '';
    var span = ceiling - floor;
    var pct = Math.max(0, Math.min(100, Math.round((best - floor) / span * 100)));
    var goal = Math.max(0, Math.min(100, Math.round((target - floor) / span * 100)));
    var hit = best >= target;
    return '<div class="fas-bar" role="img" aria-label="' + esc(best + ' of a ' + target + ' target') + '">'
      + '<div class="fas-bar-fill' + (hit ? ' is-hit' : '') + '" style="width:' + pct + '%"></div>'
      + '<div class="fas-bar-goal" style="left:' + goal + '%"></div>'
      + '</div>'
      + '<div class="fas-bar-cap">' + (hit
        ? 'You have passed your ' + esc(target) + ' target.'
        : esc(target - best) + ' to go to reach ' + esc(target) + '.') + '</div>';
  }

  function satRow(s) {
    var t = satTotal(s);
    return '<li class="fas-row">'
      + '<div class="fas-row-main"><span class="fas-row-score">' + esc(t == null ? '—' : t) + '</span>'
      + '<span class="fas-row-date">' + esc(fmtDate(s.date)) + '</span></div>'
      + '<div class="fas-row-sub">Reading &amp; Writing ' + esc(s.ebrw == null ? '—' : s.ebrw)
      + ' · Math ' + esc(s.math == null ? '—' : s.math) + '</div>'
      + '<button type="button" class="fas-del" data-fas-del="sat" data-fas-id="' + esc(s.id) + '"'
      + ' aria-label="Remove the SAT from ' + esc(fmtDate(s.date)) + '">✕</button></li>';
  }
  function actRow(s) {
    var c = actComposite(s);
    return '<li class="fas-row">'
      + '<div class="fas-row-main"><span class="fas-row-score">' + esc(c == null ? '—' : c) + '</span>'
      + '<span class="fas-row-date">' + esc(fmtDate(s.date)) + '</span></div>'
      + '<div class="fas-row-sub">E ' + esc(s.english == null ? '—' : s.english)
      + ' · M ' + esc(s.math == null ? '—' : s.math)
      + ' · R ' + esc(s.reading == null ? '—' : s.reading)
      + ' · S ' + esc(s.science == null ? '—' : s.science) + '</div>'
      + '<button type="button" class="fas-del" data-fas-del="act" data-fas-id="' + esc(s.id) + '"'
      + ' aria-label="Remove the ACT from ' + esc(fmtDate(s.date)) + '">✕</button></li>';
  }

  function examRow(e) {
    var b = BOARDS[e.board];
    // Green from the score a college will actually give credit for: 3 on an
    // AP, 4 on an IB subject. Below that it is still worth recording.
    var good = e.score >= b.good;
    return '<li class="fas-row">'
      + '<div class="fas-row-main"><span class="fas-row-score' + (good ? ' is-good' : '') + '">' + esc(e.score) + '</span>'
      + '<span class="fas-row-date">' + esc(e.name) + '</span></div>'
      + '<div class="fas-row-sub">' + esc(b.label) + ' · out of ' + b.max
      + (e.year ? ' · ' + esc(e.year) : '') + '</div>'
      + '<button type="button" class="fas-del" data-fas-del="exams" data-fas-id="' + esc(e.id) + '"'
      + ' aria-label="Remove ' + esc(e.name) + '">✕</button></li>';
  }

  function num(id, label, min, max, step, value, ph) {
    return '<label class="fas-field"><span>' + esc(label) + '</span>'
      + '<input type="number" id="' + esc(id) + '" min="' + min + '" max="' + max + '" step="' + step + '"'
      + ' inputmode="numeric" value="' + esc(value == null ? '' : value) + '"'
      + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '></label>';
  }

  function crossLine(sat, act) {
    if (sat != null && act == null) {
      var a = satToAct(sat);
      return a == null ? '' : 'An SAT of ' + sat + ' is about a ' + a + ' on the ACT.';
    }
    if (act != null && sat == null) {
      var s = actToSat(act);
      return s == null ? '' : 'An ACT of ' + act + ' is about a ' + s + ' on the SAT.';
    }
    if (sat == null || act == null) return '';
    var conv = satToAct(sat);
    if (conv == null) return '';
    if (conv > act) return 'Your SAT is the stronger of the two — it lines up with about a ' + conv + ' ACT.';
    if (conv < act) return 'Your ACT is the stronger of the two — your SAT lines up with about a ' + conv + '.';
    return 'The two are level: your SAT lines up with about a ' + conv + ' ACT.';
  }

  function html() {
    var sSuper = satSuper(), aSuper = actSuper();
    var sBest = bestSatSitting(), aBest = bestActSitting();
    // Compare on the superscore when there is one — that is the number the
    // application actually carries.
    var cross = crossLine(sSuper != null ? sSuper : sBest, aSuper != null ? aSuper : aBest);

    return '<div class="card fas-card">'
      + '<h3>GPA &amp; test scores</h3>'

      /* GPA */
      + '<div class="fas-sec">'
      + '<div class="fas-sec-head"><span class="fas-sec-t">GPA</span></div>'
      + '<div class="fas-grid fas-grid--3">'
      + '<label class="fas-field"><span>Unweighted</span><input type="number" id="fasGpaU" min="0" max="100" step="0.01" inputmode="decimal" placeholder="3.85" value="' + esc(state.gpa.unweighted) + '"></label>'
      + '<label class="fas-field"><span>Weighted</span><input type="number" id="fasGpaW" min="0" max="100" step="0.01" inputmode="decimal" placeholder="4.42" value="' + esc(state.gpa.weighted) + '"></label>'
      + '<label class="fas-field"><span>Scale</span><select id="fasGpaScale">'
      + ['4.0', '5.0', '7', '100'].map(function (v) {
        return '<option value="' + v + '"' + (state.gpa.scale === v ? ' selected' : '') + '>'
          + (v === '7' ? '7 (IB)' : v === '100' ? '100 (percent)' : v) + '</option>';
      }).join('')
      + '</select></label>'
      + '</div>'
      + '<button type="button" class="fas-btn fas-btn--primary" data-fas-act="save-gpa">Save GPA</button>'
      + '</div>'

      /* SAT */
      + '<div class="fas-sec">'
      + '<div class="fas-sec-head"><span class="fas-sec-t">SAT</span>'
      + '<span class="fas-sec-n">' + state.sat.length + (state.sat.length === 1 ? ' sitting' : ' sittings') + '</span></div>'
      + '<div class="fas-stats">'
      + statBox(sSuper, 'Superscore', sSuper == null ? 'Needs both sections' : 'Best of each section')
      + statBox(sBest, 'Best sitting', 'Single date')
      + statBox(state.targets.sat, 'Target', 'Where you are aiming')
      + '</div>'
      + targetBar(sSuper != null ? sSuper : sBest, state.targets.sat, 400, 1600)
      + (state.sat.length ? '<ul class="fas-list">' + state.sat.map(satRow).join('') + '</ul>'
        : '<p class="fas-empty">No SAT scores yet. Add a sitting below and the superscore works itself out.</p>')
      + '<div class="fas-grid fas-grid--4">'
      + '<label class="fas-field"><span>Date</span><input type="date" id="fasSatDate"></label>'
      + num('fasSatEbrw', 'Reading & Writing', 200, 800, 10, '', '700')
      + num('fasSatMath', 'Math', 200, 800, 10, '', '760')
      + num('fasSatTarget', 'Target', 400, 1600, 10, state.targets.sat, '1500')
      + '</div>'
      + '<button type="button" class="fas-btn" data-fas-act="add-sat">Add SAT sitting</button>'
      + '</div>'

      /* ACT */
      + '<div class="fas-sec">'
      + '<div class="fas-sec-head"><span class="fas-sec-t">ACT</span>'
      + '<span class="fas-sec-n">' + state.act.length + (state.act.length === 1 ? ' sitting' : ' sittings') + '</span></div>'
      + '<div class="fas-stats">'
      + statBox(aSuper, 'Superscore', aSuper == null ? 'Needs all four sections' : 'Best of each section')
      + statBox(aBest, 'Best sitting', 'Single date')
      + statBox(state.targets.act, 'Target', 'Where you are aiming')
      + '</div>'
      + targetBar(aSuper != null ? aSuper : aBest, state.targets.act, 1, 36)
      + (state.act.length ? '<ul class="fas-list">' + state.act.map(actRow).join('') + '</ul>'
        : '<p class="fas-empty">No ACT scores yet. Add a sitting below — the composite is worked out for you.</p>')
      + '<div class="fas-grid fas-grid--3">'
      + '<label class="fas-field"><span>Date</span><input type="date" id="fasActDate"></label>'
      + num('fasActEng', 'English', 1, 36, 1, '', '34')
      + num('fasActMath', 'Math', 1, 36, 1, '', '33')
      + num('fasActRead', 'Reading', 1, 36, 1, '', '35')
      + num('fasActSci', 'Science', 1, 36, 1, '', '32')
      + num('fasActTarget', 'Target', 1, 36, 1, state.targets.act, '34')
      + '</div>'
      + '<button type="button" class="fas-btn" data-fas-act="add-act">Add ACT sitting</button>'
      + '</div>'

      /* AP / IB exam results */
      + '<div class="fas-sec">'
      + '<div class="fas-sec-head"><span class="fas-sec-t">AP &amp; IB exams</span>'
      + '<span class="fas-sec-n">' + state.exams.length + (state.exams.length === 1 ? ' result' : ' results') + '</span></div>'
      + (state.exams.length ? '<ul class="fas-list">' + state.exams.map(examRow).join('') + '</ul>'
        : '<p class="fas-empty">No exam results yet. Applications ask for these separately from the SAT and ACT, so they are worth keeping here as they come in.</p>')
      + '<div class="fas-grid fas-grid--4">'
      + '<label class="fas-field"><span>Board</span><select id="fasExamBoard">'
      + '<option value="ap">AP (out of 5)</option><option value="ib">IB (out of 7)</option>'
      + '</select></label>'
      // One column, not two: spanning the subject field pushed Year onto a row
      // of its own with three empty cells beside it. At the card's real width
      // a quarter is ~220px, which holds "Environmental Science" comfortably.
      + '<label class="fas-field"><span>Subject</span><input type="text" id="fasExamName" maxlength="60" placeholder="Calculus BC"></label>'
      + num('fasExamScore', 'Score', 1, 7, 1, '', '5')
      + num('fasExamYear', 'Year', 1990, 2100, 1, '', String(new Date().getFullYear()))
      + '</div>'
      + '<button type="button" class="fas-btn" data-fas-act="add-exam">Add exam result</button>'
      + '</div>'

      + (cross ? '<p class="fas-cross">' + esc(cross)
        + ' <span class="fas-cross-src">Official 2018 SAT/ACT concordance — a guide, not a conversion.</span></p>' : '')
      + '</div>';
  }

  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function toast(msg, kind) {
    try { if (typeof window.showToast === 'function') window.showToast(msg, kind || 'success'); } catch (e) {}
  }

  /* Newest first, but a sitting with no date sinks rather than jumping to the
     top — an empty string sorts above every real date otherwise. */
  function sortByDate(list) {
    list.sort(function (a, b) {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });
  }

  function onClick(e) {
    var btn = e.target.closest && e.target.closest('[data-fas-act], [data-fas-del]');
    if (!btn) return;

    var del = btn.getAttribute('data-fas-del');
    if (del) {
      var id = btn.getAttribute('data-fas-id');
      state[del] = state[del].filter(function (s) { return s.id !== id; });
      persist(); render(); toast('Score removed');
      return;
    }

    var act = btn.getAttribute('data-fas-act');
    if (act === 'save-gpa') {
      var scale = val('fasGpaScale');
      state.gpa = { scale: ['4.0', '5.0', '7', '100'].indexOf(scale) >= 0 ? scale : '4.0',
        unweighted: cleanGpa(val('fasGpaU'), scale), weighted: cleanGpa(val('fasGpaW'), scale) };
      persist(); render(); toast('GPA saved');
      return;
    }

    if (act === 'add-sat') {
      var ebrw = satSection(val('fasSatEbrw')), math = satSection(val('fasSatMath'));
      state.targets.sat = satTotalOrBlank(val('fasSatTarget'));
      if (ebrw == null && math == null) {
        persist(); render(); toast('Enter at least one SAT section score', 'error'); return;
      }
      state.sat.unshift({ id: rid(), date: isoOrBlank(val('fasSatDate')), ebrw: ebrw, math: math });
      sortByDate(state.sat);
      persist(); render(); toast('SAT sitting added');
      return;
    }

    if (act === 'add-act') {
      var s = { id: rid(), date: isoOrBlank(val('fasActDate')),
        english: actSection(val('fasActEng')), math: actSection(val('fasActMath')),
        reading: actSection(val('fasActRead')), science: actSection(val('fasActSci')) };
      state.targets.act = actSection(val('fasActTarget')) || '';
      if (!actParts(s).length) {
        persist(); render(); toast('Enter at least one ACT section score', 'error'); return;
      }
      state.act.unshift(s);
      sortByDate(state.act);
      persist(); render(); toast('ACT sitting added');
      return;
    }

    if (act === 'add-exam') {
      var board = boardOf(val('fasExamBoard'));
      var name = String(val('fasExamName') || '').trim().slice(0, 60);
      var score = examScore(val('fasExamScore'), board);
      if (!name) { toast('Name the subject first', 'error'); return; }
      if (score == null) { toast('Score must be 1–' + BOARDS[board].max + ' for ' + BOARDS[board].label, 'error'); return; }
      state.exams.unshift({ id: rid(), board: board, name: name, score: score, year: yearOrBlank(val('fasExamYear')) });
      // Newest year first, then by score, so the strongest results lead.
      state.exams.sort(function (a, b) {
        if (a.year !== b.year) return (b.year || '') > (a.year || '') ? 1 : -1;
        return b.score - a.score;
      });
      persist(); render(); toast('Exam result added');
    }
  }

  function render() {
    var host = document.getElementById('academicScoresMount');
    if (!host) return false;
    host.innerHTML = html();
    if (!host.__fasWired) { host.__fasWired = true; host.addEventListener('click', onClick); }
    // The date fields are brand new, so the themed picker has not seen them.
    try { if (window.FluxDatePicker && FluxDatePicker.upgrade) FluxDatePicker.upgrade(host); } catch (e) {}
    return true;
  }

  /* ── cloud ───────────────────────────────────────────────────────────────
     Same two-function contract as every other synced module. Read fresh from
     storage rather than trusting the module-level `state`, which was captured
     when this file ran — before sign-in, when the namespace was still empty. */
  function getCloudSlice() { state = sanitise(readRaw()); return state; }
  function applyFromCloud(data) {
    if (!data || typeof data !== 'object') return;
    var incoming = sanitise(data);
    var mine = sanitise(readRaw());
    /* Never let an empty cloud record delete scores that exist here. Same
       reasoning as cloudListWins in app.js: refusing an empty list can only
       prevent a deletion, and a student who has typed in four years of results
       should not lose them to a device that has never opened this card. */
    if (!incoming.sat.length && mine.sat.length) incoming.sat = mine.sat;
    if (!incoming.act.length && mine.act.length) incoming.act = mine.act;
    if (!incoming.exams.length && mine.exams.length) incoming.exams = mine.exams;
    if (!incoming.gpa.unweighted && mine.gpa.unweighted) incoming.gpa = mine.gpa;
    state = incoming;
    writeRaw(state);
    try { render(); } catch (e) {}
  }

  window.FluxAcademicScores = {
    render: render,
    getCloudSlice: getCloudSlice,
    applyFromCloud: applyFromCloud,
    // Exposed for the test suite and for anything wanting the numbers without
    // re-deriving them (the opportunity matcher, an AI summary).
    summary: function () {
      var ss = satSuper(), as = actSuper();
      return { gpa: state.gpa, satSuperscore: ss, satBest: bestSatSitting(),
        actSuperscore: as, actBest: bestActSitting(), exams: state.exams,
        satAsAct: satToAct(ss != null ? ss : bestSatSitting()),
        actAsSat: actToSat(as != null ? as : bestActSitting()) };
    },
    _concord: { satToAct: satToAct, actToSat: actToSat },
  };
})();
