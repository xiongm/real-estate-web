import { expect, test } from '@playwright/test';

test.describe('Home page', () => {
  test('shows skeleton links', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /real estate signing — skeleton/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /signer demo/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /request signatures/i })).toBeVisible();
  });
});
