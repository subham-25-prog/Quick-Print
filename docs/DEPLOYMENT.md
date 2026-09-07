# Deployment and upgrade runbook

## Release gate

This release is a **candidate**, not an already activated live shop. Back up Supabase and export outstanding legacy transactions before upgrading. Use a separate staging Supabase project first. Stop all old agents; disable checkout while changing schema. Do not roll application code back to a legacy payment-bypass version against the new schema.

## Database

For an empty Supabase project, run the files in `supabase/migration-order.json` in the listed order in SQL Editor. Run each file completely and verify success before the next:

1. `schema.sql`
2. `storage.sql`
3. `migrations/20260906_payment_first_printing.sql`
4. `migrations/20260906_switch_to_sbiepay.sql`
5. `migrations/20260906_multishop_foundation.sql`
6. `migrations/20260907_production_invariants.sql`

The old SBI-named migration is a historical schema dependency, **not an enabled payment adapter**. Do not sort these same-date files alphabetically or run `supabase db push` blindly. Record applied filenames/checksums in the installation handover. The new migration is transactional and intentionally not rerunnable. On an existing project, inspect its actual schema/applied history and apply only missing migrations. Never replace a previously executed SQL query by dropping tables. Test upgrades on a database copy.

Check `pg_policies`, table RLS and the private `shop-documents` bucket. The new migration removes historical application-table policies and adds a restrictive document Storage policy. Existing legacy orders remain in the database but are **not automatically migrated into verified orders** or shown in the new queue. Resolve them separately; never synthesize successful payments. Restore from backup for a failed incompatible migration.

Run generated `shop.sql` for a **new** installation. Existing shops should retain their actual shop UUID rather than create another shop for their existing data.

## Vercel

Import this repository, Next.js framework, Root Directory `web`, Node 22, build `npm run build`, output `.next`. Workspace dependencies are installed from the committed root lockfile. The root `vercel.json` applies Next.js defaults. Add the variables in `web/.env.example` to the appropriate environment. Keep production and sandbox projects/credentials separate. Never prefix secrets with NEXT_PUBLIC.

Set NEXT_PUBLIC_APP_URL to the stable custom domain or production alias, **not** a disposable deployment URL. Redeploy after environment changes. Payment returns and shop QR use this URL. Ensure the webhook URL is reachable without Vercel deployment-login protection; do not place bypass tokens in customer URLs.

After migrations, pricing and security are configured, log in at `/admin/login`, open Settings and activate the merchant **only after checking credential/account ownership in the merchant dashboard**. Activation is a configuration check, not a live payment test.

## Scheduled recovery

The webhook durably stores its notification, then uses Next.js `after()` for best-effort immediate server-side status verification. Browser polling also verifies. A scheduled worker is required when either is interrupted or a customer never returns.

An opt-in GitHub Actions workflow is included. On the shop repository's default branch configure:
- Repository variable QUICKPRINT_MAINTENANCE_ENABLED = true
- Repository variable QUICKPRINT_APP_URL = stable HTTPS origin (no trailing slash)
- Repository secret QUICKPRINT_CRON_SECRET = the same CRON_SECRET as Vercel

It calls `GET /api/maintenance` every five minutes. GitHub schedules can be delayed/disabled by inactivity and are not a latency SLA. Monitor failures. For a busy commercial shop use a reliable external scheduler every minute with `Authorization: Bearer <CRON_SECRET>`; confirm hosting/scheduler plan charges before enabling. Each run processes up to eight pending/inbox payments concurrently, leases reconciliation and removes eligible documents. Do not expose this secret in query strings. Ensure only one configured scheduler is used.

## Launch acceptance

Run the entire checklist in TESTING.md against the real staging Supabase instance, official merchant sandbox, then a controlled live payment and shop printer. Verify that the money belongs to the shop's settlement account. Publish shop-specific contact, privacy, terms and refund information required by its merchant agreement before live onboarding. The repository does not supply legal terms on the shop's behalf.

Monitor Vercel errors, pending/review payments, job age, agent heartbeat, Storage growth and scheduled workflow failures. Backups and restore drills are part of operating the shop, not replaced by green unit tests.
