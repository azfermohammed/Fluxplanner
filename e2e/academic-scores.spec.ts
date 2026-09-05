import { test, expect } from '@playwright/test';
import { gotoScenario } from './helpers';

/*
 * GPA, SAT and ACT on the Profile tab.
 *
 * The arithmetic is what these tests are really for. A superscore is not the
 * best total — it is the best *section* from any date added together — and
 * getting that wrong shows a student a number they will put on an application.
 * So the two are asserted against a case where they disagree: two sittings,
 * neither of which is the best on both halves.
 */

const openProfile = async (page: import('@playwright/test').Page) => {
  await page.evaluate(() => (window as any).nav('profile'));
  await expect(page.locator('#academicScoresMount .fas-card')).toBeVisible();
};

/** Seed scores straight through the module's own cloud path. */
async function seed(page: import('@playwright/test').Page, data: unknown) {
  await page.evaluate((d) => {
    (window as any).FluxAcademicScores.applyFromCloud(d);
  }, data);
}

test.describe('GPA and test scores', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoScenario(page, 'student-semester');
    await openProfile(page);
  });

  test('the superscore takes the best of each section, not the best total', async ({ page }) => {
    await seed(page, {
      sat: [
        // March is the better total (1440); April has the better Math.
        { id: 's1', date: '2026-03-14', ebrw: 720, math: 720 },
        { id: 's2', date: '2026-04-11', ebrw: 660, math: 770 },
      ],
    });
    const s = await page.evaluate(() => (window as any).FluxAcademicScores.summary());
    expect(s.satBest, 'best single sitting').toBe(1440);
    expect(s.satSuperscore, 'best EBRW (720) + best Math (770)').toBe(1490);
  });

  test('the ACT composite is the mean of four sections, and needs all four', async ({ page }) => {
    await seed(page, {
      act: [
        { id: 'a1', date: '2026-04-11', english: 34, math: 30, reading: 35, science: 31 }, // 32.5 → 33
        { id: 'a2', date: '2026-06-13', english: 30, math: 35, reading: 31, science: 33 }, // 32.25 → 32
      ],
    });
    const s = await page.evaluate(() => (window as any).FluxAcademicScores.summary());
    expect(s.actBest, 'best single composite').toBe(33);
    // Best of each: 34, 35, 35, 33 = 137 / 4 = 34.25 → 34
    expect(s.actSuperscore, 'superscore across dates').toBe(34);

    // A sitting missing a section cannot be composited — it must not be
    // averaged over three and reported as if it were a real score.
    await seed(page, { act: [{ id: 'a3', date: '2026-09-12', english: 36, math: 36, reading: 36 }] });
    const partial = await page.evaluate(() => (window as any).FluxAcademicScores.summary());
    expect(partial.actBest, 'a three-section sitting was scored anyway').toBeNull();
  });

  test('an SAT sitting typed into the form is saved and totalled', async ({ page }) => {
    await page.fill('#fasSatEbrw', '700');
    await page.fill('#fasSatMath', '760');
    await page.fill('#fasSatTarget', '1500');
    await page.click('[data-fas-act="add-sat"]');

    await expect(page.locator('.fas-list .fas-row-score').first()).toHaveText('1460');
    await expect(page.locator('.fas-bar-cap').first()).toContainText('40 to go');

    // And it survives a reload, which is the whole point of storing it.
    await page.reload();
    await expect(page.locator('#app')).toHaveClass(/visible/);
    await openProfile(page);
    const s = await page.evaluate(() => (window as any).FluxAcademicScores.summary());
    expect(s.satBest).toBe(1460);
  });

  test('out-of-range scores are pulled back into range rather than stored', async ({ page }) => {
    await seed(page, {
      sat: [{ id: 's1', date: '2026-03-14', ebrw: 9999, math: -50 }],
      act: [{ id: 'a1', date: '2026-04-11', english: 99, math: 0, reading: 'x', science: 32 }],
      gpa: { unweighted: '17', weighted: 'abc', scale: '4.0' },
    });
    const s = await page.evaluate(() => (window as any).FluxAcademicScores.summary());
    expect(s.satBest, 'SAT sections must land inside 200–800').toBe(1000);   // 800 + 200
    expect(s.gpa.unweighted, 'a 17.0 GPA on a 4.0 scale was stored as typed').toBe('5.5');
    expect(s.gpa.weighted, 'a non-numeric GPA became a number').toBe('');
  });

  test('a blank cloud record cannot delete scores already on this device', async ({ page }) => {
    // Same failure mode that deleted colleges and activities: an empty array
    // is truthy, and the pull runs every few seconds.
    await seed(page, { sat: [{ id: 's1', date: '2026-03-14', ebrw: 700, math: 760 }] });
    await seed(page, { sat: [], act: [], gpa: {} });
    const s = await page.evaluate(() => (window as any).FluxAcademicScores.summary());
    expect(s.satBest, 'an empty cloud record wiped the scores').toBe(1460);
  });

  test('the SAT/ACT concordance points both ways and is honest about it', async ({ page }) => {
    const c = await page.evaluate(() => {
      const f = (window as any).FluxAcademicScores._concord;
      return { a1460: f.satToAct(1460), a1600: f.satToAct(1600), a500: f.satToAct(500), s33: f.actToSat(33) };
    });
    expect(c.a1460).toBe(33);
    expect(c.a1600).toBe(36);
    expect(c.a500, 'a score below the table produced a conversion anyway').toBeNull();
    expect(c.s33).toBe(1460);

    await seed(page, { sat: [{ id: 's1', date: '2026-03-14', ebrw: 730, math: 730 }] });
    const line = page.locator('.fas-cross');
    await expect(line).toContainText('about a 33 on the ACT');
    await expect(line, 'the concordance is presented as exact').toContainText('a guide, not a conversion');
  });

  test('saving the profile no longer wipes the GPA the matcher reads', async ({ page }) => {
    await page.fill('#fasGpaU', '3.85');
    await page.click('[data-fas-act="save-gpa"]');
    expect(await page.evaluate(() => (window as any).load('profile', {}).gpa)).toBe('3.85');

    await page.fill('#name', 'Sam Rivera');
    await page.evaluate(() => (window as any).saveProfile());
    const after = await page.evaluate(() => (window as any).load('profile', {}));
    expect(after.name).toBe('Sam Rivera');
    expect(after.gpa, 'Save Profile deleted the GPA again').toBe('3.85');
  });

  test('the entry fields sit in a row instead of stacking', async ({ page }) => {
    // flux-form-controls.css forces every #app input to width:100%, which turns
    // a four-column row into four rows unless the card out-ranks it.
    const tops = await page.evaluate(() => {
      const g = document.querySelector('#academicScoresMount .fas-grid--4') as HTMLElement;
      return [...g.children].map((c) => Math.round(c.getBoundingClientRect().top));
    });
    expect(new Set(tops).size, `the four SAT fields stacked: tops ${tops}`).toBe(1);
  });
});
