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

/* The card lives on College Prep → Test scores. It began on the Profile tab,
   four cards below the fold, and the first feedback on it was "I couldn't find
   the SAT ACT stuff anywhere" — so where it opens is part of the feature and
   is asserted rather than assumed. The sub-tab must be activated before
   anything is measured: an inactive .spane has no layout, so clicks inside it
   silently miss. */
const openScores = async (page: import('@playwright/test').Page) => {
  await page.evaluate(() => (window as any).nav('goals'));
  await page.locator('#goals .stab[onclick*="scores"]').click();
  await expect(page.locator('#ecpane-scores')).toHaveClass(/active/);
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
    await openScores(page);
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
    await openScores(page);
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

    // The name field is on the Profile tab, which is now a different tab from
    // the scores card — that separation is exactly what makes the wipe easy to
    // miss, so the test crosses it deliberately.
    await page.evaluate(() => (window as any).nav('profile'));
    await page.fill('#name', 'Sam Rivera');
    await page.evaluate(() => (window as any).saveProfile());
    const after = await page.evaluate(() => (window as any).load('profile', {}));
    expect(after.name).toBe('Sam Rivera');
    expect(after.gpa, 'Save Profile deleted the GPA again').toBe('3.85');
  });

  test('AP and IB results are held to their own ceilings', async ({ page }) => {
    await seed(page, {
      exams: [
        { id: 'e1', board: 'ib', name: 'History HL', score: 6, year: '2026' },
        // 6 is a fine IB score and an impossible AP one. Storing a bare number
        // and guessing the board later is how an IB 6 becomes an invalid AP 6.
        { id: 'e2', board: 'ap', name: 'Calculus BC', score: 6, year: '2026' },
        { id: 'e3', board: 'ap', name: '', score: 5, year: '2026' },   // no subject
      ],
    });
    const s = await page.evaluate(() => (window as any).FluxAcademicScores.summary());
    expect(s.exams.length, 'the unnamed result was kept').toBe(2);
    expect(s.exams.find((e: any) => e.board === 'ib').score).toBe(6);
    expect(s.exams.find((e: any) => e.board === 'ap').score, 'an AP 6 was stored').toBe(5);
  });

  test('a passing exam score reads differently from a failing one', async ({ page }) => {
    /* The pass mark is not the same number on the two boards — 3 on an AP, 4
       on an IB subject — so a single threshold would mark an IB 3 as a pass.
       Colour only; the score and the "out of 5" already say it in text. */
    await seed(page, {
      exams: [
        { id: 'e1', board: 'ap', name: 'Calculus BC', score: 5, year: '2026' },
        { id: 'e2', board: 'ib', name: 'History HL', score: 3, year: '2026' },
        { id: 'e3', board: 'ap', name: 'US History', score: 2, year: '2025' },
      ],
    });
    // The exam list is the last .fas-list in the card — SAT and ACT come first.
    const colours = await page.evaluate(() => {
      const lists = [...document.querySelectorAll('#academicScoresMount .fas-list')];
      const exams = lists[lists.length - 1] as HTMLElement;
      return [...exams.querySelectorAll('.fas-row-score')].map((e) => ({
        n: e.textContent,
        good: e.classList.contains('is-good'),
        colour: getComputedStyle(e).color,
      }));
    });

    const ap5 = colours.find((c) => c.n === '5')!;
    const ib3 = colours.find((c) => c.n === '3')!;
    const ap2 = colours.find((c) => c.n === '2')!;
    expect(ap5.good, 'an AP 5 was not marked as a pass').toBe(true);
    expect(ib3.good, 'an IB 3 was marked as a pass — that is the AP threshold').toBe(false);
    expect(ap2.good).toBe(false);
    expect(ap5.colour, 'the pass mark is not actually visible').not.toBe(ap2.colour);
  });

  test('an exam result typed into the form is saved', async ({ page }) => {
    await page.selectOption('#fasExamBoard', 'ib');
    await page.fill('#fasExamName', 'Physics HL');
    await page.fill('#fasExamScore', '7');
    await page.fill('#fasExamYear', '2026');
    await page.click('[data-fas-act="add-exam"]');

    const s = await page.evaluate(() => (window as any).FluxAcademicScores.summary());
    expect(s.exams[0]).toMatchObject({ board: 'ib', name: 'Physics HL', score: 7, year: '2026' });
    await expect(page.locator('.fas-list').last()).toContainText('Physics HL');
  });
});

/*
 * The college list gained an application deadline and a status.
 *
 * Everything here goes through the real form rather than pushing objects into
 * `ecSchools`: that binding is a module-scoped `let` inside the bundle, not a
 * window global, so a test that assigns to it would be writing to nothing and
 * passing on the render it triggered by hand. Selectors are scoped to
 * #ecpane-colleges for the same class of reason — "+ Add" matches buttons in
 * several other panels, and Playwright would happily click one of those.
 */
test.describe('College Prep: the college list', () => {
  const PANE = '#ecpane-colleges';

  async function addSchool(page: import('@playwright/test').Page,
    name: string, tier: string, deadline?: string) {
    await page.fill(`${PANE} #schoolName`, name);
    await page.selectOption(`${PANE} #schoolTier`, tier);
    if (deadline) await page.fill(`${PANE} #schoolDeadline`, deadline);
    await page.locator(`${PANE} button:has-text("+ Add")`).click();
    await expect(page.locator(`${PANE} #schoolsList`)).toContainText(name);
  }

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoScenario(page, 'student-semester');
    await page.evaluate(() => (window as any).nav('goals'));
    await page.locator('#goals .stab[onclick*="colleges"]').click();
    await expect(page.locator(PANE)).toHaveClass(/active/);
  });

  test('schools sort by deadline, and undated ones sink', async ({ page }) => {
    // Added out of order on purpose — insertion order must not survive.
    await addSchool(page, 'Later School', 'target', '2027-03-01');
    await addSchool(page, 'No Deadline', 'safety');
    await addSchool(page, 'Sooner School', 'reach', '2027-01-05');

    const rows = await page.locator(`${PANE} #schoolsList > div`).allInnerTexts();
    const idx = (n: string) => rows.findIndex((r) => r.includes(n));
    expect(idx('Sooner School')).toBeLessThan(idx('Later School'));
    expect(idx('No Deadline'), 'a school with no deadline jumped the queue')
      .toBeGreaterThan(idx('Later School'));
  });

  test('the status chip walks the application forward and is stored', async ({ page }) => {
    await addSchool(page, 'Purdue', 'target', '2027-01-05');

    const chip = page.locator(`${PANE} #schoolsList button[onclick*="cycleSchoolStatus"]`).first();
    await expect(chip).toHaveText('Not started');
    await chip.click();
    await expect(chip).toHaveText('Writing');
    await chip.click();
    await expect(chip).toHaveText('Submitted');

    const stored = await page.evaluate(() =>
      ((window as any).load('flux_ec_schools', []) as any[]).find((s) => s.name === 'Purdue'));
    expect(stored.status, 'the status was on screen but never saved').toBe('submitted');
  });

  test('a school added without a deadline still works', async ({ page }) => {
    // The deadline field is optional; requiring it would put a question between
    // the student and writing down a school they just thought of.
    await addSchool(page, 'Michigan', 'reach');
    const stored = await page.evaluate(() =>
      ((window as any).load('flux_ec_schools', []) as any[]).find((s) => s.name === 'Michigan'));
    expect(stored.deadline).toBe('');
    expect(stored.status).toBe('notstarted');
  });

  test('a deadline inside two weeks is called out, a submitted one is not', async ({ page }) => {
    /* Computed in the page, not in Node. The scenario can pin the browser's
       clock, and daysToDeadline() measures against that — a date built here
       would be "in 5 days" by the runner's watch and months away by the app's.
       Local parts, not toISOString(), which is UTC and slips a day west of
       Greenwich. */
    const soon = await page.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() + 5);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    });
    await addSchool(page, 'Deadline Soon', 'reach', soon);

    const row = page.locator(`${PANE} #schoolsList > div`).filter({ hasText: 'Deadline Soon' });
    await expect(row).toContainText('in 5 days');
    const urgentColour = await row.locator('div[style*="color"]').last()
      .evaluate((e) => getComputedStyle(e).color);

    // Once it is submitted the date is history, not pressure.
    await row.locator('button[onclick*="cycleSchoolStatus"]').click();
    await row.locator('button[onclick*="cycleSchoolStatus"]').click();
    await expect(row.locator('button[onclick*="cycleSchoolStatus"]')).toHaveText('Submitted');
    const calmColour = await row.locator('div[style*="color"]').last()
      .evaluate((e) => getComputedStyle(e).color);
    expect(calmColour, 'a submitted application is still being shown as urgent').not.toBe(urgentColour);
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
