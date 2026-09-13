# Release readiness review — 13 September 2026

Decision: the three blockers below are fixed locally, with regression coverage. Customer installation acceptance remains outstanding. This is a focused source review and local verification, not a complete security audit or hardware acceptance test.

## Fix verification

- Order-list agent authentication rejects missing/short credentials; the hard-coded fallback was removed.
- Cash actions require explicit ACCEPT/REJECT and use the new `resolve_cash_payment` transaction. It locks the payment, rejects non-cash records, preserves existing orders/jobs, and makes repeated acceptance/rejection idempotent. Conflicting decisions cannot reverse an accepted or rejected payment.
- Unused direct-upload JSON prepare/finalize actions return 410 before storage access. The current browser uses multipart/chunked uploads. Chunks are isolated by shop, upload ID, owner token and metadata; final document IDs are generated on the server. Actual request and assembled sizes are bounded before parsing.
- Updated automated suite: **114 passed**, one opt-in load test skipped. Lint, TypeScript checks and the web production build passed.
- The SQL tests use PGlite's serialized connection. They exercise real migration functions and state transitions, but are not a live multi-session PostgreSQL contention test.

Apply `supabase/migrations/20260913052027_secure_cash_actions.sql` before deploying the updated website. Missing migration causes cash actions to fail closed; there is no fallback to the unsafe route logic. These changes have not been applied to the live deployment by this work.

## Evidence

- Current automated suite: 85 passed, one opt-in load test skipped (17.07 seconds).
- ESLint and TypeScript checks passed.
- Earlier isolated load run: 5,800 operations passed. See load-results/README.md for substantial scope limits.
- Sandbox cloud heartbeat previously returned HTTP 200. That proves authenticated connectivity and matching environment, not successful checkout or physical printing.
- Agent build passed earlier in this session. A fresh web production build and browser acceptance were not run in this review.

## Release blockers identified in source

1. `web/app/api/orders/route.ts:17`: order-list authorization uses a hard-coded fallback when PRINT_AGENT_SECRET is missing. Remove the fallback and reject missing configuration. Add a regression test for the unset-secret case. Assess whether this value was used as a deployed credential; rotate affected credentials if so.
2. `web/app/api/admin/cash-action/route.ts:19`: missing or unknown actions become ACCEPT. The route does not require provider=cash before finalization and uses the stored provider identities with a locally generated transaction reference. Thus an authenticated admin request can route an online-payment record through manual acceptance. Explicitly validate action, provider and allowed state. Existing orders are deleted before acceptance/rejection; replace this with a transactionally safe, idempotent cash workflow. Test repeated clicks and concurrent accept/reject, including already-submitted jobs. Current passing admin-action tests exercise a different endpoint.
3. `web/app/api/upload/route.ts:402`: direct-upload finalize accepts caller-provided identifiers/token/path and checks only a path prefix. Prepare does not persist an ownership binding for finalize to verify. A known object path must not let a caller process or remove another upload, including on insert failure. Bind preparation to a validated capability or server record; enforce exact paths, expiry and ownership before reads/writes/deletion. Apply consistent bounded parsing to multipart, chunked and direct uploads and test adversarial requests.

These findings describe the original source-level problems, now addressed by the local fixes above. No exploit was attempted against the live service.

## Required installation acceptance

- Test the specific shop's driver and printer: PDF/image, copies, supported paper sizes, colour/BW and duplex as applicable. Disable unsupported options.
- Verify a controlled live payment, correct amount and merchant destination, failed/cancelled payment, delayed/duplicate notification and browser closure. Test enabled cash acceptance separately.
- Verify two simultaneous payments produce distinct jobs, while repeated processing of one payment produces one job.
- Test printer unplug/reconnect, missing paper, internet loss and agent/PC restart at different job stages. Inspect physical output and REVIEW handling; never infer printed pages from SUBMITTED alone.
- Confirm replacing the selected printer is reflected in the dashboard and subsequent output.
- Verify retention, backups/restore, monitoring and staff recovery instructions in the actual deployment.
- Run a supervised shop pilot and record expected versus actual outcomes before handover. Set explicit support scope and supported hardware/features.

No software-only result guarantees physical output or 100% availability. Customer readiness requires resolving the blockers and collecting actual installation evidence.
