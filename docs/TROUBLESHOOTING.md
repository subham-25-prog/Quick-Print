# Troubleshooting

| Symptom | Check / safe action |
| --- | --- |
| Payment return DEPLOYMENT_NOT_FOUND | NEXT_PUBLIC_APP_URL must be a stable existing domain. Redeploy, then create a new session only after checking the old payment. Existing provider sessions retain their original return URL. |
| Static UPI QR pays but app does not print | Static QR is not connected to verified PG status. Configure the approved merchant API; never bypass verification. |
| Payment stays pending | Check provider dashboard, credentials/environment, webhook deliveries and scheduled worker. A timeout is not failure or success. Do not pay twice. |
| Merchant configuration not activated | Check exact merchant/account ownership and admin setup readiness; activate from Settings. |
| Agent HTTP 401 | Match backend PRINT_AGENT_ID with AGENT_ID and both PRINT_AGENT_SECRET values. Use the stable BACKEND_URL and restart after secret changes. Do not print tokens into logs. |
| Agent fails startup | Inspect .env, exact printer name, journal integrity, process lock and local port 9191. Do not delete the journal to bypass recovery. |
| Printer offline, queue pending | Restore Windows printer/network, verify selected name and driver. Paid jobs remain queued. |
| REVIEW | Output may already exist. Check physical printer/spooler/journal and reconcile with the owner. No blind retry. |
| SUBMITTED but no paper | Windows accepted submission but the driver/device may be offline, jammed or out of paper. Check Windows queue. This is not another payment problem. |
| Database unavailable / 503 | Check shop UUID, Supabase server credentials and migration order. There is no local-memory production fallback. |
| Upload refused | PDF/JPG/PNG only, 4 MB maximum; export an unlocked valid PDF and remove unsupported advanced options. |
| Document expired | Documents are private and retention-limited. Do not reconstruct public Storage URLs. Resolve any paid-but-unavailable document with the shop. |
| 429 | Wait for the limit window. Inspect abuse/platform limits if many legitimate customers share a source. |
| Old orders disappeared from dashboard | Historical unverified records were retained but are deliberately not admitted to the new verified queue. Review them separately. |
| A previous pending creation never got a link | Provider create may have an unknown outcome. Reconciliation/support must establish the outcome; do not create duplicate charges to “fix” a network timeout. |

## Rollback and support

Keep schema/code/agent versions coordinated. Never restore a legacy manual-payment verification endpoint as a workaround. Restore a tested database backup and matching code only during a controlled maintenance window. Preserve payment references and job IDs for investigation, without sharing documents or secrets.

The release's official provider tests and hardware checks must be completed at installation. Software tests alone cannot establish merchant eligibility, settlement timing, printer compatibility or legal compliance.
