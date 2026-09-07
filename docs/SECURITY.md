# Security model and operating limits

## Boundaries

The browser receives no service-role or merchant secret. All data mutations use authenticated server routes. The deployment's required QUICKPRINT_SHOP_ID scopes every operation; browser shop IDs are ignored. Customer status links use expiring HMAC capabilities; upload ownership uses a random 256-bit token stored hashed. Preview links expire after 15 minutes; checkout upload ownership expires after 24 hours. Order status links expire after 14 days, subject to document retention. Treat them as confidential bearer links.

Administrator sessions are HTTP-only, SameSite=Strict, Secure in production, shop-bound and signed, with a 12-hour TTL. ADMIN_PIN is a password of at least 12 characters; other secrets require at least 32. Production has no default admin/order/agent credentials or database-memory fallback. Development defaults are for localhost only. Rotate ADMIN_SESSION_SECRET to invalidate all sessions after compromise, not just ADMIN_PIN.

RLS is enabled on every application table; historical permissive policies are replaced. Anonymous clients cannot manipulate payments/orders/jobs. Authenticated Supabase members have only shop-scoped SELECT on approved operational tables; writes and payment configuration remain server-only. Privileged RPC execution is revoked from public/anon/authenticated. The private document bucket has an additional restrictive policy denying browser direct access, even if a legacy permissive policy exists.

## Payment and queue

Provider API success, exact integer-minor amount, INR, reference, transaction, provider-order identity, shop metadata, merchant mapping, environment and credential fingerprint are verified before the database transaction. Unique constraints protect payment references, transactions, idempotency and one job per order/document. The finalizer locks the payment/file, sets SUCCESS and creates a PAID/CONFIRMED order plus one job atomically. Duplicate webhooks cannot duplicate jobs or regress submitted orders.

The agent secret is installation-specific, exact agent ID is checked, and claim tokens fence stale workers. Downloads cannot follow arbitrary remote redirects. Dispatch is journaled durably; uncertain outcomes stop for review. Sandbox/live mode mismatches are rejected.

## Files and abuse

Multipart byte limits, extension/MIME/content agreement, strict PDF parsing, encrypted/empty/malformed PDF rejection, actual server page counts and image dimension caps are applied. Customer prices, page counts, file paths and paid flags are never authoritative. Arbitrary advanced print arguments are rejected. Documents are not executed or served as HTML. A PDF parser is not an antivirus/CDR service; isolate the shop PC, keep its OS/drivers and bundled PDF engine patched, and consider malware scanning before accepting untrusted public documents at scale.

Persistent database rate limits protect upload/checkout/status/retry/login. Vercel's trusted forwarding header is used; outside Vercel the fallback is a conservative shared limiter, not a spoofable customer IP. Add platform WAF/body/request limits and monitor abuse. Missing database access fails closed.

CSP, no-referrer, HSTS, nosniff, frame blocking and no-store document/status responses are configured. The current Next/React CSP permits inline framework scripts/styles; nonce-based strict CSP remains a hardening opportunity. No raw HTML is rendered from customer input.

## Retention and incident handling

Default document retention is 3 days (configurable 1–30). Only eligible orphan/terminal-order documents are removed. Pending payments, active jobs and ambiguous dispatch records retain files until resolution. Deletion is locked against payment finalization and retried after Storage failure. Financial/audit records are retained; define a lawful shop-specific retention/export policy separately. Scheduled cleanup must actually be enabled and monitored.

Do not reuse previously exposed chat credentials. Revoke them at the provider, add new values privately, redeploy, rotate agent secrets on both sides and restart. Restrict Vercel/Supabase/GitHub access, enable account MFA yourself, and never commit generated environments, customer PDFs, state journals or keys. A database service-role compromise is outside RLS protection; protect that credential carefully.
