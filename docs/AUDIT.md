# Production audit — 7 September 2026

Scope: independent installations, one merchant and one Windows agent per shop. Baseline `bf5150b`.

| Priority | Classification | Finding | Required correction |
|---|---|---|---|
| P0 | INSECURE | Checkout accepts browser page count and arbitrary upload references | Persist validated upload metadata, authorize owner, calculate from database |
| P0 | BROKEN | Malformed/encrypted PDF counted as one page | Reject invalid files |
| P0 | BROKEN | Payment confirmation can regress a printed order | Transactional, monotonic confirmation and unique order/payment/job relations |
| P0 | INSECURE | Global agent secret with caller-selected agent ID | Bind authentication to installation and registered agent; claim tokens |
| P0 | BROKEN | Printer code tries additional engines after an ambiguous error and eventually logs success | One dispatch attempt; uncertain outcomes require reconciliation |
| P0 | BROKEN | Completion-report failures are swallowed; overlapping polls may claim twice | Durable dispatch journal, report retry, serialize before claiming |
| P0 | PARTIAL | Tenant filters coexist with unscoped process/disk caches and legacy RPCs | Database-only authority; remove fallbacks and obsolete write RPCs |
| P1 | MISSING | Payment adapter, actual gateway verification and recovery | PhonePe v2 adapter; authenticated webhook inbox and server reconciliation |
| P1 | MISSING | Repeatable database, RLS, API and browser tests; CI | Add executable quality gates |
| P2 | MISSING | Durable rate limits, document retention and reconciliation scheduler | Database limiter and authenticated maintenance route |
| P2 | PARTIAL | Dashboard optimistic payment success; stale local cache | Server-confirmed UI and real metrics |
| P3 | DEAD CODE | Unsupported DOCX/advanced settings and static merchant QR payment helpers | Remove unsupported claims and bypass paths |

Existing working foundation: Next.js build, private bucket setup, server admin cookie signature, server price formula, per-shop ID, parameterized Supabase queries. Build success alone does not verify the invariants above.

External release requirements: migrated Supabase, actual merchant credentials/UAT approval, target-printer hardware acceptance. These cannot be inferred from mocks or compilation.
