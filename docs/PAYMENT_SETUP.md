# Payment setup (PhonePe v2)

Read MERCHANT_PROVIDER_SETUP.md first. Do not reuse the Razorpay secrets pasted in chat; revoke/rotate any exposed credentials in their original provider accounts.

1. Obtain this shop's approved PhonePe sandbox client ID, version, secret and merchant ID.
2. Set PAYMENT_PROVIDER=phonepe, PAYMENT_ENVIRONMENT=sandbox and the six PHONEPE_* fields in the Vercel environment. Keep all secrets server-only.
3. Set a stable NEXT_PUBLIC_APP_URL, secure order/admin/agent/cron secrets, and the actual QUICKPRINT_SHOP_ID. Redeploy.
4. In PhonePe's [webhook setup](https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/webhook), use `https://YOUR-STABLE-DOMAIN/api/payments/webhook`, select SHA username/password authentication, and configure the same PHONEPE_WEBHOOK_USERNAME / PHONEPE_WEBHOOK_PASSWORD as Vercel. Subscribe to checkout.order.completed and checkout.order.failed.
5. The adapter validates the documented Authorization digest SHA256(username:password). This is **not** a Razorpay body signature. It stores a notification, then independently asks the authenticated status API. Even a tampered body with known webhook credentials cannot create a paid order without matching successful provider status.
6. In Admin → Settings confirm merchant/account ownership and activate the configured mapping. This does not make any payment successful.
7. Enable scheduled recovery (DEPLOYMENT.md); test closing the browser before notification arrives.
8. Run the provider's official sandbox scenarios. Sandbox orders are marked test and can only be consumed by an agent in simulation mode. No real printing or money is claimed.
9. Obtain live approval, confirm charges/account ownership, deploy live credentials in a separate live installation, reactivate the mapping and run a controlled live acceptance test.

## Failure and retries

A pending or unreachable provider is not success. The customer can resume the same saved payment link. Only a provider-confirmed terminal failed/cancelled/expired session can be retried into a new session; a network-ambiguous create cannot safely generate another charge. Such sessions remain pending for reconciliation/support rather than guessing. PhonePe v2 exposes PENDING/FAILED/COMPLETED; user cancellation may remain pending until the provider supplies a terminal result.

A late successful payment for an already-ordered or removed file is flagged REVIEW; no second order/job is created. The shop must inspect provider records and arrange an appropriate refund through the provider. Automated refunds are not implemented.

Do not change merchant credentials while unresolved sessions exist. Reconcile them with the original merchant credentials first. Queries, redirects, screenshots, browser storage and customer-entered references cannot authorize printing.
