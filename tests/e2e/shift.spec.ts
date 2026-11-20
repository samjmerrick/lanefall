import { expect, test, type Page } from '@playwright/test';
import { keepHand, loadProfile, newProfile, startMatch, watchErrors } from './helpers';
import { VIEWPORTS } from './viewports';

const LIFT = 70; // the drop point is this far above the finger (src/ui/Hand.tsx)

// A Tide/Grove deck with three Mist Sprites (Shift, cost 1), so a Shift unit is on the board by round 2.
// With seed 129 (lanes Bulwark, Fortress, Open Field) the opening hand holds one and it survives round 1.
const SHIFT_DECK = [
  ...Array(3).fill('tide-tidecaller'),
  ...Array(3).fill('tide-pearl-diver'),
  ...Array(3).fill('tide-mist-sprite'),
  ...Array(3).fill('tide-tidal-knight'),
  ...Array(3).fill('tide-insight'),
  ...Array(3).fill('grove-druid-initiate'),
  ...Array(3).fill('grove-mossback'),
  ...Array(3).fill('grove-wolf-pack'),
  ...Array(3).fill('grove-elder-stag'),
  ...Array(3).fill('grove-ironbark'),
] as string[];

const slotOf = (page: Page, lane: number, slot: number) =>
  page.locator(`[data-zone="player-lanes"] .lane-grid[data-lane="${lane}"] .slot[data-slot="${slot}"]`);

/** Drags the hand card called `name` so the drop point lands at (x, y). */
async function dragCard(page: Page, name: string, x: number, y: number) {
  const card = page.locator('.hand__slot', { has: page.getByLabel(name, { exact: true }) }).first();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 20, { steps: 4 });
  await page.mouse.move(x, y + LIFT, { steps: 8 });
  await page.mouse.up();
}

/** Drags the shiftable unit so that the drop point lands on `to`; `beforeDrop` runs while it is held. */
async function dragUnit(page: Page, to: { x: number; y: number }, beforeDrop?: () => Promise<void>) {
  const u = (await page.locator('.token--shiftable').boundingBox())!;
  await page.mouse.move(u.x + u.width / 2, u.y + u.height / 2);
  await page.mouse.down();
  await page.mouse.move(u.x + u.width / 2, u.y - 20, { steps: 4 });
  await page.mouse.move(to.x, to.y + LIFT, { steps: 8 });
  await beforeDrop?.();
  await page.mouse.up();
}

async function centre(page: Page, lane: number, slot: number) {
  const b = (await slotOf(page, lane, slot).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function endTurn(page: Page) {
  await page.getByRole('button', { name: 'End Turn' }).click();
  await expect(page.locator('.end-turn:enabled')).toBeVisible({ timeout: 30_000 });
}

/** Opens a match with the Shift deck, plays Mist Sprite into lane 1 and ends round 1. */
async function sproutShifter(page: Page) {
  const profile = newProfile();
  profile.decks = [{ id: 'd1', name: 'Shifters', cover: 'tide-mist-sprite', cards: SHIFT_DECK }];
  await loadProfile(page, profile, '?seed=129&speed=0.05');
  await startMatch(page, { seed: 129, deck: 'Shifters' });
  await keepHand(page);
  const c = await centre(page, 1, 0);
  await dragCard(page, 'Mist Sprite', c.x, c.y);
  await expect(page.getByRole('button', { name: 'Planned: Mist Sprite. Tap to take back.' })).toBeVisible();
  await endTurn(page);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, deviceScaleFactor: 1 });

    test('a Shift unit is dragged to another lane, planned until End Turn, and moves on reveal', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const errors = watchErrors(page);
      await sproutShifter(page);

      await expect(page.locator('.token--shiftable[data-shift="ready"]')).toHaveCount(1);
      await expect(page.getByRole('status')).toContainText('Drag a Shift unit');

      // While dragging, the legal slots light up and the one under the finger is the hover target.
      await dragUnit(page, await centre(page, 0, 0), async () => {
        await expect(slotOf(page, 0, 0)).toHaveClass(/drop--hover/);
        await expect(slotOf(page, 2, 1)).toHaveClass(/drop--valid/);
        // Its own lane is not a legal target.
        await expect(slotOf(page, 1, 1)).toHaveClass(/drop--dim/);
      });

      // Planned: outline in the destination, marker on the source, a chip to undo it.
      await expect(
        page.getByRole('button', { name: /Planned: Mist Sprite shifts to the left lane/ }),
      ).toBeVisible();
      await expect(page.locator('.token[data-shift="planned"]')).toHaveCount(1);
      await expect(page.getByRole('button', { name: /Shift Mist Sprite → Left/ })).toBeVisible();
      await page.screenshot({ path: `test-results/screens/shift-planned-${vp.width}x${vp.height}.png` });
      // It cannot be dragged again once planned.
      await expect(page.locator('.token--shiftable')).toHaveCount(0);

      await endTurn(page);
      // (With this seed the Sprite survives the round in lane 0.)
      await expect(slotOf(page, 0, 0).locator('.token[data-uid]')).toHaveCount(1);
      await expect(slotOf(page, 1, 0).locator('.token[data-uid]')).toHaveCount(0);
      // Once per match: the unit is no longer draggable.
      await expect(page.locator('.token--shiftable')).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    test('a planned Shift can be taken back', async ({ page }) => {
      test.setTimeout(120_000);
      await sproutShifter(page);
      await dragUnit(page, await centre(page, 2, 0));
      await page.getByRole('button', { name: /Shift Mist Sprite → Right/ }).click();
      await expect(page.locator('.token[data-shift="planned"]')).toHaveCount(0);
      await expect(page.locator('.token--shiftable')).toHaveCount(1);
    });
  });
}
