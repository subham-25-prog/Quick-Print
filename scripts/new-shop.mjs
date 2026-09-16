import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);

function getArg(key) {
  const index = args.indexOf(`--${key}`);
  return index !== -1 ? args[index + 1] : '';
}

const slug = getArg('slug');
const name = getArg('name');
const url = getArg('url');

// Validate command-line arguments
if (
  !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
  slug.length > 60 ||
  !name ||
  name.length > 100 ||
  [...name].some((c) => c.charCodeAt(0) < 32)
) {
  console.error(
    'Usage: node scripts/new-shop.mjs --slug abc-xerox --name "ABC Xerox" --url https://shop.example'
  );
  process.exit(1);
}

const origin = new URL(url);
if (
  origin.protocol !== 'https:' ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash ||
  origin.username ||
  origin.password
) {
  throw new Error('Use a stable HTTPS origin without paths or credentials.');
}

const targetDir = resolve(root, 'generated', slug);
await mkdir(resolve(root, 'generated'), { recursive: true });
await mkdir(targetDir); // Deliberately fails if shop folder already exists to prevent overwrites

const shopId = randomUUID();
const agentId = `${slug}-counter-01`;
const agentSecret = randomBytes(32).toString('hex');

// Vercel / Cloud Environment Template
const envConfig = {
  QUICKPRINT_SHOP_ID: shopId,
  NEXT_PUBLIC_APP_URL: origin.origin,
  NEXT_PUBLIC_SHOP_NAME: name,
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  ADMIN_PIN: randomBytes(18).toString('base64url'),
  ADMIN_SESSION_SECRET: randomBytes(32).toString('hex'),
  ORDER_ACCESS_SECRET: randomBytes(32).toString('hex'),
  PRINT_AGENT_ID: agentId,
  PRINT_AGENT_SECRET: agentSecret,
  CRON_SECRET: randomBytes(32).toString('hex'),
  DOCUMENT_RETENTION_DAYS: '3',
  PAYMENT_PROVIDER: 'phonepe',
  PAYMENT_ENVIRONMENT: 'sandbox',
  PHONEPE_MERCHANT_ID: '',
  PHONEPE_CLIENT_ID: '',
  PHONEPE_CLIENT_VERSION: '',
  PHONEPE_CLIENT_SECRET: '',
  PHONEPE_WEBHOOK_USERNAME: slug,
  PHONEPE_WEBHOOK_PASSWORD: randomBytes(32).toString('hex'),
};

const formatDotenv = (data) =>
  Object.entries(data)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join('\n') + '\n';

await writeFile(resolve(targetDir, '.env.production.local'), formatDotenv(envConfig), {
  flag: 'wx',
  mode: 0o600,
});

// Print Agent local environment file
const agentEnvConfig = {
  BACKEND_URL: origin.origin,
  AGENT_ID: agentId,
  PRINT_AGENT_SECRET: agentSecret,
  AGENT_MODE: 'sandbox',
  SIMULATE_PRINT: 'true',
  PRINTER_NAME: '',
  POLL_INTERVAL_MS: '5000',
  HEARTBEAT_INTERVAL_MS: '15000',
  DOWNLOAD_DIR: './temp_jobs',
  STATE_DIR: './state',
};

await writeFile(resolve(targetDir, 'print-agent.env'), formatDotenv(agentEnvConfig), {
  flag: 'wx',
  mode: 0o600,
});

// Seed shop pricing from template
const defaultPricing = JSON.parse(
  await readFile(resolve(root, 'web/public/config/pricing_config.json'), 'utf8')
);
defaultPricing.shop_name = name;
defaultPricing.shop_phone = '';
defaultPricing.shop_address = '';
delete defaultPricing.shop_upi_id;
delete defaultPricing.shop_upi_name;

const escapeSql = (s) => `'${String(s).replaceAll("'", "''")}'`;

const shopSql = [
  'BEGIN;',
  `INSERT INTO public.shops(id, name, slug) VALUES (${escapeSql(shopId)}, ${escapeSql(name)}, ${escapeSql(slug)});`,
  `INSERT INTO public.shop_settings(id, shop_id, pricing) VALUES (${escapeSql(shopId)}, ${escapeSql(shopId)}, ${escapeSql(JSON.stringify(defaultPricing))}::jsonb);`,
  'COMMIT;',
  '',
].join('\n');

await writeFile(resolve(targetDir, 'shop.sql'), shopSql, { flag: 'wx' });

// Assemble fresh installation SQL with migrations in deterministic order
const migrationList = JSON.parse(
  await readFile(resolve(root, 'supabase/migration-order.json'), 'utf8')
);
const migrationContents = await Promise.all(
  migrationList.map((file) => readFile(resolve(root, 'supabase', file), 'utf8'))
);

const freshInstallSql = [
  '-- FRESH SUPABASE PROJECT ONLY. Do not rerun on an existing installation.',
  ...migrationContents,
  shopSql,
].join('\n\n');

await writeFile(resolve(targetDir, 'fresh-install.sql'), freshInstallSql, { flag: 'wx' });

// Instructions readme
const readme = `QuickPrint Shop Installation - ${name}

1. Create a NEW Supabase project owned by this shop.
2. Run fresh-install.sql once in its SQL Editor. Do not also run shop.sql.
3. Fill Supabase credentials in .env.production.local and import into this shop's Vercel Production environment. Never commit the generated folder.
4. Deploy the repository, then open /admin/settings to configure branding and rates.
5. When PhonePe credentials arrive, add them to Vercel. Online checkout activates automatically.
6. Configure the print agent from print-agent.env; start with simulation enabled.
7. Follow docs/NEW_SHOP_INSTALLATION.md for payment activation, maintenance and acceptance tests.
`;

await writeFile(resolve(targetDir, 'README.txt'), readme, { flag: 'wx' });

console.log(`Created installation package: ${targetDir}`);
console.log('Fill cloud/merchant credentials privately. Follow docs/NEW_SHOP_INSTALLATION.md.');
