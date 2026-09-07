# Quality gates and acceptance tests

## Automated local checks

Use Node 22 from the repository root:
```text
npm ci
npm ci --prefix print-agent
npm run lint
npm run typecheck
npm test
npm run build
npm run build --prefix print-agent
npm run test:e2e --workspace web
npm audit --omit=dev --audit-level=high
npm audit --prefix print-agent --omit=dev --audit-level=high
```

Local browser tests use installed Chrome; Linux CI installs Playwright Chromium. Browser tests start a production build on localhost:3100. Do not run them against a live merchant installation. CI contains no merchant/service-role credentials.

- PGlite executes the actual migration SQL on PostgreSQL, with minimal Supabase auth/storage schema stubs and uuid-ossp replaced by core gen_random_uuid. It tests RLS, restrictive Storage policy, wrong-shop access, forged paid orders, exact verification, duplicate finalization, competing claims, stale fences, post-dispatch non-retry, retention and dashboard aggregation. It is not a substitute for testing Supabase PostgREST/Storage in staging.
- Provider tests use mocked transport fixtures derived from the official v2 contract. They are not real PhonePe sandbox transactions.
- API route tests exercise real handlers with mocked database/provider boundaries: authoritative pricing/page counts, ignored frontend paid fields, bad inputs, missing authentication, cross-origin attempts, oversized/disguised uploads and database failure.
- Agent tests use an isolated temporary journal and fake driver/transport: overlapping polls, restart/lost ACK, uncertain spool errors, pre-dispatch failure, Windows status codes and sandbox/live separation. No physical paper is printed.
- Mobile browser tests exercise unconfigured fail-closed behavior, upload/checkout, pending refresh, verified order, failure/retry UI, forged redirect parameters and dashboard/settings presentation. UI response fixtures stay in tests; the production provider factory rejects mock providers.

## Required external acceptance (not yet executed)

Apply migrations to an actual staging Supabase project and test its authenticated/anonymous REST and Storage endpoints, including Shop A/B access. Test each official merchant environment with the shop's own credentials, verify merchant settlement mapping, amount and webhook authentication. Send duplicate notifications and reload/close the browser; expect one job only. Provider network failure/pending/failure must never create a paid order.

On the shop PC, run sandbox simulation first, then a controlled live payment with a real printer. Verify B/W, color, A4/A3/Legal/Photo as offered, copies, duplex and driver behavior. Test unplugged/offline printer, network loss before and after dispatch, agent restart and lost acknowledgements. Confirm REVIEW is never automatically reprinted and SUBMITTED is not falsely called physically printed.

Test scheduler recovery with the browser closed and after a deliberately failed webhook/API request. Check backups/restores, retention and refunds before opening to customers. Document timestamps and evidence in the installation handover, not just PASS without proof.
