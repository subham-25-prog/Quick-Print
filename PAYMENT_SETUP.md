# Secure UPI payment and automatic print setup

Online UPI printing is disabled until a Cashfree Payment Links account is configured. A personal UPI address cannot independently confirm a payment, so it must never be used to auto-print.

## 1. Apply the Supabase migration

Open the Supabase SQL editor for the QuickPrint project and run:

`supabase/migrations/20260906_payment_first_printing.sql`

Run it with RLS enabled. It creates private `payments` and `print_jobs` tables plus the server-only idempotent payment and print-queue functions.

## 2. Configure Vercel

Add these Production and Preview environment variables in Vercel:

```
CASHFREE_ENV=production
CASHFREE_CLIENT_ID=...
CASHFREE_CLIENT_SECRET=...
CASHFREE_WEBHOOK_SECRET=...
NEXT_PUBLIC_APP_URL=https://quick-print-two.vercel.app
```

Use `sandbox` only with Cashfree sandbox credentials. Do not expose either secret in the browser or commit it to Git.

## 3. Configure the Cashfree webhook

In Cashfree Payment Gateway → Developers → Webhooks, add:

```
https://quick-print-two.vercel.app/api/payments/cashfree/webhook
```

Enable Payment Link events. The endpoint validates the raw request-body HMAC, timestamp, payment-link reference, amount, currency, and provider transaction before it confirms an order.

## 4. Test safely

1. Set the agent `SIMULATE_PRINT=true` and use Cashfree sandbox credentials.
2. Place a UPI order with a sandbox payment method.
3. Verify the payment in Cashfree; the signed webhook must change the payment to `SUCCESS`.
4. Confirm that exactly one `print_jobs` record appears, the agent claims it, and terminal logs show the simulated print.
5. Re-send the webhook and refresh the customer page. No additional job or print must appear.
6. Stop the agent during a job. The order stays paid and confirmed; the job becomes retryable when the agent returns.

Cash orders remain manual: the shopkeeper verifies cash in the Admin dashboard, which is the only cash path allowed to queue printing.
