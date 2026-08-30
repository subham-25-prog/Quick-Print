# QuickPrint – New Shop Onboarding & Deployment Guide

This guide describes the complete, repeatable **15-minute onboarding process** for deploying a new customized QuickPrint instance for a specific print shop (e.g. *Royal Xerox*, *Quick Print*, *College Xerox*).

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
│ - Private Bucket: `shop-documents`                          │
│ - Supabase Auth (Shopkeeper Login)                          │
└───────────────────────────┬─────────────────────────────────┘
                            │ (Encrypted Token Auth)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Shop PC: Windows Print Agent (Node.js Daemon)               │
│ - Checks for APPROVED print jobs                            │
│ - Downloads file & dispatches to local printer              │
│ - Marks order as PRINTED                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Setup Checklist

### Step 1: Create a Dedicated Supabase Project
1. Log in to [Supabase](https://supabase.com) and click **New Project**.
2. Name the project after the shop (e.g., `quickprint-royal-xerox`).
3. Set a secure database password and choose the nearest region (e.g., *Mumbai / ap-south-1*).
4. Go to **SQL Editor** -> Click **New query**.
5. Copy and execute [`supabase/schema.sql`](file:///supabase/schema.sql).
6. Copy and execute [`supabase/storage.sql`](file:///supabase/storage.sql).
7. Go to **Project Settings** -> **API** and copy:
   - **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`)
   - **anon / public key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`)

---

### Step 2: Create the Shopkeeper Admin Account
1. In Supabase Dashboard, navigate to **Authentication** -> **Users**.
2. Click **Add user** -> **Create user**.
3. Enter the shopkeeper's email (e.g., `admin@royalxerox.com`) and set a secure initial password.
4. Toggle **Auto Confirm User?** to `ON`.

---

### Step 3: Configure Shop Environment Variables
Create a `.env.production` file for the shop:

```env
# --- Shop Identity ---
NEXT_PUBLIC_SHOP_NAME="Royal Xerox & Cyber Cafe"
NEXT_PUBLIC_SHOP_TAGLINE="Scan, Upload & Print in 30 Seconds"
NEXT_PUBLIC_SHOP_ADDRESS="Shop #4, College Gate Road, Bengaluru, KA 560001"
NEXT_PUBLIC_SHOP_PHONE="+91 98765 43210"
NEXT_PUBLIC_CURRENCY_SYMBOL="₹"
NEXT_PUBLIC_CURRENCY_CODE="INR"

# --- Shopkeeper UPI Details ---
NEXT_PUBLIC_SHOP_UPI_ID="royalxerox@oksbi"
NEXT_PUBLIC_SHOP_UPI_NAME="Royal Xerox"

# --- Supabase Credentials ---
NEXT_PUBLIC_SUPABASE_URL="https://xxxxxxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6..."

# --- Print Agent Shared Secret ---
PRINT_AGENT_SECRET="qp_sec_live_royal_98a72b1c4e5f"

# --- Production URL ---
NEXT_PUBLIC_APP_URL="https://royal-xerox.quickprint.app"
```

---

### Step 4: Deploy the Web Application to Vercel
1. Push the repository to GitHub under a dedicated branch or repository for that shop.
2. In [Vercel](https://vercel.com), click **Add New** -> **Project**.
3. Set the Root Directory to `web`.
4. Add all environment variables from Step 3 into the Vercel project settings.
5. Click **Deploy**.
6. Assign a custom domain or Vercel subdomain (e.g. `royal-xerox.quickprint.app`).

---

### Step 5: Generate & Print the Permanent Static QR Code
1. Open any QR generator (or use the built-in QR tool in the admin portal) pointing to `https://royal-xerox.quickprint.app`.
2. Print a laminated poster for the shop counter / wall displaying:
   - Shop Name
   - "Scan to Print Documents"
   - The Static QR Code
   - Simple 3-step guide: *1. Scan QR -> 2. Upload Document -> 3. Pay & Collect Prints*

---

### Step 6: Install the Windows Print Agent on the Shop PC
1. Copy the `print-agent/` directory to `C:\QuickPrint-Agent` on the shopkeeper's Windows PC.
2. Open PowerShell as Administrator and run:
   ```powershell
   cd C:\QuickPrint-Agent
   npm install
   ```
3. Create `.env` in `C:\QuickPrint-Agent`:
   ```env
   BACKEND_URL=https://royal-xerox.quickprint.app
   PRINT_AGENT_SECRET=qp_sec_live_royal_98a72b1c4e5f
   AGENT_ID=counter-pc-01
   PRINTER_NAME=
   POLL_INTERVAL_MS=3000
   SIMULATE_PRINT=false
   ```
   *(Note: Leave `PRINTER_NAME=` empty to use the Windows Default Printer, or type the exact name from Windows Printers).*

4. Set the agent to start automatically with Windows using PM2:
   ```powershell
   npm install -g pm2 pm2-windows-startup
   pm2-startup install
   pm2 start dist/index.js --name "quickprint-agent"
   pm2 save
   ```

---

### Step 7: Onboarding Verification Checklist

- [ ] **Customer Upload**: Open the shop URL on a mobile phone and upload a test PDF and test image.
- [ ] **Page Detection**: Verify page count auto-detects accurately.
- [ ] **Live Pricing**: Verify option toggles (B&W / Color, Single / Double sided, Copies, Add-ons) calculate rates correctly.
- [ ] **UPI Payment Flow**: Click "Pay via UPI App" and verify it opens GPay / PhonePe with the exact calculated amount and order note.
- [ ] **Admin Queue**: Log in to `/admin` and verify the new order appears in the *Needs Verification* tab.
- [ ] **Approve & Print**: Click *Verify & Approve Print*.
- [ ] **Automatic Print**: Verify the Windows Print Agent claims the job, downloads the PDF, sends it to the printer, and changes status to `PRINTED`.
- [ ] **Customer Status Screen**: Verify the customer's phone updates to `PRINTED & READY`.
