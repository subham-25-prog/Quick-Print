# Installation verification — 7 September 2026

Production application: https://quick-print-two.vercel.app

Application release `d2a913e` was pushed to `main` and Vercel reported Ready.
The production domain previously served `11e42d9`, while the database already
had the newer schema. The release now matches the database architecture.

## Verified against the live installation

- The default shop UUID exists and exactly one shop settings record exists.
- Every public application table has RLS enabled.
- `uploaded_files`, `finalize_payment`, `claim_print_job`, and
  `consume_rate_limit` exist; the `shop-documents` bucket is private.
- Pricing responds successfully. Two synthetic single-page PDFs uploaded
  successfully; an authorized preview returned a PDF and anonymous preview
  access was denied. No payment or print order was created by these checks.
- The production page shows that online ordering is unavailable and disables
  checkout. No merchant configuration is activated.

Run `node scripts/verify-live-upload.mjs https://quick-print-two.vercel.app`
to repeat the upload check. Each run creates one synthetic upload record and
document; the configured retention worker will eventually remove its file.

## Still required before accepting customers

The owner confirmed approved PhonePe Payment Gateway credentials are not yet
available. These cannot be supplied by a static merchant UPI QR or fabricated.

1. Add the shop's approved PhonePe credentials and webhook configuration using
   `web/.env.example` and `docs/PAYMENT_SETUP.md`. The observed Vercel variable
   list contained old Razorpay variables but no PhonePe configuration.
2. Configure `PRINT_AGENT_ID` to match the installed agent, and configure
   `CRON_SECRET` and the scheduled maintenance workflow. These variable names
   were absent from the observed Vercel configuration. Pairing and scheduling
   have not been verified or enabled in this session.
3. Verify `NEXT_PUBLIC_APP_URL` equals the stable production origin. Vercel
   stored this public setting as a write-only secret and rejected an attempted
   edit due to its public prefix. The edit was cancelled; its value remains
   unverified. Correct it as a Config variable before payment acceptance.
4. Redeploy, confirm the merchant account in admin Settings, and complete
   sandbox then controlled live payment tests with the shop's printer.

No real payment, settlement, webhook delivery, or physical print was verified.
This is an operational setup release, not a declaration that live checkout
is ready. Do not activate payments before the remaining checks are complete.

## Local verification

Clean dependency installs reported zero known vulnerabilities. Web production
build, lint, typecheck, agent build, and 46 unit/integration tests passed.
Five browser test cases reported success; the Windows test-runner teardown
did not exit promptly. Live browser inspection also confirmed the setup notice.

Work used an isolated checkout at `D:/Projects/QuickPrint-main/QuickPrint-launch-setup`.
Pre-existing uncommitted edits in `Quick-Print-live` were preserved and excluded
from this release.
