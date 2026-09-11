import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('AegisOps AI — Visual Screenshot Generator', () => {
  const screenshotsDir = path.resolve(__dirname, '../../../docs/screenshots');

  test('Capture login page screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotsDir, '01-login-screen.png') });
  });

  test('Capture registration page screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotsDir, '02-register-screen.png') });
  });
});
