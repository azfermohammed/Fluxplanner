import { test, expect } from '@playwright/test';
import { gotoScenario } from './helpers';

/*
 * The themed date picker, opened from a task's due-date box.
 *
 * Reported as "it glitches out … and once it drops, it moves slightly to the
 * right when you click something". Measuring it found three separate faults
 * stacked on top of each other:
 *
 *  1. .fdp-pop is appended to <body>, so a click on its month arrows looked
 *     "outside" to openInlineDatePicker's close-on-outside-click handler, which
 *     removed the box holding the <input> the calendar is anchored to. One
 *     click and the field was gone: {inlineAlive:false, inputAttached:false}.
 *  2. place() then measured that detached input, got a rect of all zeros, and
 *     moved the calendar to the corner of the screen — (25,436) → (8,6) on the
 *     second arrow click.
 *  3. The entrance animation scaled from .985, and scale grows from the centre,
 *     so both side edges travelled while it settled: left went 27.2px → 25.0px.
 *
 * Fixing (1) needed the stopPropagation in flux-datepicker.js rather than a
 * target check in app.js, because paint() replaces the popup's contents during
 * the capture phase — the button that reaches the document is already detached
 * and closest('.fdp-pop') finds nothing. The commit test below is the guard on
 * that stopPropagation: swallowing too much would stop dates being chosen at
 * all, which is a far worse bug than the one being fixed.
 */

async function openDueDateCalendar(page: import('@playwright/test').Page) {
  await page.evaluate(() => (window as any).nav('tasks'));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const t = (window as any).tasks?.[0];
    (window as any).openInlineDatePicker(t.id, document.body);
  });
  const input = page.locator('#inlineDatePicker input[type="date"]');
  await expect(input).toBeVisible();
  await input.click();
  await expect(page.locator('.fdp-pop')).toBeVisible();
  await page.waitForTimeout(250);          // let the entrance animation finish
}

/** Where the calendar is, and whether the field it points at still exists. */
function readState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const p = document.querySelector('.fdp-pop') as HTMLElement | null;
    const input = document.querySelector('#inlineDatePicker input[type="date"]');
    return {
      open: !!p,
      left: p ? Math.round(p.getBoundingClientRect().left) : null,
      top: p ? Math.round(p.getBoundingClientRect().top) : null,
      title: p ? (p.querySelector('.fdp-title') as HTMLElement)?.textContent : null,
      boxAlive: !!document.getElementById('inlineDatePicker'),
      inputAttached: !!input && document.body.contains(input),
    };
  });
}

test.describe('Date picker stays put', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoScenario(page, 'student-semester');
  });

  test('changing month does not destroy the field the calendar points at', async ({ page }) => {
    await openDueDateCalendar(page);
    const start = await readState(page);

    for (let i = 0; i < 3; i++) {
      await page.locator('.fdp-nav[data-fdp-nav="1"]').click();
      await page.waitForTimeout(120);
      const now = await readState(page);
      expect(now.boxAlive, `the due-date box was torn down on arrow click ${i + 1}`).toBe(true);
      expect(now.inputAttached, `the anchor field was detached on arrow click ${i + 1}`).toBe(true);
      expect(now.open, `the calendar closed itself on arrow click ${i + 1}`).toBe(true);
      /* The whole complaint: it must not drift. A tolerance rather than exact
         equality because place() re-derives the position from the live rect of
         the field, which reads anywhere in 23.9–25.0px across paints; asserting
         equality fails on that sub-pixel noise. 2px still catches the fault
         this test exists for by a wide margin — it moved 17px sideways and
         430px up, into the corner of the screen. */
      expect(Math.abs(now.left! - start.left!),
        `the calendar moved sideways on arrow click ${i + 1}`).toBeLessThanOrEqual(2);
      expect(Math.abs(now.top! - start.top!),
        `the calendar moved vertically on arrow click ${i + 1}`).toBeLessThanOrEqual(2);
    }
    // And it was actually paging months, not just sitting inert.
    expect((await readState(page)).title).not.toBe(start.title);
  });

  test('it closes rather than jumping to the corner if its field disappears', async ({ page }) => {
    await openDueDateCalendar(page);
    const before = await readState(page);
    expect(before.open).toBe(true);

    // Whatever removes the field — a re-render, a closing modal — must not
    // leave a calendar floating against a zeroed rectangle.
    await page.evaluate(() => {
      document.getElementById('inlineDatePicker')?.remove();
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(150);

    const after = await readState(page);
    expect(after.open, 'the calendar outlived the field it belonged to').toBe(false);
  });

  test('picking a day still sets the date', async ({ page }) => {
    // The guard on stopPropagation: the calendar swallowing its own clicks must
    // not swallow the one that matters.
    await openDueDateCalendar(page);
    const target = await page.evaluate(() => {
      const d = [...document.querySelectorAll('.fdp-day:not(.fdp-day--outside):not(:disabled)')] as HTMLElement[];
      const pick = d[14] || d[0];
      return pick.getAttribute('data-fdp-date');
    });
    await page.locator(`.fdp-day[data-fdp-date="${target}"]`).click();
    await expect.poll(() => page.evaluate(() => (window as any).tasks?.[0]?.date)).toBe(target);
    expect((await readState(page)).open, 'the calendar stayed open after committing').toBe(false);
  });

  test('the field shows a calendar icon and leaves room for it', async ({ page }) => {
    await page.evaluate(() => (window as any).nav('tasks'));
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const t = (window as any).tasks?.[0];
      (window as any).openInlineDatePicker(t.id, document.body);
    });
    const style = await page.locator('#inlineDatePicker input[type="date"]').evaluate((e) => ({
      bg: getComputedStyle(e).backgroundImage,
      padRight: parseFloat(getComputedStyle(e).paddingRight),
    }));
    /* Both were lost to the cascade. The themes restyle fields with the
       `background` shorthand, which resets background-image to none; and
       `input[type=date]` is (0,1,1) because an attribute selector counts as a
       class, so it outranked a bare `.fdp-input` and reclaimed the padding. */
    expect(style.bg, 'the calendar icon is not being painted').toContain('url(');
    expect(style.padRight, 'the date text will run under the icon').toBeGreaterThanOrEqual(30);
  });

  test('the entrance animation does not move it sideways', async ({ page }) => {
    await page.evaluate(() => (window as any).nav('tasks'));
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const t = (window as any).tasks?.[0];
      (window as any).openInlineDatePicker(t.id, document.body);
    });
    await page.locator('#inlineDatePicker input[type="date"]').click();

    const lefts = await page.evaluate(async () => {
      const out: number[] = [];
      for (let i = 0; i < 6; i++) {
        const p = document.querySelector('.fdp-pop') as HTMLElement;
        out.push(+p.getBoundingClientRect().left.toFixed(1));
        await new Promise((r) => setTimeout(r, 45));
      }
      return out;
    });
    const spread = Math.max(...lefts) - Math.min(...lefts);
    expect(spread, `the calendar drifted ${spread}px sideways while appearing: ${lefts}`).toBeLessThan(0.6);
  });
});
