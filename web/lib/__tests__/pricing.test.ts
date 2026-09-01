import assert from 'node:assert';
import { calculateOrderPrice } from '../pricing';
import { PricingConfig, Order } from '../../types';

// Mock initial shop pricing config
const initialPricing: PricingConfig = {
  a4_bw_per_page: 2.0,
  a4_bw_double_per_page: 3.5,
  a4_color_per_page: 10.0,
  a4_color_double_per_page: 18.0,
  a3_bw_per_page: 5.0,
  a3_color_per_page: 20.0,
  legal_bw_per_page: 3.0,
  legal_color_per_page: 15.0,
  photo_paper_per_page: 25.0,
  double_sided_multiplier: 1.0,
  addon_stapling: 5.0,
  addon_spiral_binding: 30.0,
  addon_lamination: 20.0,
  addon_hard_binding: 120.0,
  addon_soft_binding: 40.0,
  enabled_addons: {
    stapling: true,
    spiralBinding: true,
    lamination: true,
    hardBinding: true,
    softBinding: true,
  },
  currency: 'INR',
};

// Updated pricing config (e.g. shopkeeper increased rates next day)
const updatedPricing: PricingConfig = {
  ...initialPricing,
  a4_bw_per_page: 4.0, // Increased from 2.0 to 4.0
  a4_color_per_page: 20.0, // Increased from 10.0 to 20.0
  addon_spiral_binding: 50.0, // Increased from 30.0 to 50.0
};

console.log('--- Running Pricing Engine & Immutability Tests ---');

// Test 1: Calculation accuracy
const breakdown1 = calculateOrderPrice(10, {
  paperSize: 'A4',
  colorMode: 'BW',
  printSides: 'SINGLE',
  copies: 2,
  addOns: { spiralBinding: true },
}, initialPricing);

// 10 pages * 2.0 * 2 copies = 40.0 print subtotal
// Spiral binding = 30.0 * 2 copies = 60.0 add-ons
// Total = 100.0 INR
assert.strictEqual(breakdown1.printSubtotal, 40.0, 'Print subtotal should be 40.0');
assert.strictEqual(breakdown1.addOnsSubtotal, 60.0, 'Add-ons subtotal should be 60.0');
assert.strictEqual(breakdown1.totalAmount, 100.0, 'Total amount should be 100.0');
console.log('✅ Test 1 Passed: Order price calculation is accurate.');

// Test 2: Historical Pricing Snapshot Immutability
const historicOrder: Order = {
  id: 'ord_test_snapshot_1',
  order_number: 'QP-TEST1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  file_name: 'test_doc.pdf',
  storage_path: 'shop-documents/test.pdf',
  file_type: 'application/pdf',
  file_size_bytes: 1024,
  page_count: 10,
  paper_size: 'A4',
  color_mode: 'BW',
  print_sides: 'SINGLE',
  copies: 2,
  add_ons: { spiralBinding: true },
  per_page_rate: breakdown1.effectiveRatePerPage,
  print_subtotal: breakdown1.printSubtotal,
  addons_subtotal: breakdown1.addOnsSubtotal,
  total_amount: breakdown1.totalAmount,
  currency: 'INR',
  pricing_snapshot: initialPricing,
  payment_method: 'UPI',
  payment_status: 'VERIFIED',
  order_status: 'PRINTED',
};

// Recalculate using historical snapshot vs active updated pricing
const recalculatedWithSnapshot = calculateOrderPrice(
  historicOrder.page_count,
  {
    paperSize: historicOrder.paper_size,
    colorMode: historicOrder.color_mode,
    printSides: historicOrder.print_sides,
    copies: historicOrder.copies,
    addOns: historicOrder.add_ons,
  },
  historicOrder.pricing_snapshot
);

const recalculatedWithNewPricing = calculateOrderPrice(
  historicOrder.page_count,
  {
    paperSize: historicOrder.paper_size,
    colorMode: historicOrder.color_mode,
    printSides: historicOrder.print_sides,
    copies: historicOrder.copies,
    addOns: historicOrder.add_ons,
  },
  updatedPricing
);

assert.strictEqual(recalculatedWithSnapshot.totalAmount, historicOrder.total_amount, 'Snapshot total MUST equal original order total');
assert.strictEqual(recalculatedWithNewPricing.totalAmount, 180.0, 'New pricing total should reflect updated rates (180.0)');
assert.notStrictEqual(recalculatedWithSnapshot.totalAmount, recalculatedWithNewPricing.totalAmount, 'Historic snapshot total MUST remain immune to active pricing changes');

console.log('✅ Test 2 Passed: Historical pricing snapshot immutability verified!');
console.log('🎉 All Pricing Engine Tests Passed Successfully!\n');
