import { expect, test } from '@playwright/test';
import pricing from '../public/config/pricing_config.json';

test('printers refresh automatically; switches wait for confirmation and failed switches keep the selection', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let selected = 'Printer A';
  let applied = 'Printer A';
  let failSwitch = false;
  let secondStatus = 'ONLINE';
  let thirdConnected = false;
  await page.route('**/api/admin/auth', (route) => route.fulfill({ json: { authenticated: true } }));
  await page.route('**/api/admin/db-status', (route) => route.fulfill({ json: { connected: true, agentOnline: true } }));
  await page.route('**/api/admin/pricing', (route) => route.fulfill({ json: { pricing: { ...pricing, selected_printer: selected } } }));
  await page.route('**/api/admin/printers', async (route) => {
    if (route.request().method() === 'POST') {
      if (failSwitch) return route.fulfill({ status: 500, json: { error: 'Selection could not be saved' } });
      selected = route.request().postDataJSON().printerName;
      return route.fulfill({ json: { success: true, activePrinter: selected } });
    }
    return route.fulfill({ json: {
      activePrinter: selected, appliedPrinter: applied, selectionPending: selected !== applied,
      agentOnline: true, agentMode: 'sandbox',
      printers: [
        { name: 'Printer A', status: 'ONLINE', is_selected: selected === 'Printer A' },
        { name: 'Printer B', status: secondStatus, is_selected: selected === 'Printer B' },
        ...(thirdConnected ? [{ name: 'Printer C', status: 'ONLINE', is_selected: false }] : []),
      ],
    } });
  });
  await page.goto('/admin/printing');
  const selection = page.getByRole('combobox', { name: 'Choose from detected printers' });
  await expect(selection).toHaveValue('Printer A');
  await page.getByRole('button', { name: 'Use Printer B', exact: true }).click();
  await expect(selection).toHaveValue('Printer B');
  await expect(page.getByText('Selection saved. Waiting for the print agent to confirm it.')).toBeVisible();
  applied = 'Printer B';
  thirdConnected = true;
  secondStatus = 'OFFLINE';
  await expect(page.getByRole('button', { name: 'Use Printer C', exact: true })).toBeVisible({ timeout: 12000 });
  await expect(page.getByText('Selection saved. Waiting for the print agent to confirm it.')).toHaveCount(0);
  await expect(page.getByText('OFFLINE', { exact: true })).toBeVisible();
  failSwitch = true;
  await page.getByRole('button', { name: 'Use Printer A', exact: true }).click();
  await expect(page.getByText('Selection could not be saved')).toBeVisible();
  await expect(selection).toHaveValue('Printer B');
  await expect(page.getByText('Simulation mode:', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/printer-selection.png', fullPage: true });
});
