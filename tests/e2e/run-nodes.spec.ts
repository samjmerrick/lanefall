import { expect, test, type Page } from '@playwright/test';
import type { RunChoice } from '../../src/run/schema';
import { exportSaveCode } from '../../src/save/code';
import { newProfile } from '../../src/save/profile';
import fixture from '../fixtures/run-paths.json' with { type: 'json' };
import { openMenu, watchErrors } from './helpers';
import { VIEWPORTS } from './viewports';

/** Choice lists that walk seed 7 to each node type (checked by tests/unit/run-paths.test.ts). */
const { config } = fixture;
const paths = fixture.paths as Record<keyof typeof fixture.paths, RunChoice[]>;

async function loadRun(page: Page, choices: RunChoice[]) {
  const profile = newProfile();
  profile.activeRun = { config, choices, match: null };
  const code = await exportSaveCode(profile);
  await openMenu(page, '?speed=0.05');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('textbox', { name: 'Paste save code' }).fill(code);
  await page.getByRole('button', { name: 'Paste save code' }).click();
  await page.getByRole('button', { name: 'Replace my save with this code' }).click();
  await page.getByRole('button', { name: /Continue run/ }).click();
  await expect(page.getByRole('main', { name: 'Run' })).toBeVisible();
}

async function noOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

const NODES = [
  ['reward', 'Reward'],
  ['shop', 'Shop'],
  ['rest', 'Rest'],
  ['treasure', 'Treasure'],
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

    test('reward, shop, rest and treasure screens fit', async ({ page }) => {
      const errors = watchErrors(page);
      for (const [kind, region] of NODES) {
        await loadRun(page, paths[kind]);
        await expect(page.getByRole('region', { name: region })).toBeVisible();
        await noOverflow(page);
        await page.screenshot({
          path: `test-results/screens/run-${kind}-${vp.width}x${vp.height}.png`,
          fullPage: true,
        });
      }
      expect(errors).toEqual([]);
    });
  });
}

test.describe('nodes', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a reward card joins the deck', async ({ page }) => {
    await loadRun(page, paths.reward);
    const reward = page.getByRole('region', { name: 'Reward' });
    await reward
      .getByRole('button', { name: /^Take / })
      .first()
      .click();
    await expect(page.getByRole('button', { name: 'Deck, 13 cards' })).toBeVisible();
    await expect(page.getByLabel('Map')).toBeVisible();
  });

  test('the shop sells cards and removes one card', async ({ page }) => {
    await loadRun(page, paths.shop);
    const shop = page.getByRole('region', { name: 'Shop' });
    const gold = Number((await page.getByLabel(/^Gold/).textContent())!.replace(/\D/g, ''));
    const affordable = shop.locator('.grid-card:not(.grid-card--locked)');
    if ((await affordable.count()) > 0) {
      await affordable.first().click();
      await expect(page.getByRole('button', { name: 'Deck, 13 cards' })).toBeVisible();
      await expect(page.getByLabel(/^Gold/)).not.toHaveText(`● ${gold}`);
    }
    const remove = shop.getByRole('button', { name: /Remove a card/ });
    if (await remove.isEnabled()) {
      const size = Number(
        (await page.getByRole('button', { name: /^Deck,/ }).getAttribute('aria-label'))!.replace(/\D/g, ''),
      );
      await remove.click();
      await page.getByRole('dialog', { name: 'Remove a card' }).getByRole('button').nth(1).click();
      await expect(page.getByRole('button', { name: `Deck, ${size - 1} cards` })).toBeVisible();
      await expect(shop.getByRole('button', { name: 'Card removed' })).toBeDisabled();
    }
    await shop.getByRole('button', { name: 'Leave shop' }).click();
    await expect(page.getByLabel('Map')).toBeVisible();
  });

  test('resting restores a Heart', async ({ page }) => {
    await loadRun(page, paths.restAfterLoss); // lost the first fight, then walked to a rest
    await expect(page.getByLabel('Hearts 2 of 3')).toBeVisible();
    await page.getByRole('region', { name: 'Rest' }).getByRole('button', { name: 'Restore 1 Heart' }).click();
    await expect(page.getByLabel('Hearts 3 of 3')).toBeVisible();
  });
});
