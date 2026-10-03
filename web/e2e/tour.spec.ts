import { test, expect } from '@playwright/test';
import pricing from '../public/config/pricing_config.json';

test.describe('Customer Guided Tour', () => {
  test.beforeEach(async ({ page }) => {
    // Fulfill pricing route so page is ready
    await page.route('**/api/admin/pricing*', (r) =>
      r.fulfill({
        json: {
          checkoutEnabled: true,
          pricing: {
            ...pricing,
            form_fields: { ...pricing.form_fields, requireCustomerName: false },
          },
        },
      })
    );
  });

  test('Session 1 shows tour, refresh does not repeat, session 2 shows tour, session 3 does not, and manual replay works without incrementing count', async ({
    page,
    context,
  }) => {
    // ----------------------------------------------------
    // 1. FIRST SESSION
    // ----------------------------------------------------
    await page.goto('/');

    // Wait for tour dialog to appear automatically on clean session
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Step 1: Upload document
    await expect(dialog.getByRole('heading', { name: 'Upload document', exact: true })).toBeVisible();
    await expect(
      dialog.getByText('Tap here to upload the document you want to print.')
    ).toBeVisible();

    // Verify localStorage has been incremented to 1 upon opening
    const countAfterOpen = await page.evaluate(() =>
      localStorage.getItem('quickprint:tour:autoShowCount')
    );
    expect(countAfterOpen).toBe('1');

    // Click Next -> Step 2
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByRole('heading', { name: 'Print settings', exact: true })).toBeVisible();
    await expect(
      dialog.getByText('Choose your copies, colour, and printing options.')
    ).toBeVisible();

    // Click Next -> Step 3
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByRole('heading', { name: 'Price', exact: true })).toBeVisible();
    await expect(dialog.getByText('Check your total before paying.')).toBeVisible();

    // Click Next -> Step 4
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByRole('heading', { name: 'Payment', exact: true })).toBeVisible();
    await expect(
      dialog.getByText('Pay securely. Printing starts after payment is verified.')
    ).toBeVisible();

    // Step 4 has "Finish" button
    await dialog.getByRole('button', { name: 'Finish' }).click();
    await expect(dialog).toHaveCount(0);

    // ----------------------------------------------------
    // 2. REFRESH IN SAME SESSION: DOES NOT REPEAT
    // ----------------------------------------------------
    await page.reload();
    await page.waitForTimeout(1000);
    await expect(dialog).toHaveCount(0);

    const countAfterRefresh = await page.evaluate(() =>
      localStorage.getItem('quickprint:tour:autoShowCount')
    );
    expect(countAfterRefresh).toBe('1');

    // ----------------------------------------------------
    // 3. SECOND SESSION (NEW TAB / SESSION STORAGE CLEARED)
    // ----------------------------------------------------
    const session2Page = await context.newPage();
    // Simulate new tab session with localStorage preserved from session 1
    await session2Page.addInitScript(() => {
      localStorage.setItem('quickprint:tour:autoShowCount', '1');
      sessionStorage.clear();
    });
    await session2Page.route('**/api/admin/pricing*', (r) =>
      r.fulfill({
        json: {
          checkoutEnabled: true,
          pricing,
        },
      })
    );

    await session2Page.goto('/');

    const dialog2 = session2Page.getByRole('dialog');
    await expect(dialog2).toBeVisible({ timeout: 10000 });
    await expect(dialog2.getByRole('heading', { name: 'Upload document', exact: true })).toBeVisible();

    // Verify localStorage has been incremented to 2 upon opening
    const countAfterSession2 = await session2Page.evaluate(() =>
      localStorage.getItem('quickprint:tour:autoShowCount')
    );
    expect(countAfterSession2).toBe('2');

    // Skipping counts as one display
    await dialog2.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(dialog2).toHaveCount(0);

    await session2Page.close();

    // ----------------------------------------------------
    // 4. THIRD SESSION: NEVER LAUNCHES AUTOMATICALLY
    // ----------------------------------------------------
    const session3Page = await context.newPage();
    await session3Page.addInitScript(() => {
      localStorage.setItem('quickprint:tour:autoShowCount', '2');
      sessionStorage.clear();
    });
    await session3Page.route('**/api/admin/pricing*', (r) =>
      r.fulfill({
        json: {
          checkoutEnabled: true,
          pricing,
        },
      })
    );

    await session3Page.goto('/');
    await session3Page.waitForTimeout(1000);
    const dialog3 = session3Page.getByRole('dialog');
    await expect(dialog3).toHaveCount(0);

    // ----------------------------------------------------
    // 5. MANUAL REPLAY ("HOW IT WORKS" BUTTON)
    // ----------------------------------------------------
    // Manual replay button must still be available after limit
    const howItWorksButton = session3Page.getByRole('button', { name: 'How it works' });
    await expect(howItWorksButton).toBeVisible();
    await howItWorksButton.click();

    // Tour opens manually
    await expect(dialog3).toBeVisible();
    await expect(dialog3.getByRole('heading', { name: 'Upload document', exact: true })).toBeVisible();

    // Manual replay must NOT increase the auto-show count
    const countAfterManual = await session3Page.evaluate(() =>
      localStorage.getItem('quickprint:tour:autoShowCount')
    );
    expect(countAfterManual).toBe('2');

    // Test Back button on manual replay
    await dialog3.getByRole('button', { name: 'Next' }).click();
    await expect(dialog3.getByRole('heading', { name: 'Print settings', exact: true })).toBeVisible();
    await dialog3.getByRole('button', { name: 'Back' }).click();
    await expect(dialog3.getByRole('heading', { name: 'Upload document', exact: true })).toBeVisible();

    // Test Escape key closes tour
    await session3Page.keyboard.press('Escape');
    await expect(dialog3).toHaveCount(0);

    await session3Page.close();
  });
});
