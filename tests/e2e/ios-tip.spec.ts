import { expect, test } from '@playwright/test';
import { openMenu, savedJson, watchErrors } from './helpers';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

test.describe('iOS home-screen tip', () => {
  test.use({
    userAgent: IPHONE_UA,
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });

  test('shows once, can be dismissed, and stays dismissed after a reload', async ({ page }) => {
    const errors = watchErrors(page);
    await openMenu(page, '?seed=7');
    const tip = page.getByTestId('ios-tip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Add to Home Screen');
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    // The tip must not cover the last menu button.
    const settings = (await page.getByRole('button', { name: 'Settings', exact: true }).boundingBox())!;
    const tipBox = (await tip.boundingBox())!;
    expect(settings.y + settings.height).toBeLessThanOrEqual(tipBox.y);
    await page.screenshot({ path: 'test-results/screens/menu-ios-tip-360x740.png' });

    await tip.getByRole('button', { name: 'Got it' }).click();
    await expect(tip).toBeHidden();
    await expect.poll(() => savedJson(page)).toContain('iosTipSeen\\":true');

    await page.reload();
    await expect(page.getByRole('main', { name: 'Main menu' })).toBeVisible();
    await expect(page.getByTestId('ios-tip')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test('is not shown on a desktop browser', async ({ page }) => {
  await openMenu(page, '?seed=7');
  await expect(page.getByTestId('ios-tip')).toHaveCount(0);
});
