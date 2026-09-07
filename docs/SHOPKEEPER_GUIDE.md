# Shopkeeper guide

- Keep the shop PC signed in, agent running, network connected, and printer loaded.
- Customers scan the **website QR**, upload PDF/JPG/PNG (up to 4 MB), choose paper/copies, and pay.
- A payment-app return is not confirmation. Only backend verification creates an order.
- A queued paid order prints automatically when the paired computer/printer is available.
- “Sent to printer” means submitted to Windows; check the physical output before handing it over.
- Open /admin with your administrator password for recent orders, payment status, agent status and pricing.
- Failed **pre-dispatch** jobs can be retried after fixing the printer. REVIEW jobs may already have printed: inspect first and contact your installer.
- Never accept screenshots, a customer pressing “I paid,” or UTR text as automatic print authorization.
- Keep private customer links and documents confidential. The scheduled retention job removes eligible documents, not financial records.
- Settings changes apply to new checkouts. Already-created payment sessions retain their original price.
- Changing printer requires updating PRINTER_NAME on the PC and restarting the agent.
- Contact your payment provider for settlement/refunds and the installer for software issues. Your one-time software purchase does not remove provider/cloud/consumable costs.
