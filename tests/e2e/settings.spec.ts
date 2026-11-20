import { expect, test } from '@playwright/test';
import { openMenu, savedJson, watchErrors } from './helpers';

test('Play toggles are switches that persist across a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await openMenu(page, '?seed=7');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const names = ['Fast animations', 'Reduce motion', 'Sound', 'Haptics'];
  for (const name of names) {
    const sw = page.getByRole('switch', { name: new RegExp(`^${name}`) });
    await expect(sw).toBeVisible();
    expect((await sw.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole('switch', { name: /^Sound/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: /^Fast animations/ })).toHaveAttribute(
    'aria-checked',
    'false',
  );

  await page.getByRole('switch', { name: /^Reduce motion/ }).click();
  await page.getByRole('switch', { name: /^Sound/ }).click();
  await expect(page.locator('html')).toHaveClass(/reduce-motion/);
  await expect(page.getByRole('switch', { name: /^Sound/ })).toHaveAttribute('aria-checked', 'false');

  await expect.poll(() => savedJson(page)).toContain('sound\\":false');
  await page.reload();
  await expect(page.getByRole('main', { name: 'Main menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('switch', { name: /^Reduce motion/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: /^Sound/ })).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('html')).toHaveClass(/reduce-motion/);
  expect(errors).toEqual([]);
});
