/**
 * Flux · Themed date picker.
 *
 * `<input type="date">` opens the browser's own calendar. `color-scheme: dark`
 * makes that popup dark, but nothing can reach inside it — the accent colour,
 * the font, the corner radius and the selected-day chip all stay the platform's,
 * which is why it reads as foreign next to the rest of Flux.
 *
 * So the native popup is suppressed (its picker indicator is hidden in CSS) and
 * this renders a themed one instead. The element stays a real
 * `input[type="date"]`: the value is still an ISO `YYYY-MM-DD` string and
 * `change`/`input` still fire, so every existing reader — pinDateFromInput(),
 * form serialisation, anything listening for changes — keeps working untouched.
 *
 * Opt out per input with `data-flux-datepicker="off"`.
 *
 * Self-contained IIFE. Exposes window.FluxDatePicker.
 */
(function () {
  'use strict';

  var DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  var open = null; // { input, pop, view: Date }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /** Parse YYYY-MM-DD as a *local* date. `new Date('2026-09-23')` is parsed as
      UTC and lands on the previous day for anyone west of Greenwich. */
  function parseIso(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  function sameDay(a, b) {
    return !!a && !!b && a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function inRange(input, d) {
    var min = parseIso(input.getAttribute('min'));
    var max = parseIso(input.getAttribute('max'));
    if (min && d < min) return false;
    if (max && d > max) return false;
    return true;
  }

  /* ---------- render ---------- */

  function gridHtml(input, view, selected) {
    var today = new Date();
    var first = new Date(view.getFullYear(), view.getMonth(), 1);
    // Sunday-first, matching the planner's own calendars.
    var start = new Date(first);
    start.setDate(1 - first.getDay());

    var cells = '';
    for (var i = 0; i < 42; i++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var isSel = sameDay(d, selected);
      var disabled = !inRange(input, d);
      var cls = 'fdp-day';
      if (d.getMonth() !== view.getMonth()) cls += ' fdp-day--outside';
      if (sameDay(d, today)) cls += ' fdp-day--today';
      if (isSel) cls += ' fdp-day--selected';
      cells += '<button type="button" class="' + cls + '" data-fdp-date="' + iso(d) + '"'
        + (disabled ? ' disabled' : '')
        + ' tabindex="' + (isSel ? '0' : '-1') + '"'
        + (isSel ? ' aria-current="date"' : '')
        + ' aria-label="' + esc(d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear()) + '"'
        + '>' + d.getDate() + '</button>';
    }

    return '<div class="fdp-head">'
      + '<button type="button" class="fdp-nav" data-fdp-nav="-1" aria-label="Previous month">&#8249;</button>'
      + '<div class="fdp-title">' + esc(MONTHS[view.getMonth()]) + ' ' + view.getFullYear() + '</div>'
      + '<button type="button" class="fdp-nav" data-fdp-nav="1" aria-label="Next month">&#8250;</button>'
      + '</div>'
      + '<div class="fdp-dow">' + DAYS.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div>'
      + '<div class="fdp-grid">' + cells + '</div>'
      + '<div class="fdp-foot">'
      + '<button type="button" class="fdp-action" data-fdp-clear>Clear</button>'
      + '<button type="button" class="fdp-action fdp-action--accent" data-fdp-today>Today</button>'
      + '</div>';
  }

  function paint() {
    if (!open) return;
    open.pop.innerHTML = gridHtml(open.input, open.view, parseIso(open.input.value));
  }

  /* ---------- position ---------- */

  function place() {
    if (!open) return;
    /* An anchor that has left the document reports a rect of all zeros, and
       positioning against that puts the calendar in the top-left corner of the
       screen — which is what a student saw after clicking a month arrow inside
       a popup that removed itself. There is nothing honest to point at once
       the field is gone, so close rather than float somewhere arbitrary. */
    if (!open.input.isConnected) { closePicker(); return; }
    var r = open.input.getBoundingClientRect();
    var pop = open.pop;
    var h = pop.offsetHeight;
    var w = pop.offsetWidth;
    // Flip above when there is no room below, and keep it on screen sideways.
    var below = window.innerHeight - r.bottom;
    var top = (below < h + 12 && r.top > h + 12) ? r.top - h - 6 : r.bottom + 6;
    var left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8));
    pop.style.top = Math.round(top) + 'px';
    pop.style.left = Math.round(left) + 'px';
  }

  /* ---------- open / close ---------- */

  function closePicker() {
    if (!open) return;
    open.pop.remove();
    open.input.removeAttribute('aria-expanded');
    open = null;
    document.removeEventListener('mousedown', onDocDown, true);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
  }

  function onDocDown(e) {
    if (!open) return;
    if (open.pop.contains(e.target) || e.target === open.input) return;
    closePicker();
  }

  function openPicker(input) {
    if (open && open.input === input) { closePicker(); return; }
    closePicker();
    var sel = parseIso(input.value);
    var pop = document.createElement('div');
    pop.className = 'fdp-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Choose a date');
    document.body.appendChild(pop);
    open = { input: input, pop: pop, view: sel || new Date() };
    input.setAttribute('aria-expanded', 'true');
    paint();
    place();
    document.addEventListener('mousedown', onDocDown, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    var cur = pop.querySelector('.fdp-day--selected') || pop.querySelector('.fdp-day--today');
    if (cur) cur.focus({ preventScroll: true });
  }

  function commit(isoStr) {
    if (!open) return;
    var input = open.input;
    input.value = isoStr;
    // Existing code listens on change (and some on input) — fire both so this
    // is indistinguishable from the native picker.
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    closePicker();
    input.focus({ preventScroll: true });
  }

  /* ---------- events ---------- */

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;

    if (open && open.pop.contains(t)) {
      /* This click belongs to the calendar; nothing else should also react to
         it. Without this, a click on a month arrow went on to reach the
         document-level "click outside" handlers that other popups install —
         and one of those (openInlineDatePicker, for a task's due date) removed
         the box containing the very field this calendar is anchored to.
         Checking the target for .fdp-pop in those handlers is not enough:
         paint() below replaces the popup's contents while we are still in the
         capture phase, so the button they receive is already detached and
         closest('.fdp-pop') finds nothing. Stopping it here is the only point
         at which the truth is still knowable. */
      e.stopPropagation();
      var nav = t.closest('[data-fdp-nav]');
      if (nav) {
        open.view = new Date(open.view.getFullYear(), open.view.getMonth() + Number(nav.getAttribute('data-fdp-nav')), 1);
        paint(); place();
        return;
      }
      if (t.closest('[data-fdp-today]')) {
        var now = new Date();
        if (inRange(open.input, now)) commit(iso(now));
        return;
      }
      if (t.closest('[data-fdp-clear]')) { commit(''); return; }
      var day = t.closest('[data-fdp-date]');
      if (day && !day.disabled) commit(day.getAttribute('data-fdp-date'));
      return;
    }

    var inp = t.closest('input[type="date"]');
    if (inp && isUpgraded(inp)) {
      e.preventDefault();
      openPicker(inp);
    }
  }, true);

  document.addEventListener('keydown', function (e) {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); var i = open.input; closePicker(); i.focus(); return; }

    var focused = document.activeElement;
    if (!focused || !open.pop.contains(focused)) return;
    var d = focused.getAttribute && focused.getAttribute('data-fdp-date');
    if (!d) return;
    var cur = parseIso(d);
    if (!cur) return;

    var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) {
      e.preventDefault();
      var next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + step);
      open.view = new Date(next.getFullYear(), next.getMonth(), 1);
      paint(); place();
      var btn = open.pop.querySelector('[data-fdp-date="' + iso(next) + '"]');
      if (btn) { btn.setAttribute('tabindex', '0'); btn.focus({ preventScroll: true }); }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(d); }
  });

  /* ---------- upgrade ---------- */

  function isUpgraded(inp) {
    return inp.dataset.fluxDatepicker !== 'off' && inp.dataset.fdpReady === '1';
  }

  function upgrade(root) {
    (root || document).querySelectorAll('input[type="date"]').forEach(function (inp) {
      if (inp.dataset.fdpReady === '1' || inp.dataset.fluxDatepicker === 'off') return;
      inp.dataset.fdpReady = '1';
      inp.classList.add('fdp-input');
    });
  }

  // Panels render lazily and re-render often, so watch rather than scan once.
  function boot() {
    upgrade(document);
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes && muts[i].addedNodes.length) { upgrade(document); return; }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.FluxDatePicker = { open: openPicker, close: closePicker, upgrade: upgrade };
})();
