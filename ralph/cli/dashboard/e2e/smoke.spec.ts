import { expect, test } from '@playwright/test';

test('dashboard renders with real server', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Aloop Dashboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Views' })).toBeVisible();
});
