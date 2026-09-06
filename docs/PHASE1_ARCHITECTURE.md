# Phase 1 — Multi-shop architecture and database foundation

## Decision

QuickPrint supports two deployment models without a source-code fork:

1. **Recommended today — isolated shop deployment:** each shop has its own Supabase project, Vercel project, payment account, and Windows agent. This gives the strongest operational isolation.
2. **Future managed platform:** multiple shops share a Supabase project, but every operational record is bound to a server-selected `shop_id` and protected by membership RLS.

The current code uses `QUICKPRINT_SHOP_ID` only on the server. It is never taken from the customer browser, URL, or uploaded form. This prevents a customer from choosing another shop merely by modifying a request.

## Files changed in Phase 1

- `supabase/migrations/20260906_multishop_foundation.sql` creates shops, memberships, printers, audit logs, tenant indexes, RLS, payment/queue tenant backfills, and an unpaid-print state guard.
- `web/lib/shop.ts` validates the server-only shop ID.
- `web/lib/db.ts` scopes pricing, orders, queue reads, agent heartbeat, and print-agent status to the current shop.
- `web/app/api/upload/route.ts` stores every new document below a shop-specific private prefix.
- `web/app/api/orders/route.ts` accepts only files from the current shop prefix and writes the same `shop_id` to new orders and payment records.
- `web/app/api/admin/actions/route.ts` writes a tenant-bound cash print job.
- `print-agent/src/client.ts` identifies its agent on document download and completion reports; the backend accepts only jobs that agent has claimed.

## Applying the migration

Run `supabase/migrations/20260906_multishop_foundation.sql` in the Supabase SQL editor only after the existing base schema and payment/print-queue migration have run successfully.

Apply this SQL migration **before** deploying the accompanying application commit. After deployment, rebuild/restart the Windows print agent from this commit so it sends its `agentId` with every completion report.

It creates a default shop with ID:

```text
00000000-0000-4000-8000-000000000001
```

Existing records are assigned to it, so no orders, payments, agent data, or print jobs are deleted.

For the current single-shop installation, set this same value for `QUICKPRINT_SHOP_ID` in Vercel. For a new isolated shop, create a shop row, use its UUID as `QUICKPRINT_SHOP_ID`, and configure its own Supabase/Vercel/payment/agent credentials.

## Security guarantees introduced

- New uploads are stored at `<shop-id>/orders/<random-id>.pdf` in the private bucket.
- The backend verifies that a submitted order references only its own shop prefix.
- RLS allows authenticated staff to read only shops where they have a `shop_members` row; customer access stays server-mediated through the existing signed order link.
- `PRINTING` and `PRINTED` transitions are rejected by PostgreSQL unless payment is `PAID` or cash-`VERIFIED`.
- Provider confirmation creates a single tenant-bound print job in the same database transaction. The agent claim function locks and filters jobs by its registered shop.

## Deferred to later phases

- Shopkeeper Supabase Auth UI and invitation workflow.
- Pairing-code-based agent enrollment rather than a per-deployment agent secret.
- A real payment-provider adapter, once merchant credentials and official provider documentation are available.
- Retention scheduler, rate limiting, full automated API/security test suite, and Windows installer UI.

These items are intentionally not presented as complete. Online payment remains disabled until an official provider’s server verification contract is integrated.
