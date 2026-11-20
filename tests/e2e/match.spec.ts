import { expect, test } from '@playwright/test';
import { keepHand, playOneCard, startMatch, watchErrors } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

test('plays a full match against Normal AI and reaches the result screen', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await startMatch(page, { seed: 11, difficulty: 'Normal' });
  await keepHand(page);

  const result = page.getByRole('dialog', { name: 'Match result' });
  const endTurn = page.getByRole('button', { name: 'End Turn' });
  let cardsPlayed = 0;

  for (let round = 1; round <= 8 && !(await result.isVisible()); round++) {
    for (let i = 0; i < 6 && (await playOneCard(page)); i++) cardsPlayed++;
    if (round === 2) await page.screenshot({ path: 'test-results/screens/planning-390x844.png' });
    await endTurn.click();
    await expect(page.locator('.end-turn:enabled').or(result)).toBeVisible({ timeout: 60_000 });
  }

  await expect(result).toBeVisible();
  await expect(result.getByRole('heading')).toHaveText(/Victory|Defeat|Draw/);
  expect(cardsPlayed).toBeGreaterThan(0);
  await page.waitForTimeout(500); // let the result fade-in finish before the screenshot
  await page.screenshot({ path: 'test-results/screens/result-390x844.png' });
  expect(errors).toEqual([]);
});

test('tapping a hand card shows its full rules text', async ({ page }) => {
  await startMatch(page, { seed: 3 });
  await keepHand(page);
  const card = page.locator('.hand__slot').first();
  const name = await card.locator('.card').getAttribute('aria-label');
  await card.click();
  const detail = page.getByRole('dialog', { name: name! });
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: 'Close' }).click();
  await expect(detail).toBeHidden();
});

test('a planned unit can be taken back before End Turn', async ({ page }) => {
  // Find a seed whose opening hand has a 1-mana card.
  let before = 0;
  let played = false;
  for (let seed = 5; seed < 25 && !played; seed++) {
    await startMatch(page, { seed });
    await keepHand(page);
    before = await page.locator('.hand__slot').count();
    played = await playOneCard(page);
  }
  expect(played).toBe(true);
  await expect(page.locator('.hand__slot')).toHaveCount(before - 1);
  const ghost = page.getByRole('button', { name: /^Planned:/ });
  if ((await ghost.count()) > 0) await ghost.first().click();
  else await page.locator('.queued__chip').first().click();
  await expect(page.locator('.hand__slot')).toHaveCount(before);
});
