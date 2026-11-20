import { expect, test, type Page } from '@playwright/test';
import { keepHand, startMatch, watchErrors } from './helpers';
import { VIEWPORTS } from './viewports';

const LIFT = 70; // the drop point is this far above the finger (src/ui/Hand.tsx)

async function handNames(page: Page): Promise<string[]> {
  return page
    .locator('.hand__slot .card')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!));
}

/** Drags a hand card so that the drop point lands at (x, y). */
async function dragTo(page: Page, name: string, x: number, y: number, beforeDrop?: () => Promise<void>) {
  const card = page.locator('.hand__slot', { has: page.getByLabel(name, { exact: true }) }).first();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 20, { steps: 4 });
  await page.mouse.move(x, y + LIFT, { steps: 8 });
  await beforeDrop?.();
  await page.mouse.up();
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, deviceScaleFactor: 1 });

    test('near-miss drops snap to the closest slot, and Kindle can target a unit planned this turn', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const errors = watchErrors(page);
      // Find a seed whose opening hand (Steam Raiders) holds Spark Imp and Kindle.
      let found = false;
      for (let seed = 1; seed <= 40 && !found; seed++) {
        await startMatch(page, { seed, deck: 'Steam Raiders' });
        await keepHand(page);
        const names = await handNames(page);
        found = names.includes('Spark Imp') && names.includes('Kindle');
      }
      expect(found).toBe(true);

      // Round 1: pass, so round 2 has 2 mana for both cards.
      await page.getByRole('button', { name: 'End Turn' }).click();
      await expect(page.locator('.end-turn:enabled')).toBeVisible({ timeout: 30_000 });

      // Drop the unit in the gap just left of an empty slot: it snaps into a slot.
      const slot = page.locator('[data-zone="player-lanes"] .lane-grid[data-lane="1"] .slot').first();
      const s = (await slot.boundingBox())!;
      await dragTo(page, 'Spark Imp', s.x - 3, s.y + s.height / 2);
      const ghost = page.getByRole('button', { name: 'Planned: Spark Imp. Tap to take back.' });
      await expect(ghost).toBeVisible();

      // Aim Kindle just below the planned unit: the arrow locks on, and the spell targets it.
      const g = (await ghost.boundingBox())!;
      await dragTo(page, 'Kindle', g.x + g.width / 2, g.y + g.height + 12, async () => {
        await expect(page.locator('.drag-arrow--locked')).toBeVisible();
        await expect(ghost).toHaveClass(/drop--hover/);
        await page.screenshot({ path: `test-results/screens/targeting-${vp.width}x${vp.height}.png` });
      });
      await expect(page.getByRole('button', { name: /Kindle → Spark Imp/ })).toBeVisible();

      await page.getByRole('button', { name: 'End Turn' }).click();
      await expect(
        page.locator('.end-turn:enabled').or(page.getByRole('dialog', { name: 'Match result' })),
      ).toBeVisible({
        timeout: 30_000,
      });
      expect(errors).toEqual([]);
    });
  });
}
