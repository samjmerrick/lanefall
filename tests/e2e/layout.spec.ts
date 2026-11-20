import { expect, test } from '@playwright/test';
import { VIEWPORTS } from './viewports';

for (const vp of VIEWPORTS) {
  test.describe(`match screen at ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

    test('has no horizontal overflow', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(e.message));

      await page.goto('./');
      await expect(page.getByRole('main', { name: 'Match' })).toBeVisible();

      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

      // Every zone, including the whole hand, sits inside the viewport.
      for (const zone of [
        'opponent-bar',
        'opponent-lanes',
        'lane-strip',
        'player-lanes',
        'player-bar',
        'hand',
      ]) {
        const box = await page.locator(`[data-zone="${zone}"]`).boundingBox();
        expect(box, zone).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
      }
      for (const card of await page.locator('.hand .card').all()) {
        const box = (await card.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      }

      // End Turn meets the 44 px minimum tap target.
      const endTurn = (await page.getByRole('button', { name: 'End Turn' }).boundingBox())!;
      expect(endTurn.height).toBeGreaterThanOrEqual(44);
      expect(endTurn.width).toBeGreaterThanOrEqual(44);

      await page.screenshot({ path: `test-results/screens/match-${vp.width}x${vp.height}.png` });
      expect(errors).toEqual([]);
    });
  });
}

test.describe('landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('shows the rotate notice', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByText('Rotate your phone')).toBeVisible();
    await expect(page.getByRole('main', { name: 'Match' })).toBeHidden();
  });
});
