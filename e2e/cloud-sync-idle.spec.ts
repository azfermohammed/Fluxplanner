import { test, expect } from '@playwright/test';
import { gotoScenario } from './helpers';

/*
 * The cloud pull must do nothing when nothing changed.
 *
 * syncFromCloud() runs every 8 seconds. It used to fan the fetched row out to
 * ~40 module applyFromCloud() calls and then run thirteen full re-renders plus
 * populateSubjectSelects(), unconditionally — whether or not the row had
 * changed since the last pull.
 *
 * That is destructive rather than merely wasteful. Every render rebuilds its
 * panel from an HTML string, so every 8 seconds the app discarded half-typed
 * text, closed open <select>s and collapsed expanded sections. Reported as
 * "every few seconds the entire app refreshes... it removes all the changes
 * when someone's typing", and "it doesn't even let the drop down stay open".
 *
 * These tests drive syncFromCloud directly with a stubbed client, because the
 * thing being asserted is what happens on the *second* pull of identical data
 * — which a wall-clock test would take 16 seconds to reach and could not
 * attribute reliably.
 */

const PAYLOAD = {
  tasks: [{ id: 1, title: 'Read chapter 4', done: false, due: '2026-09-08' }],
  timeTools: { alarms: [], worldClocks: [], clock: { font: 'mono' } },
};

/** Replace the Supabase client with one that always returns `payload`, and
 *  count how many times the app repaints. */
async function installStub(page: import('@playwright/test').Page, payload: unknown) {
  await page.evaluate((p) => {
    const w = window as any;
    w.__pulls = 0;
    w.__renders = 0;

    w.getSB = () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => {
              w.__pulls++;
              // Cloned each time, so a pull can never be skipped merely
              // because it is the same object identity as the last one.
              return { data: { data: JSON.parse(JSON.stringify(p)) }, error: null };
            },
          }),
        }),
      }),
    });

    // populateSubjectSelects is the one that rebuilds the dropdowns, so it is
    // the most faithful proxy for "the UI was thrown away and redrawn".
    const real = w.populateSubjectSelects;
    w.populateSubjectSelects = function (...args: unknown[]) {
      w.__renders++;
      try { return real.apply(this, args); } catch (_) { /* not what we measure */ }
    };
  }, payload);
}

test.describe('Cloud pull while nothing is changing', () => {
  test.beforeEach(async ({ page }) => {
    // teacher-workflow, not student-semester: only a scenario with
    // needsUser:true has a currentUser, and syncFromCloud returns immediately
    // without one — so this would pass vacuously on the student scenario.
    await gotoScenario(page, 'teacher-workflow');
    await installStub(page, PAYLOAD);
  });

  test('an unchanged row is fetched but never re-applied', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      await w.syncFromCloud();           // first pull — applies and renders
      const first = w.__renders;
      await w.syncFromCloud();           // same data
      await w.syncFromCloud();           // and again
      await w.syncFromCloud();
      return { first, after: w.__renders, pulls: w.__pulls };
    });

    // It still asks the server every time — going quiet would be a different
    // bug, and a device that stopped pulling would never see a real change.
    expect(res.pulls, 'the pull stopped happening').toBe(4);
    // The first one is allowed to paint. The three that brought nothing new
    // must not: this is the whole fix.
    expect(res.first, 'the first pull should apply and render once').toBe(1);
    expect(res.after, 'an unchanged row was applied again').toBe(1);
  });

  test('a row that really changed is still applied', async ({ page }) => {
    const res = await page.evaluate(async (base) => {
      const w = window as any;
      await w.syncFromCloud();
      const afterFirst = w.__renders;

      // Same shape, different content — this must get through.
      const changed = JSON.parse(JSON.stringify(base));
      changed.tasks.push({ id: 2, title: 'Lab report', done: false, due: '2026-09-11' });
      w.getSB = () => ({
        from: () => ({
          select: () => ({ eq: () => ({ single: async () => ({ data: { data: changed }, error: null }) }) }),
        }),
      });
      await w.syncFromCloud();
      return { afterFirst, afterChange: w.__renders, tasks: (w.tasks || []).length };
    }, PAYLOAD);

    expect(res.afterFirst).toBe(1);
    expect(res.afterChange, 'a genuinely changed row was skipped').toBe(2);
    expect(res.tasks, 'the new task never arrived').toBe(2);
  });

  test('typing survives a pull that brings nothing new', async ({ page }) => {
    // The user-visible version of the first test: the reported symptom was
    // losing what you had typed, so assert on that directly.
    await page.evaluate(() => (window as any).nav?.('timer'));
    await page.evaluate(() => (window as any).FluxTimeTools.setView('alarms'));
    const label = page.locator('#fttAlLabel');
    await expect(label).toBeVisible();
    await label.fill('Bus to school');

    await page.evaluate(async () => {
      const w = window as any;
      await w.syncFromCloud();
      await w.syncFromCloud();
    });

    await expect(label, 'the pull wiped what was being typed').toHaveValue('Bus to school');
  });
});

/*
 * The stub above answers every pull with the same fixed payload, so it can
 * only ever catch a pull that ignores its own bookkeeping. It cannot catch the
 * bug that actually kept the app repainting: the row the pull reads is the row
 * *we* wrote 2.5 seconds earlier.
 *
 * Only syncFromCloud used to stamp the fingerprint. So any edit started a loop
 * against ourselves — type a character, push it, then pull it back as a row
 * that no longer matched the last stamp, which re-applied everything and threw
 * away whatever was still half-typed. Keep typing and it repeated every eight
 * seconds. Reported as "i cant even put in test scores without it clearing my
 * typing".
 *
 * These tests need a stub that stores what it is given, and that hands it back
 * with the keys in a different order — because `user_data.data` is jsonb, and
 * Postgres does not keep our key order. A fingerprint compared with plain
 * JSON.stringify never matches across that round trip.
 */
test.describe('Cloud pull after this device pushed', () => {
  test.beforeEach(async ({ page }) => {
    await gotoScenario(page, 'teacher-workflow');
    await page.evaluate(() => {
      const w = window as any;
      w.__renders = 0;
      w.__pulls = 0;

      // Reorders object keys on the way out, as jsonb does.
      const reorder = (o: any): any => {
        if (o === null || typeof o !== 'object') return o;
        if (Array.isArray(o)) return o.map(reorder);
        const out: any = {};
        for (const k of Object.keys(o).sort().reverse()) out[k] = reorder(o[k]);
        return out;
      };

      let row = JSON.parse(JSON.stringify(w.getCloudPayload()));
      w.__setRemote = (fn: (r: any) => void) => { fn(row); };
      w.getSB = () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => {
                w.__pulls++;
                return { data: { data: reorder(JSON.parse(JSON.stringify(row))) }, error: null };
              },
              maybeSingle: async () => ({ data: { data: reorder(JSON.parse(JSON.stringify(row))) }, error: null }),
            }),
          }),
          upsert: async (o: any) => { row = JSON.parse(JSON.stringify(o.data)); return { error: null }; },
        }),
      });

      const real = w.populateSubjectSelects;
      w.populateSubjectSelects = function (...args: unknown[]) {
        w.__renders++;
        try { return real.apply(this, args); } catch (_) { /* not what we measure */ }
      };
    });
  });

  test('our own edit does not come back and repaint the app', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      await w.syncFromCloud();          // settle: apply once, stamp
      const base = w.__renders;

      // What editing any field amounts to.
      w.tasks = (w.tasks || []).concat([{ id: 999, title: 'Half typed', done: false }]);
      w.save('tasks', w.tasks);

      await w.syncToCloud();            // the 2.5s push sends it up
      await w.syncFromCloud();          // the 8s pull reads it back
      await w.syncFromCloud();
      await w.syncFromCloud();

      return { base, echoRenders: w.__renders - base, pulls: w.__pulls };
    });

    // Still talking to the server — going quiet would be a different bug.
    expect(res.pulls, 'the pull stopped happening').toBe(4);
    expect(res.base, 'the first pull should apply and render once').toBe(1);
    expect(res.echoRenders, 'our own push was re-applied as though remote').toBe(0);
  });

  test('a change from another device still arrives', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const w = window as any;
      await w.syncFromCloud();
      const base = w.__renders;

      // Someone else's phone writes the row.
      w.__setRemote((r: any) => { r.tasks = (r.tasks || []).concat([{ id: 4242, title: 'From my phone', done: false }]); });
      await w.syncFromCloud();

      return {
        renders: w.__renders - base,
        arrived: (w.tasks || []).some((t: any) => t && t.id === 4242),
      };
    });

    expect(res.arrived, 'a real remote change was swallowed by the fingerprint').toBe(true);
    expect(res.renders, 'a real remote change did not repaint').toBeGreaterThan(0);
  });

  test('a remote change waits for the end of the word, then lands', async ({ page }) => {
    await page.evaluate(() => (window as any).nav?.('timer'));
    await page.evaluate(() => (window as any).FluxTimeTools.setView('alarms'));
    const label = page.locator('#fttAlLabel');
    await expect(label).toBeVisible();

    // Typed, not filled: the guard keys off real keystrokes.
    await label.click();
    await label.pressSequentially('Bus to school');

    const held = await page.evaluate(async () => {
      const w = window as any;
      await w.syncFromCloud();
      w.__setRemote((r: any) => { r.tasks = (r.tasks || []).concat([{ id: 5353, title: 'Mid-word', done: false }]); });
      await w.syncFromCloud();
      return (w.tasks || []).some((t: any) => t && t.id === 5353);
    });

    // Deferred, not lost — and the half-typed value is still there.
    expect(held, 'a remote change was applied mid-word').toBe(false);
    await expect(label, 'the pull wiped what was being typed').toHaveValue('Bus to school');

    // Click away and it comes through on the next pull.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    const landed = await page.evaluate(async () => {
      const w = window as any;
      await w.syncFromCloud();
      return (w.tasks || []).some((t: any) => t && t.id === 5353);
    });
    expect(landed, 'the deferred change never arrived after blur').toBe(true);
  });
});
