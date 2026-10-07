# QuickPrint — independent shop installation

A payment-first self-service printing application: Next.js + Supabase/PostgreSQL + a paired Windows agent. One shop owns its website, database, approved merchant credentials, pricing and printer. This branch is a release candidate; live merchant/Supabase/hardware acceptance remains required before sale or launch.

## Non-negotiable flow

Upload → server page count/price → pending payment → official backend verification → atomic paid order + one print job → Windows submission.

No verified payment means no order confirmation and no print. No screenshot, “I paid,” browser redirect, cash/manual approval or localStorage bypass is accepted. PhonePe v2 is implemented behind a provider interface. Paytm and other providers are extension points, not falsely advertised as supported. An existing merchant QR does not automatically supply PG/API credentials.

The queue has exactly-once **job creation**, leased claims and durable dispatch recovery. Generic Windows drivers do not prove exactly-once physical output. Uncertain dispatch stops for review; successful submission is called SUBMITTED, not fabricated PRINTED.

## Start here

Use Node 24 LTS. Run `npm ci` at the root and `npm ci --prefix print-agent`. Read [new-shop installation](docs/NEW_SHOP_INSTALLATION.md) and [deployment](docs/DEPLOYMENT.md) before running SQL or enabling live payments. Generate an independent shop package with:

```text
node scripts/new-shop.mjs --slug abc-xerox --name "ABC Xerox" --url https://abc.example
```

Generated secrets stay in a git-ignored folder. Configure cloud credentials privately; nothing is deployed by the generator.

## Build checks

```text
npm run lint
npm run typecheck
npm run build
npm run build --prefix print-agent
```

These checks validate the source and production bundle. They do not replace a controlled merchant payment and physical-printer acceptance at the individual shop.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Audit](docs/AUDIT.md)
- [Installation](docs/NEW_SHOP_INSTALLATION.md)
- [Deployment and migration order](docs/DEPLOYMENT.md)
- [Payment configuration](docs/PAYMENT_SETUP.md)
- [Merchant eligibility and current fees](docs/MERCHANT_PROVIDER_SETUP.md)
- [Windows agent](docs/PRINT_AGENT.md)
- [Shopkeeper guide](docs/SHOPKEEPER_GUIDE.md)
- [Security](docs/SECURITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

Before live launch: apply the actual Supabase migration, verify private Storage, configure approved shop merchant credentials and webhooks/scheduler, perform a controlled payment/settlement and physical print, then confirm owner-approved policies, backups, and monitoring. Never claim “zero errors” or “production verified” from a local build alone.
