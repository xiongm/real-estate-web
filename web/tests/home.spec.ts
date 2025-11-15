import { expect, test } from '@playwright/test';

test.describe('Home page', () => {
  test('links to admin dashboard', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /admin access/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /go to admin dashboard/i })).toBeVisible();
  });
});
