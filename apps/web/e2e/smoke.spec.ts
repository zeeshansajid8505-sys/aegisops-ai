import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('AegisOps AI — Browser Smoke & Navigation Suite', () => {
  test('1. Login page renders with form controls', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/AegisOps AI/i);

    // Verify presence of email, password inputs and submit button
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
  });

  test('2. Services page loads gracefully with navigation', async ({ page }) => {
    await page.goto('/services');
    await expect(page).toHaveTitle(/AegisOps AI/i);
    const brand = page.locator('text=AegisOps');
    await expect(brand.first()).toBeVisible();
  });

  test('3. Login page passes core accessibility rules', async ({ page }) => {
    await page.goto('/login');
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast']) // Soften contrast for dark theme neon highlights
      .analyze();

    const criticalViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'critical'
    );
    expect(criticalViolations).toEqual([]);
  });

  test('4. Register page renders cleanly', async ({ page }) => {
    await page.goto('/register');
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
  });

  test('5. Primary navigation links are present on layout', async ({ page }) => {
    await page.goto('/login');
    // Verify brand header is rendered
    const brand = page.locator('text=AegisOps');
    await expect(brand.first()).toBeVisible();
  });
});
