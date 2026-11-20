import { expect, type Page } from '@playwright/test';

/** Collects console errors and page errors for the test to assert on. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function startMatch(
  page: Page,
  opts: { seed?: number; speed?: number; difficulty?: 'Easy' | 'Normal' } = {},
) {
  await page.goto(`./?seed=${opts.seed ?? 7}&speed=${opts.speed ?? 0.05}`);
  if (opts.difficulty) await page.getByRole('radio', { name: opts.difficulty }).click();
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.getByRole('main', { name: 'Match' })).toBeVisible();
}

export async function keepHand(page: Page) {
  await page.getByRole('button', { name: /Keep hand|Replace/ }).click();
  await expect(page.getByRole('dialog', { name: 'Mulligan' })).toBeHidden();
}

const LIFT = 70; // the dragged card is drawn this far above the finger (src/ui/Hand.tsx)

/** Drags the first playable hand card onto its first valid target. Returns false if none could be played. */
export async function playOneCard(page: Page): Promise<boolean> {
  const card = page.locator('.hand__slot--playable').first();
  if ((await card.count()) === 0) return false;
  const box = (await card.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 30, { steps: 4 });
  const target = page.locator('.drop--valid').first();
  if ((await target.count()) === 0) {
    await page.mouse.up();
    return false;
  }
  const t = (await target.boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2 + LIFT, { steps: 6 });
  await page.mouse.up();
  return true;
}
