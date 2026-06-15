import { expect, test } from '@playwright/test';

test('landing page light mode visual check', async ({ page }) => {
  await page.goto('http://localhost:5173');

  await page.waitForLoadState('networkidle');

  await expect(page).toHaveScreenshot('landing-light-mode.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.03,
  });
});
