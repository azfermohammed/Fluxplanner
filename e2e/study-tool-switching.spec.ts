import { test, expect } from '@playwright/test';
import { gotoScenario } from './helpers';

/*
 * Switching tools inside a Study Tools subject, while the cloud pull is running.
 *
 * The bug: fluxStudyHub.applyFromCloud() assigned subject/chemTab/tool straight
 * from the pulled record, and that pull fires every 8 seconds. Those three
 * fields are a cursor — where the student is looking this second — not data, so
 * taking them mid-use produced "I click Matrix and it just doesn't work" twice
 * over:
 *
 *   · The pull landing in the one-frame gap the click handler leaves between
 *     writing state.tool and rendering reverted the selection, so the tab you
 *     clicked lit up and the panel redrew the tool the cloud named. Measured
 *     before the fix: active tab "Matrix", panel "Graphing calculator",
 *     state.tool.math back to "graph".
 *   · The pull moving state.subject left the strip on screen but every click on
 *     it filed under the wrong subject — state.tool.chemistry = 'matrix' — and
 *     renderToolBody found no such tool, returned false, and changed nothing.
 *     From then on every tab on that strip was dead.
 *
 * Both directions are asserted, because over-guarding is its own bug: if the
 * cursor stopped being adopted at sign-in the student would land on Chemistry
 * every time, which looks nothing like this and would go unnoticed.
 */

const MATH_TABS = ['graph', 'unit', 'matrix'];

async function openMath(page: import('@playwright/test').Page) {
  await page.evaluate(() => (window as any).fluxStudyHub.selectSubject('math'));
  await expect(page.locator('#fshChemTabs [data-tool="graph"]')).toBeVisible();
}

/** What the panel is actually showing, collapsed to one line. */
async function panelText(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const b = document.getElementById('fshSubBody');
    return b ? b.innerText.slice(0, 120).replace(/\s+/g, ' ') : '';
  });
}

test.describe('Study Tools: switching tools survives the cloud pull', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoScenario(page, 'student-semester');
    await page.evaluate(() => (window as any).nav('toolbox'));
    await expect(page.locator('.fsh-pill').first()).toBeVisible();
    await openMath(page);
  });

  test('a pull arriving between the click and the frame cannot revert the tool', async ({ page }) => {
    await page.locator('#fshChemTabs [data-tool="graph"]').click();
    await page.waitForTimeout(400);

    const out = await page.evaluate(async () => {
      const hub = (window as any).fluxStudyHub;
      // A record that still says the grapher — i.e. written before this click.
      const stale = JSON.parse(JSON.stringify(hub.getCloudSlice()));
      (document.querySelector('#fshChemTabs [data-tool="matrix"]') as HTMLElement).click();
      hub.applyFromCloud(stale);                       // the pull, in the gap
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 250));
      return { tool: hub.getCloudSlice().tool.math };
    });

    expect(out.tool, 'the pull reverted the tool the student just chose').toBe('matrix');
    expect(await panelText(page), 'the panel is still showing the grapher').toContain('Matrix');
  });

  test('a pull cannot move the subject out from under the panel on screen', async ({ page }) => {
    const subject = await page.evaluate(() => {
      const hub = (window as any).fluxStudyHub;
      // What another device — or an older session — has stored.
      hub.applyFromCloud({ subject: 'chemistry', chemTab: 'table', tool: {}, favs: [] });
      return hub.currentSubject();
    });
    expect(subject, 'the pull moved the student to another subject mid-use').toBe('math');

    // And the strip still works, which is the part the student actually feels.
    await page.locator('#fshChemTabs [data-tool="matrix"]').click();
    await expect.poll(() => panelText(page)).toContain('Matrix');
    await page.locator('#fshChemTabs [data-tool="unit"]').click();
    await expect.poll(() => panelText(page)).toContain('Unit circle');
  });

  test('every math tab still renders its own tool, one after another', async ({ page }) => {
    // The dead-strip failure only showed up on the second and later clicks, so
    // a single switch would not have caught it.
    for (const id of MATH_TABS) {
      await page.locator(`#fshChemTabs [data-tool="${id}"]`).click();
      await expect
        .poll(async () => page.evaluate(() => (window as any).fluxStudyHub.getCloudSlice().tool.math))
        .toBe(id);
    }
  });

  test('the tab strip says which subject it belongs to', async ({ page }) => {
    // The click handler reads this instead of the global, so if it goes missing
    // the backstop is silently gone even though everything still looks right.
    await expect(page.locator('#fshChemTabs')).toHaveAttribute('data-sid', 'math');
  });

  test('favourites still arrive from the cloud while the hub is open', async ({ page }) => {
    // Favourites are the reason this slice syncs at all. Guarding the cursor
    // must not also stop the data.
    const favs = await page.evaluate(() => {
      const hub = (window as any).fluxStudyHub;
      hub.applyFromCloud({ favs: ['math:graph', 'physics:kinematics'] });
      return hub.getCloudSlice().favs;
    });
    expect(favs).toContain('math:graph');
    expect(favs).toContain('physics:kinematics');
  });

  test('the cursor is still adopted when Study Tools is not on screen', async ({ page }) => {
    // Signing in from the dashboard has to restore where you left off.
    await page.evaluate(() => (window as any).nav('dashboard'));
    await page.waitForTimeout(700);      // the .active class lingers ~500ms
    const state = await page.evaluate(() => {
      const hub = (window as any).fluxStudyHub;
      hub.applyFromCloud({ subject: 'physics', chemTab: 'table', tool: { math: 'unit' }, favs: [] });
      return { subject: hub.currentSubject(), tool: hub.getCloudSlice().tool.math };
    });
    expect(state.subject, 'sign-in no longer restores your subject').toBe('physics');
    expect(state.tool, 'sign-in no longer restores your tool').toBe('unit');
  });

  test('the graphing tab is called Desmos', async ({ page }) => {
    await expect(page.locator('#fshChemTabs [data-tool="graph"]')).toContainText('Desmos');
  });
});
