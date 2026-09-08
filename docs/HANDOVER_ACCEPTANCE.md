# Shop-owned deployment acceptance

Each shop receives the repository and a separately generated installation package. Shop data, cloud accounts, gateway credentials and agent state must not be copied from another shop. Generated packages are private and ignored by Git.

## Before payment credentials arrive

Generate the package with scripts/new-shop.mjs. Apply fresh-install.sql to an empty Supabase project only; import the environment file privately into the shop's Vercel project. Set the stable production URL, pricing and printer pairing. Visit /admin/settings. Upload a synthetic PDF and image; verify preview access requires its token. Checkout remains unavailable until valid credentials are added. Start the agent in simulation mode.

## Activate PhonePe later

Add the shop's approved gateway credentials in Vercel, redeploy, and configure the webhook. Follow PAYMENT_SETUP.md. Sandbox results do not prove live settlement. Before accepting customers, test successful payment, failure, cancellation, delayed callback, closing the browser, duplicate callbacks, amount mismatch and printer offline recovery. Confirm exactly one order/job per payment and verify a controlled live print on the actual hardware.

## Low-maintenance operations

- Configure the maintenance workflow variables and secret from DEPLOYMENT.md. Run it manually once and confirm success before enabling its schedule. Scheduling a workflow is not proof it runs; check failures and inactivity-related scheduler suspension.
- Check the admin dashboard at opening time. A configured maintenance key is not proof of recent execution. A heartbeat proves the agent is online, not that paper, toner or the spooler is healthy.
- Keep the agent state folder through upgrades and restarts. Never auto-retry an uncertain physical dispatch; inspect the spooler and paper output first to avoid duplicate printing.
- Retention removes eligible documents; it does not erase financial history. Pending/review cases require attention and may retain files longer. Review storage usage regularly.
- Back up the database using the shop's chosen plan/process and test a restore. Store secrets in the owner's password manager. Keep documented access to GitHub, Vercel, Supabase and PhonePe.
- Apply dependency and OS updates on a test installation first. Retest payment and physical printing after provider, printer-driver or agent changes. Keep the previous release available for rollback.

No software-only check can certify merchant approval, settlement, physical output or indefinite uptime. One-time code ownership does not remove cloud, gateway, hardware or support costs. Unsupported advanced print transforms remain preview-only and are rejected by the order API.

## Existing deployment reset

Deleting order/payment history is separate from deploying code. Stop new checkout and the print agent; resolve pending provider sessions; inventory and explicitly confirm deletion scope. Remove documents through the Storage API, not SQL deletion of storage metadata. Delete dependent application records transactionally and preserve shop configuration/pairing. Verify counts after completion. Never run a reset as an automatic startup migration.
