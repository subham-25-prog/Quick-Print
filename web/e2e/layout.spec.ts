import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import pricing from '../public/config/pricing_config.json';

for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 1280, height: 800 }]) {
  test(`checkout and preview stay usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const shopName = 'Shop'.repeat(20);
    await page.route('**/api/admin/pricing*', route => route.fulfill({ json: {
      checkoutEnabled: true,
      pricing: { ...pricing, shop_name: shopName, form_fields: { ...pricing.form_fields, requireCustomerName: false, requireCustomerPhone: false } },
    } }));
    await page.route('**/api/upload', route => route.fulfill({ json: { success: true, fileInfo: {
      uploadId: '00000000-0000-4000-8000-000000000003', uploadToken: 'a'.repeat(64),
      fileName: 'document.pdf', fileType: 'application/pdf', fileSizeBytes: 100, pageCount: 1,
    } } }));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: shopName, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const brand = await page.locator('header a[href="/"]').boundingBox();
    const controls = await page.getByTitle('Admin Portal').boundingBox();
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(controls!.x);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const content = await page.locator('main').boundingBox();
    const preview = page.getByRole('button', { name: 'Preview', exact: false });
    const previewBox = await preview.boundingBox();
    expect(content!.y + content!.height).toBeLessThanOrEqual(previewBox!.y);

    const pdf = await PDFDocument.create();
    pdf.addPage();
    await page.locator('input[type=file]').setInputFiles({ name: 'document.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
    await preview.click();
    const dialog = page.getByRole('dialog', { name: 'Print preview' });
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Confirm & Pay', exact: false }).filter({ visible: true });
    const confirmBox = await confirm.boundingBox();
    expect(confirmBox!.y).toBeGreaterThanOrEqual(0);
    expect(confirmBox!.y + confirmBox!.height).toBeLessThanOrEqual(viewport.height);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/preview-${viewport.width}.png` });
    if (viewport.width < 768) {
      await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
      const copies = dialog.getByRole('spinbutton', { name: 'Copies', exact: true });
      await copies.fill('9999999999999999999999');
      await expect(copies).toHaveValue('100');
      await copies.fill('-10');
      await expect(copies).toHaveValue('1');
      const settingsConfirm = await confirm.boundingBox();
      expect(settingsConfirm!.y + settingsConfirm!.height).toBeLessThanOrEqual(viewport.height);
    }
    await confirm.click();
    await expect(page.getByRole('heading', { name: 'Secure payment' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close payment options' })).toBeInViewport();
    await page.getByRole('button', { name: 'Pay Online', exact: false }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Pay Online', exact: false })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
