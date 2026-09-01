# QuickPrint – Production New Shop Onboarding & Deployment Guide

This guide describes the plug-and-play **10-minute onboarding process** for deploying a production-grade QuickPrint instance for a new print shop (e.g. *Royal Xerox*, *Quick Print*, *College Xerox*).

---

## Architecture Overview for Each Shop

Each print shop receives its own isolated stack:
```
┌─────────────────────────────────────────────────────────────┐
│ Customer Phone (Scans Shop Wall QR Code)                    │
└───────────────────────────┬─────────────────────────────────┘
                            │ (Opens Shop URL)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Isolated Web App (Vercel / Next.js)                         │
│ - Shop Branding & Rates                                     │
│ - Live Price Calculation & UPI Deep Link                    │
│ - Shopkeeper Admin Dashboard                                │
└───────────────────────────┬─────────────────────────────────┘
                            │ (Database & Private Storage)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Dedicated Supabase Project                                  │
│ - PostgreSQL DB & Row Level Security                        │
│ - Private Bucket: `shop-documents` (Signed URL Access)     │
│ - Supabase Auth (Shopkeeper Login)                          │
└───────────────────────────┬─────────────────────────────────┘
                            │ (Encrypted Token Auth)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Shop PC: Windows Print Agent (Node.js Daemon)               │
│ - Auto-detects connected Windows printers                  │
│ - Serves Health Dashboard at http://localhost:9191          │
│ - Downloads file & dispatches to local printer              │
│ - Marks order as PRINTED                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## ⚡ 1-Command Automated Onboarding

On the shop PC or developer terminal, run the automated setup wizard:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

### What `setup.ps1` Configures Automatically:
1. Prompts for Shop Name, Tagline, Address, Phone, UPI ID, Payee Name, Supabase URL, and API Keys.
2. Generates `web/.env.local`, `web/.env.production`, and `print-agent/.env`.
3. Updates `shop.config.json` with shopkeeper details.
4. Verifies database connectivity.
5. Installs all required NPM dependencies for the web app and Print Agent.

---

## Step-by-Step Manual Deployment Checklist

### Step 1: Create Supabase Project & Run Migrations
1. Log in to [Supabase](https://supabase.com) and click **New Project**.
2. Go to **SQL Editor** -> Execute [`supabase/schema.sql`](file:///supabase/schema.sql).
3. Execute [`supabase/storage.sql`](file:///supabase/storage.sql).
4. Copy Project URL, Anon Key, and Service Role Key.

---

### Step 2: Deploy Web App to Vercel
1. Push repository to GitHub.
2. In [Vercel](https://vercel.com), click **Add New Project**, set root to `web`.
3. Paste all environment variables from `web/.env.production`.
4. Click **Deploy**.

---

### Step 3: Configure Print Agent on Shop PC
1. Copy `print-agent/` to `C:\QuickPrint-Agent`.
2. Run automated service installer:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install_service.ps1
   ```
3. Verify agent dashboard at **`http://localhost:9191`**.

---

## Onboarding Verification Checklist

- [ ] **Automated Onboarding**: Run `setup.ps1` and verify `.env` files are generated cleanly.
- [ ] **Pricing Unit Test**: Run `npx tsx lib/__tests__/pricing.test.ts` in `web/` to confirm rate calculations and snapshot immutability.
- [ ] **Customer Upload**: Upload test PDF on mobile. Verify page count detection.
- [ ] **UPI Payment**: Test UPI deep links & manual VPA copy fallback card.
- [ ] **Admin Verification**: Approve print in `/admin`.
- [ ] **Automatic Spooling**: Verify Print Agent prints document and updates status to `PRINTED`.
- [ ] **Health Dashboard**: Open `http://localhost:9191` to confirm active printer health & log telemetry.
