# SBIePay payment integration status

Razorpay has been removed. Online payment is deliberately disabled until SBIePay provides this merchant's official integration kit. This is safer than guessing an SBIePay endpoint, encryption method, signature, callback format, or verification API: no online payment can mark an order paid or start a print without server-side verification.

## What is already secure

- The Supabase `payments` and `print_jobs` tables are RLS-protected.
- The existing `confirm_verified_payment` database function is idempotent: one verified payment can create at most one print job.
- Cash orders remain manual: the shopkeeper verifies cash in Admin before printing.
- SBIePay placeholder configuration is server-only; no SBI secret is exposed to the browser.

## Required from SBIePay before implementation can be completed

Obtain the official merchant integration kit after onboarding. It must provide all of the following for the specific merchant and environment:

1. Sandbox and production gateway URLs.
2. Merchant ID, terminal ID, and the exact credential/key format.
3. Payment-initiation request fields and the official UPI/UPI Intent flow.
4. Required encryption, hashing, or signing algorithm with official examples.
5. Return/callback URL contract and signature verification process.
6. Server-side transaction-status verification endpoint and response fields.
7. Supported test credentials and test payment scenarios.

The public SBI information confirms that SBIePay supports UPI and merchant onboarding, but the technical protocol is merchant-portal material and is not published openly. Contact SBIePay at `sbiepay@sbi.co.in` for onboarding and `support.sbiepay@sbi.co.in` for the technical integration kit.

## Supabase migration

For an existing database that previously used the payment migration, run:

`supabase/migrations/20260906_switch_to_sbiepay.sql`

It changes only the default provider for future payment records. It does not modify historical payments or orders.

## Future Vercel configuration

Do not add guessed values. Once SBIePay supplies the official values, add the exact variables documented in `web/.env.example`, then provide the official integration document so the payment initiation, callback, and verification handlers can be implemented and tested.
