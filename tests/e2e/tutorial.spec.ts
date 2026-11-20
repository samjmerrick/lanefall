import { expect, test, type Page } from '@playwright/test';
import { openMenu, savedJson, watchErrors } from './helpers';

const LIFT = 70; // the drop point is this far above the finger (src/ui/Hand.tsx)

const coach = (page: Page) => page.getByTestId('coach');
const next = (page: Page) => page.getByTestId('coach-next');
const endTurn = (page: Page) => page.getByRole('button', { name: 'End Turn' });

/** Waits for the coach to show this step, then taps Next. */
async function readStep(page: Page, text: RegExp) {
  await expect(coach(page)).toContainText(text);
  await next(page).click();
}

/** A point inside the hand card that no neighbouring card covers (the hand fans out and overlaps). */
async function grabPoint(page: Page, name: string) {
  const slot = page.locator('.hand__slot', { has: page.getByLabel(name, { exact: true }) }).first();
  await expect(slot).toBeVisible();
  const handle = await slot.elementHandle();
  const point = await page.evaluate((el) => {
    const r = el!.getBoundingClientRect();
    for (let fy = 0.3; fy < 0.9; fy += 0.1)
      for (let fx = 0.1; fx < 0.9; fx += 0.1) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        if (document.elementFromPoint(x, y)?.closest('.hand__slot') === el) return { x, y };
      }
    return null;
  }, handle);
  expect(point, `a free point on ${name}`).not.toBeNull();
  return point!;
}

/** Drags a hand card onto the zone the coach highlights. */
async function dragToCoachTarget(page: Page, name: string) {
  const from = await grabPoint(page, name);
  const target = page.locator('.coach-target').first();
  await expect(target).toBeVisible();
  const t = (await target.boundingBox())!;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 30, { steps: 4 });
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2 + LIFT, { steps: 8 });
  await page.mouse.up();
}

async function openTutorial(page: Page) {
  await openMenu(page, '?speed=0.05');
  await page.getByTestId('tutorial-prompt').getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('main', { name: 'Match' })).toBeVisible();
}

test.describe('390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test('a fresh profile is offered the tutorial, which can be completed', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchErrors(page);
    await openMenu(page, '?speed=0.05');
    const prompt = page.getByTestId('tutorial-prompt');
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('main', { name: 'Match' })).toBeVisible();

    // Welcome, lanes and mana: nothing can be played or ended yet.
    await readStep(page, /Welcome/);
    await readStep(page, /opposite them/);
    await expect(coach(page)).toContainText(/1 mana/);
    await expect(endTurn(page)).toBeDisabled();
    await page.screenshot({ path: 'test-results/screens/tutorial-intro-390x844.png' });
    await next(page).click();

    // Round 1: only the highlighted drop works.
    await expect(coach(page)).toContainText(/Drag Spark Imp/);
    await expect(next(page)).toBeHidden();
    await expect(endTurn(page)).toBeDisabled();
    await expect(page.locator('.hand__slot--coach')).toHaveCount(2); // both Spark Imps
    await expect(page.locator('.coach-target')).toHaveCount(1);
    await page.screenshot({ path: 'test-results/screens/tutorial-drag-390x844.png' });
    await dragToCoachTarget(page, 'Spark Imp');
    await expect(page.getByRole('button', { name: 'Planned: Spark Imp. Tap to take back.' })).toBeVisible();

    await expect(coach(page)).toContainText(/End Turn/);
    await expect(endTurn(page)).toBeEnabled();
    await endTurn(page).click();
    await expect(coach(page)).toContainText(/reveal/i);
    await expect(next(page)).toBeHidden();
    await readStep(page, /Nobody blocked/);

    // Round 2: a second unit, then a spell on the planned unit.
    await expect(coach(page)).toContainText(/Round 2/);
    await expect(endTurn(page)).toBeDisabled();
    await dragToCoachTarget(page, 'Spark Imp');
    await expect(coach(page)).toContainText(/Drag Kindle/);
    await expect(page.locator('.hand__slot--coach')).toHaveCount(1);
    await page.screenshot({ path: 'test-results/screens/tutorial-spell-390x844.png' });
    await dragToCoachTarget(page, 'Kindle');
    await expect(page.getByRole('button', { name: /Kindle → Spark Imp/ })).toBeVisible();
    await expect(coach(page)).toContainText(/End Turn/);
    await endTurn(page).click();
    await expect(coach(page)).toContainText(/Militia/);
    await readStep(page, /Their Militia soaked/);

    // Round 3: an untargeted spell finishes the match.
    await expect(coach(page)).toContainText(/Fireball/);
    await dragToCoachTarget(page, 'Fireball');
    await expect(coach(page)).toContainText(/End Turn/);
    await endTurn(page).click();

    const result = page.getByRole('dialog', { name: 'Match result' });
    await expect(result.getByRole('heading')).toHaveText('Tutorial complete', { timeout: 30_000 });
    await expect(coach(page)).toBeHidden();
    await page.waitForTimeout(500); // let the result fade-in finish
    await page.screenshot({ path: 'test-results/screens/tutorial-complete-390x844.png' });
    await result.getByRole('button', { name: 'Back to menu' }).click();
    await expect(page.getByRole('main', { name: 'Main menu' })).toBeVisible();
    await expect(prompt).toBeHidden();

    // It was saved: after a reload the prompt stays away.
    await expect.poll(() => savedJson(page)).toMatch(/tutorialDone\\*":true/);
    await openMenu(page, '?speed=0.05');
    await expect(page.getByTestId('tutorial-prompt')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('wrong plays are refused, leaving early does not finish it, and Skip does', async ({ page }) => {
    const errors = watchErrors(page);
    await openTutorial(page);
    await readStep(page, /Welcome/);
    await readStep(page, /opposite them/);
    await next(page).click();
    await expect(coach(page)).toContainText(/Drag Spark Imp/);

    // Dropping the Imp somewhere else, or another card, plans nothing.
    const from = await grabPoint(page, 'Spark Imp');
    const lane = (await page
      .locator('[data-zone="player-lanes"] .lane-grid[data-lane="2"] .slot')
      .first()
      .boundingBox())!;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y - 30, { steps: 4 });
    await page.mouse.move(lane.x + lane.width / 2, lane.y + lane.height / 2 + LIFT, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: /^Planned:/ })).toHaveCount(0);
    await expect(coach(page)).toContainText(/Drag Spark Imp/);

    await page.getByRole('button', { name: 'Leave match' }).click();
    await expect(page.getByRole('main', { name: 'Main menu' })).toBeVisible();
    await expect(page.getByTestId('tutorial-prompt')).toBeVisible();

    await page.getByTestId('tutorial-prompt').getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByTestId('tutorial-prompt')).toBeHidden();
    await expect.poll(() => savedJson(page)).toMatch(/tutorialDone\\*":true/);
    // The menu button still replays it.
    await page.getByRole('button', { name: 'Tutorial', exact: true }).click();
    await expect(coach(page)).toContainText(/Welcome/);
    expect(errors).toEqual([]);
  });
});

test.describe('360x740', () => {
  test.use({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });

  test('the coach fits the narrowest screen without covering the hand or End Turn', async ({ page }) => {
    await openTutorial(page);
    await readStep(page, /Welcome/);
    await readStep(page, /opposite them/);
    await next(page).click();
    await expect(coach(page)).toContainText(/Drag Spark Imp/);
    const c = (await coach(page).boundingBox())!;
    const turn = (await endTurn(page).boundingBox())!;
    const hand = (await page.locator('[data-zone="hand"]').boundingBox())!;
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(360);
    expect(c.y + c.height).toBeLessThan(turn.y);
    expect(c.y + c.height).toBeLessThan(hand.y);
    await page.screenshot({ path: 'test-results/screens/tutorial-drag-360x740.png' });
  });
});
