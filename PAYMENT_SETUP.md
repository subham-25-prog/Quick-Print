# Secure Razorpay UPI payment and automatic print setup

Online UPI printing stays disabled until Razorpay Payment Links and its signed webhook are configured. A personal UPI address or a browser message that says "paid" cannot prove a payment and must never trigger printing.

## 1. Apply the Supabase migrations

Open the Supabase SQL editor for the QuickPrint project and run these files in order:

1. `supabase/migrations/20260906_payment_first_printing.sql`
2. `supabase/migrations/20260906_switch_to_razorpay.sql`

They create RLS-protected `payments` and `print_jobs` tables, then add server-only idempotent functions which confirm a payment and queue exactly one print job. Do not expose the service-role key to the browser.

## 2. Create Razorpay credentials

In Razorpay Dashboard, create API keys and copy the **Key ID** and **Key Secret**. Create a separate, long random Webhook Secret for this app.

## 3. Configure Vercel

Add these Production and Preview environment variables, then redeploy:

```
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
NEXT_PUBLIC_APP_URL=https://quick-print-two.vercel.app
```

Use `rzp_test_...` test keys for testing and `rzp_live_...` only after completing live activation. None of the three Razorpay variables may start with `NEXT_PUBLIC_` or be committed to Git.

## 4. Configure the Razorpay webhook

In Razorpay Dashboard → Account & Settings → Webhooks, add this URL:

```
https://quick-print-two.vercel.app/api/payments/razorpay/webhook
```

Use the exact same Webhook Secret as Vercel. Enable at least `payment_link.paid`, `payment_link.cancelled`, and `payment_link.expired` events. The endpoint validates the raw-body HMAC, payment-link ID/reference, captured payment ID, exact paise amount, and currency before it can confirm an order.

## 5. Test safely

1. Set the print agent `SIMULATE_PRINT=true` and deploy with Razorpay **test** keys.
2. Create a UPI order. The app must open a Razorpay hosted payment link; it must not mark the order paid yet.
3. Complete the test payment. Razorpay should redirect to the status page, and either the signed webhook or the server-side status check confirms the payment.
4. Confirm exactly one `print_jobs` row is created and the agent logs one simulated print.
5. Re-send the same webhook and refresh the customer page. There must be no second print job or print.
6. Try a cancelled, expired, or wrong-amount payment. The order must remain unconfirmed and must not reach the print agent.

Cash orders remain manual: the shopkeeper verifies cash in the Admin dashboard, which is the only cash path allowed to queue printing.
