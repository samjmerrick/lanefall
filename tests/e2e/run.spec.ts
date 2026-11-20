import { expect, test, type Page } from '@playwright/test';
import { keepHand, openMenu, playOneCard, savedJson, watchErrors } from './helpers';
import { VIEWPORTS } from './viewports';

async function noOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

async function beginRun(page: Page, seed = 7, hero = 'Pyra') {
  await openMenu(page, `?seed=${seed}&speed=0.05`);
  await page.getByRole('button', { name: 'New run' }).click();
  await expect(page.getByRole('main', { name: 'New run' })).toBeVisible();
  await page.getByRole('radio', { name: new RegExp(hero) }).click();
  await page.getByRole('button', { name: 'Begin run' }).click();
  await expect(page.getByRole('main', { name: 'Run' })).toBeVisible();
}

/** Clicks the first node the player can move to. */
async function step(page: Page) {
  await page.locator('.map-node--next').first().click();
}

test.describe('run', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

  test('a run match closed mid-match resumes where it was, then the run can be finished early', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await beginRun(page);
    await expect(page.getByLabel('Hearts 3 of 3')).toBeVisible();
    await page.screenshot({ path: 'test-results/screens/run-map-390x844.png' });

    await step(page); // row 1 is always fights
    const encounter = page.getByRole('region', { name: 'Encounter' });
    await expect(encounter).toBeVisible();
    await page.screenshot({ path: 'test-results/screens/run-encounter-390x844.png' });
    await encounter.getByRole('button', { name: 'Fight' }).click();
    await expect(page.getByRole('main', { name: 'Match' })).toBeVisible();
    await keepHand(page);

    // Play one round, then close the page mid-match.
    await playOneCard(page);
    await page.getByRole('button', { name: 'End Turn' }).click();
    await expect(page.locator('.hero-bar__round')).toHaveText('R2/8', { timeout: 30_000 });
    await expect(page.locator('.end-turn:enabled')).toBeVisible();
    const hand = await page
      .locator('.hand .card')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    const hpLabels = () =>
      page.locator('.hero-bar__hp').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    const hp = await hpLabels();
    await expect.poll(() => savedJson(page)).toContain('\\"round\\":2');

    await page.reload();
    await expect(page.getByRole('main', { name: 'Main menu' })).toBeVisible();
    await page.getByRole('button', { name: /Continue run · Pyra/ }).click();
    await expect(page.getByRole('main', { name: 'Match' })).toBeVisible();
    await expect(page.locator('.hero-bar__round')).toHaveText('R2/8');
    expect(
      await page.locator('.hand .card').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))),
    ).toEqual(hand);
    expect(await hpLabels()).toEqual(hp);

    // Finish the match.
    const result = page.getByRole('dialog', { name: 'Match result' });
    for (let round = 2; round <= 8 && !(await result.isVisible()); round++) {
      for (let i = 0; i < 6 && (await playOneCard(page)); i++);
      await page.getByRole('button', { name: 'End Turn' }).click();
      await expect(page.locator('.end-turn:enabled').or(result)).toBeVisible({ timeout: 30_000 });
    }
    await expect(result).toBeVisible();
    const won = (await result.getByRole('heading').textContent()) === 'Victory';
    await result.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('main', { name: 'Run' })).toBeVisible();
    if (won) {
      const reward = page.getByRole('region', { name: 'Reward' });
      await expect(reward).toBeVisible();
      await page.screenshot({ path: 'test-results/screens/run-reward-390x844.png' });
      await reward
        .getByRole('button', { name: /^Take / })
        .first()
        .click();
      await expect(page.getByRole('button', { name: 'Deck, 13 cards' })).toBeVisible();
    } else {
      await expect(page.getByLabel('Hearts 2 of 3')).toBeVisible();
    }

    // Abandon from the map: the summary shows the seed, and the menu offers a new run.
    await page.getByRole('button', { name: 'Abandon run' }).click();
    await page.getByRole('dialog', { name: 'Abandon run?' }).getByRole('button', { name: 'Abandon' }).click();
    await expect(page.getByRole('main', { name: 'Run summary' })).toBeVisible();
    await expect(page.getByTestId('run-seed')).toHaveText('7');
    await expect(page.getByText('Run abandoned')).toBeVisible();
    await page.getByRole('button', { name: 'Back to menu' }).click();
    await expect(page.getByRole('button', { name: 'New run' })).toBeVisible();
    await expect.poll(() => savedJson(page)).toContain('\\"activeRun\\":null');
    expect(errors).toEqual([]);
  });

  test('the run survives a reload on the map', async ({ page }) => {
    await beginRun(page, 21, 'Aldric');
    const nodes = await page.locator('.map-node').count();
    await page.reload();
    await page.getByRole('button', { name: /Continue run · Aldric/ }).click();
    await expect(page.getByRole('main', { name: 'Run' })).toBeVisible();
    await expect(page.locator('.map-node')).toHaveCount(nodes);
    await page.getByRole('button', { name: 'Deck, 12 cards' }).click();
    await expect(page.getByRole('dialog', { name: 'Deck · 12 cards' })).toBeVisible();
  });
});

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

    test('run screens have no horizontal overflow', async ({ page }) => {
      const errors = watchErrors(page);
      await openMenu(page, '?seed=7');
      await page.getByRole('button', { name: 'New run' }).click();
      await noOverflow(page);
      await page.screenshot({ path: `test-results/screens/run-start-${vp.width}x${vp.height}.png` });
      await page.getByRole('button', { name: 'Begin run' }).click();
      await noOverflow(page);
      await page.screenshot({
        path: `test-results/screens/run-map-${vp.width}x${vp.height}.png`,
        fullPage: true,
      });
      await page.getByRole('button', { name: /^Relics/ }).click();
      await noOverflow(page);
      await page.screenshot({ path: `test-results/screens/run-relics-${vp.width}x${vp.height}.png` });
      await page.getByRole('button', { name: 'Close' }).click();
      await step(page);
      await noOverflow(page);
      await page.screenshot({ path: `test-results/screens/run-encounter-${vp.width}x${vp.height}.png` });
      await page.getByRole('button', { name: 'Back to menu' }).click();
      await expect(page.getByRole('button', { name: /Continue run/ })).toBeVisible();
      await page.screenshot({ path: `test-results/screens/menu-run-${vp.width}x${vp.height}.png` });
      expect(errors).toEqual([]);
    });
  });
}
