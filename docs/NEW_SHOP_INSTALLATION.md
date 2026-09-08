# Install one independent shop

1. Identify the shop's owner, Windows PC, supported printer and existing merchant provider. Check official API eligibility using MERCHANT_PROVIDER_SETUP.md; a soundbox or static merchant QR is not sufficient.
2. Create shop-owned GitHub/Vercel/Supabase resources or deliver a copy with documented ownership. Use separate resources and secrets for each shop. The current deployment serves one fixed QUICKPRINT_SHOP_ID, never a customer-selected shop.
3. Use Node 22. From the repository root run `npm ci`, then `node scripts/new-shop.mjs --slug abc-xerox --name "ABC Xerox" --url https://abc.example`. Or use `./setup.ps1 -Slug abc-xerox -Name "ABC Xerox" -Url https://abc.example`.
4. The script creates a git-ignored `generated/abc-xerox` directory containing a shop SQL seed, web environment file and agent environment file. It generates independent random security keys, never prints them, and refuses to overwrite existing packages. Protect these files with Windows user-only access and an encrypted password manager. No cloud changes occur.
5. On a FRESH empty Supabase project, run the generated fresh-install.sql once. It combines the tested migration manifest and shop seed; do not separately run shop.sql. For existing installations use the upgrade sequence in DEPLOYMENT.md, never replay the fresh installer. Preserve the generated UUID. Review every rate with the owner.
6. Fill Supabase server credentials and the shop's approved PhonePe sandbox credentials privately in Vercel. Configure the stable website URL. Deploy.
7. Open /admin/settings for branding/pricing and /admin/setup for security, printer and merchant checks. Activate only that shop's configured merchant. If PhonePe credentials are not available yet, leave payment configuration inactive. Static merchant IDs cannot be pasted as substitutes for API credentials.
8. Set up provider webhooks and scheduled recovery. Test notifications, invalid signatures, closed-browser recovery and delayed confirmation.
9. On the Windows PC install the shop printer's current official driver. Print its Windows test page yourself. Install agent dependencies with `npm ci --prefix print-agent` and build with `npm run build --prefix print-agent`.
10. Copy the generated agent file to `print-agent/.env`. Start in sandbox simulation. Confirm the paired agent and sandbox queue in the admin dashboard.
11. Complete official sandbox acceptance before changing both web and agent to live. Use the shop's live API credentials, a live environment, SIMULATE_PRINT=false and an exact PRINTER_NAME. Restart the agent. Live credentials require reactivation in admin settings.
12. Perform a controlled real payment and physical print; check copies, colors, paper tray, duplex, amount, merchant settlement and duplicate callbacks. Confirm retry/review behavior during failure. Do not launch until these pass.
13. Run `print-agent/install_service.ps1` after the manual agent test. It installs one hidden current-user logon shortcut and refuses conflicting old startup entries. Keep the same state folder on upgrades.
14. In `/admin/poster`, confirm the stable domain and print the website QR. NFC stores that same website URL, not a payment QR or private customer link.
15. Hand over the administrator credential, resource ownership, recovery contacts, fee agreement, backup schedule and SHOPKEEPER_GUIDE.md. Do not retain credentials beyond the owner's support agreement.

Your one-time installation fee is separate from the merchant provider's fees, Vercel/Supabase usage, hardware/consumables and ongoing support. Do not promise zero recurring operating costs.
