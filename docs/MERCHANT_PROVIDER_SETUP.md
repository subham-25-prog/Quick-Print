# Merchant providers and current eligibility

Checked against official sources on 2026-09-07. Recheck commercial terms before every sale. One installation uses the shop's own approved credentials; QuickPrint does not collect money centrally or split settlement between shops.

## PhonePe — implemented v2 adapter

Ask the owner to open their PhonePe Business/Payment Gateway dashboard and confirm legal business name, merchant identifier, settlement bank and API/PG eligibility. An existing offline relationship may be reusable, but its QR or soundbox does not establish access to online PG credentials. PhonePe must confirm mapping and any additional onboarding/KYC/approval for that specific merchant. QuickPrint cannot grant eligibility.

Obtain merchant ID plus client_id, client_version and client_secret for the approved environment using PhonePe's [website integration instructions](https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-integration-website). The adapter follows [OAuth authorization](https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/authorization), [payment creation](https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/create-payment/initiate-payment) and [order status](https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/order-status). Minimum supported checkout is ₹1.

The website redirects to the provider-generated secure checkout URL, where eligible payment methods are offered. It does not invent direct UPI intents or verify static QR payments. This adapter is not a guarantee of UPI-only checkout availability for every merchant/device.

Status verification is authenticated by the shop's OAuth credentials. PhonePe v2 fixes amounts to INR paisa and does not always return merchant/currency fields. The adapter checks them when present, validates stored provider order ID, amount, completed transaction, shop/payment metadata and credential fingerprint. **Metadata is our binding evidence, not independent proof of the settlement bank.** The installer must verify OAuth credentials belong to the expected merchant; changing the environment/client identity requires reactivation. Confirm ownership and settlement in the provider dashboard during UAT/live acceptance.

PhonePe's [pricing page](https://www.phonepe.com/business-solutions/payment-gateway/pricing/) currently displays a promotional free Standard Plan with 1.99% crossed out, zero setup/annual maintenance fees, and terms applying; it describes zero gateway fees during the offer period. This is not a promise of permanently free processing. Obtain written eligibility, offer end date, instrument-specific rates, GST, settlement/refund charges and post-offer pricing for the shop.

## Paytm — extension point, not implemented

Check the owner's Paytm for Business account and ask for online Payment Gateway activation. Paytm's [onboarding instructions](https://business.paytm.com/support/how-can-i-start-collecting-payments-on-my-website-and-mobile-app-with-paytm-payment-gateway) describe PG onboarding; do not equate an existing offline login with approval. Obtain approved MID, merchant key and environment details from Paytm. A future adapter must use its official [server SDK/checksum and API contracts](https://business.paytm.com/docs/server-sdk/), server status verification, signed notifications and this repository's same security tests. Setting PAYMENT_PROVIDER=paytm currently fails closed.

Paytm's [published pricing](https://business.paytm.com/amp/pricing) lists zero setup/AMC and 0% for standard UPI; other payment instruments have separate charges and applicable taxes. Verify the precise contract, UPI variant, platform/service/settlement charges and account eligibility instead of advertising universal free APIs.

## Google Pay for Business / other QRs

A consumer Google Pay UPI app can pay through an eligible PSP flow without the shop integrating Google Pay as its backend verifier. Google's [response-handling guidance](https://developers.google.com/pay/india/api/web/handle-response) requires checking payment with the PSP; returning from an app is insufficient. This project has no generic GPay/static-QR verification adapter and no verified commercial/API entitlement for the shop. Use an officially approved PSP/PG integration, or obtain and implement the provider's documented server contract first. Do not scrape notification/SMS/soundbox output, accept a screenshot/UTR, or imitate an undocumented API.

## Adding an adapter

Implement PaymentProvider in `web/lib/payments/provider.ts`, normalize verified identities/statuses, register it explicitly in `index.ts`, update the database provider allowlist with a migration and add negative contract tests. Reuse finalize_payment and the print queue unchanged. Mocks live in tests only, never in the production provider factory.
