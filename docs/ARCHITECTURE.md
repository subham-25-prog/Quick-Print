# Architecture

## Installation boundary

Each shop receives an independent deployment, Supabase project, merchant account integration and Windows agent. QUICKPRINT_SHOP_ID is mandatory in production and is never read from a browser request. The schema has shop IDs and membership RLS for defense in depth; this is not a shared-merchant marketplace.

## Data flow

1. POST /api/upload validates a bounded multipart file, counts actual PDF pages (or converts a bounded image) and stores a private UUID-path PDF plus uploaded_files ownership/hash/expiry metadata.
2. POST /api/orders uses that upload's server record, configured print options and integer-paisa pricing. It creates **payments only**, with an immutable draft, idempotency key and merchant/environment binding. No actual unpaid order is inserted.
3. The configured PaymentProvider creates an official hosted checkout. Return URLs use the canonical deployment domain and a signed private payment-status capability.
4. Authenticated webhook notifications enter a durable inbox. Best-effort after-response verification, signed customer polling and a scheduled worker fetch official payment status independently.
5. The service normalizes and verifies proof, then calls finalize_payment. PostgreSQL locks payment/file, validates identities/amount/transaction, writes SUCCESS, creates the PAID/CONFIRMED order, inserts exactly one print_job and audits it in one transaction.
6. A paired agent heartbeat identifies a fixed shop/agent/environment. A single queue claim gets a fresh fence token and two-minute lease.
7. The agent downloads only its authorized private PDF, journals STARTING durably, calls start_print_job, submits once to Windows and acknowledges SUBMITTED. An uncertain start/spool result becomes REVIEW; no automatic redispatch.
8. The customer sees only backend status. Admin statistics come from scoped database aggregates, never browser caches.

## State machines

Payment: PENDING → provider-verified SUCCESS / FAILED / EXPIRED / CANCELLED. Delayed genuine success may supersede a previous failure. An ambiguous or duplicate paid attempt can be flagged REVIEW without creating a second order.

Job: PENDING → CLAIMED → PRINTING → SUBMITTED. CLAIMED can safely expire/retry before dispatch; a pre-dispatch FAILED is manually retryable. PRINTING cannot expire back to the queue. REVIEW requires checking actual output. PRINTED is reserved for future reliable physical completion evidence.

## Tables and permissions

shops, shop_settings, shop_members, uploaded_files, payments, payment_configs, orders, print_jobs, print_agents, printers, order_events, audit_logs, webhook_inbox and rate_limits. Financial/order records are preserved during document retention. Legacy records remain archived in the database but are not trusted into the new queue.

Application RLS denies anonymous mutations; Supabase members only read authorized shop tables. Service-role routes enforce admin/customer/agent authentication separately. Privileged functions grant execute only to service_role. Documents are private, short-preview-link authorized, and restricted from direct browser Storage access.

## Provider boundary

PhonePe v2 uses authenticated OAuth status calls. Merchant binding includes the configured expected merchant, client/environment fingerprint, provider order ID and metadata; actual settlement-account ownership is an onboarding/UAT requirement. Future adapters normalize the same proof and use the same finalizer. There is no mock fallback or hard-coded merchant QR.

## Reliability limits

A durable PostgreSQL job can be exactly-once while a physical device cannot participate in its transaction. This release favors no duplicate automatic dispatch over silently retrying uncertain work. It reports SUBMITTED honestly, not physical completion. Scheduler latency, driver behavior, merchant approval, Supabase configuration, document scanning and real acceptance are deployment responsibilities.
