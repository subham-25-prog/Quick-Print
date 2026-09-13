import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

async function main() {
  const filePath = process.argv[2] || resolve(root, 'shop-intake.json');

  if (!existsSync(filePath)) {
    console.error(`Error: Intake file not found at ${filePath}`);
    console.error(`Usage: node scripts/apply-shop-intake.mjs [path-to-intake.json]`);
    process.exit(1);
  }

  const raw = await readFile(filePath, 'utf8');
  let intake;
  try {
    intake = JSON.parse(raw);
  } catch (err) {
    console.error('Error: Failed to parse intake JSON file:', err.message);
    process.exit(1);
  }

  console.log(`\n📦 Applying Shop Intake Configuration for: ${intake.shop_name || 'New Shop'}...`);

  // 1. Update shop.config.json
  const shopConfigPath = resolve(root, 'shop.config.json');
  let currentConfig = {};
  if (existsSync(shopConfigPath)) {
    try {
      currentConfig = JSON.parse(await readFile(shopConfigPath, 'utf8'));
    } catch {}
  }

  const updatedConfig = {
    ...currentConfig,
    shop_name: intake.shop_name || currentConfig.shop_name || '',
    shop_upi_id: intake.shop_upi_id || currentConfig.shop_upi_id || '',
    shop_upi_name: intake.shop_upi_name || currentConfig.shop_upi_name || '',
    shop_phone: intake.shop_phone || currentConfig.shop_phone || '',
    shop_address: intake.shop_address || currentConfig.shop_address || '',
    currency: intake.currency || currentConfig.currency || 'INR',

    // Per page rates
    a4_bw_per_page: Number(intake.a4_bw_per_page ?? currentConfig.a4_bw_per_page ?? 2.5),
    a4_bw_double_per_page: Number(intake.a4_bw_double_per_page ?? currentConfig.a4_bw_double_per_page ?? 3),
    a4_color_per_page: Number(intake.a4_color_per_page ?? currentConfig.a4_color_per_page ?? 10),
    a4_color_double_per_page: Number(intake.a4_color_double_per_page ?? currentConfig.a4_color_double_per_page ?? 18),

    a3_bw_per_page: Number(intake.a3_bw_per_page ?? currentConfig.a3_bw_per_page ?? 5),
    a3_bw_double_per_page: Number(intake.a3_bw_double_per_page ?? currentConfig.a3_bw_double_per_page ?? 8),
    a3_color_per_page: Number(intake.a3_color_per_page ?? currentConfig.a3_color_per_page ?? 20),
    a3_color_double_per_page: Number(intake.a3_color_double_per_page ?? currentConfig.a3_color_double_per_page ?? 35),

    legal_bw_per_page: Number(intake.legal_bw_per_page ?? currentConfig.legal_bw_per_page ?? 3),
    legal_bw_double_per_page: Number(intake.legal_bw_double_per_page ?? currentConfig.legal_bw_double_per_page ?? 5),
    legal_color_per_page: Number(intake.legal_color_per_page ?? currentConfig.legal_color_per_page ?? 12),
    legal_color_double_per_page: Number(intake.legal_color_double_per_page ?? currentConfig.legal_color_double_per_page ?? 22),

    photo_paper_per_page: Number(intake.photo_paper_per_page ?? currentConfig.photo_paper_per_page ?? 25),
    photo_bw_per_page: Number(intake.photo_bw_per_page ?? currentConfig.photo_bw_per_page ?? 15),
    photo_bw_double_per_page: Number(intake.photo_bw_double_per_page ?? currentConfig.photo_bw_double_per_page ?? 25),
    photo_color_per_page: Number(intake.photo_color_per_page ?? currentConfig.photo_color_per_page ?? 25),
    photo_color_double_per_page: Number(intake.photo_color_double_per_page ?? currentConfig.photo_color_double_per_page ?? 45),

    double_sided_multiplier: Number(intake.double_sided_multiplier ?? currentConfig.double_sided_multiplier ?? 1),

    // Addons
    addon_stapling: Number(intake.addon_stapling ?? currentConfig.addon_stapling ?? 5),
    addon_spiral_binding: Number(intake.addon_spiral_binding ?? currentConfig.addon_spiral_binding ?? 30),
    addon_lamination: Number(intake.addon_lamination ?? currentConfig.addon_lamination ?? 20),
    addon_hard_binding: Number(intake.addon_hard_binding ?? currentConfig.addon_hard_binding ?? 120),
    addon_soft_binding: Number(intake.addon_soft_binding ?? currentConfig.addon_soft_binding ?? 40),

    enabled_papers: {
      a4: intake.enabled_papers?.a4 ?? currentConfig.enabled_papers?.a4 ?? true,
      a3: intake.enabled_papers?.a3 ?? currentConfig.enabled_papers?.a3 ?? false,
      legal: intake.enabled_papers?.legal ?? currentConfig.enabled_papers?.legal ?? false,
      photo: intake.enabled_papers?.photo ?? currentConfig.enabled_papers?.photo ?? false,
    },

    enabled_addons: {
      stapling: intake.enabled_addons?.stapling ?? currentConfig.enabled_addons?.stapling ?? false,
      spiralBinding: intake.enabled_addons?.spiralBinding ?? currentConfig.enabled_addons?.spiralBinding ?? false,
      lamination: intake.enabled_addons?.lamination ?? currentConfig.enabled_addons?.lamination ?? false,
      hardBinding: intake.enabled_addons?.hardBinding ?? currentConfig.enabled_addons?.hardBinding ?? false,
      softBinding: intake.enabled_addons?.softBinding ?? currentConfig.enabled_addons?.softBinding ?? false,
    },

    form_fields: {
      announcementText: intake.form_fields?.announcementText ?? currentConfig.form_fields?.announcementText ?? '',
      showCustomerName: intake.form_fields?.showCustomerName ?? currentConfig.form_fields?.showCustomerName ?? true,
      requireCustomerName: intake.form_fields?.requireCustomerName ?? currentConfig.form_fields?.requireCustomerName ?? true,
      showCustomerPhone: intake.form_fields?.showCustomerPhone ?? currentConfig.form_fields?.showCustomerPhone ?? false,
      requireCustomerPhone: intake.form_fields?.requireCustomerPhone ?? currentConfig.form_fields?.requireCustomerPhone ?? false,
      allowCashPayment: intake.form_fields?.allowCashPayment ?? currentConfig.form_fields?.allowCashPayment ?? true,
      allowUpiPayment: intake.form_fields?.allowUpiPayment ?? currentConfig.form_fields?.allowUpiPayment ?? true,
      allowColorPrinting: intake.form_fields?.allowColorPrinting ?? currentConfig.form_fields?.allowColorPrinting ?? true,
      allowDoubleSided: intake.form_fields?.allowDoubleSided ?? currentConfig.form_fields?.allowDoubleSided ?? true,
      enableNotes: intake.form_fields?.enableNotes ?? currentConfig.form_fields?.enableNotes ?? true,
      autoApproveUpiOrders: intake.form_fields?.autoApproveUpiOrders ?? currentConfig.form_fields?.autoApproveUpiOrders ?? false,
      minOrderAmount: Number(intake.form_fields?.minOrderAmount ?? currentConfig.form_fields?.minOrderAmount ?? 0),
      urgentFee: Number(intake.form_fields?.urgentFee ?? currentConfig.form_fields?.urgentFee ?? 0),
    }
  };

  await writeFile(shopConfigPath, JSON.stringify(updatedConfig, null, 2) + '\n');
  console.log(`✅ Updated: shop.config.json`);

  // 2. Update print-agent/.env if present
  const printAgentEnvPath = resolve(root, 'print-agent/.env');
  if (existsSync(printAgentEnvPath) && intake.printer_name) {
    let agentEnv = await readFile(printAgentEnvPath, 'utf8');
    if (agentEnv.includes('PRINTER_NAME=')) {
      agentEnv = agentEnv.replace(/PRINTER_NAME=.*/g, `PRINTER_NAME=${intake.printer_name}`);
    } else {
      agentEnv += `\nPRINTER_NAME=${intake.printer_name}`;
    }
    if (intake.simulate_print !== undefined) {
      agentEnv = agentEnv.replace(/SIMULATE_PRINT=.*/g, `SIMULATE_PRINT=${intake.simulate_print}`);
    }
    await writeFile(printAgentEnvPath, agentEnv);
    console.log(`✅ Updated: print-agent/.env (PRINTER_NAME="${intake.printer_name}")`);
  }

  console.log(`\n🎉 Success! Shop configuration applied successfully.`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
