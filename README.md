# QuickPrint – Self-Service Print Shop System (Master Template)

QuickPrint is a self-service document printing platform designed as a reusable **master template** for isolated, single-tenant print shop deployments (e.g. Royal Xerox, Quick Print, College Xerox).

---

## Key Architecture Principles

1. **Tenant-safe per Print Shop**: Every shop can run as an isolated deployment with its own database, storage bucket, credentials, pricing, payment account, and local Windows print agent. The shared-code database foundation also scopes operational data by a server-only shop ID.
2. **Instant Mobile-First Flow**: Customers enter the shop, scan the static wall QR code, upload PDF/images, select print options, see live price breakdowns, and pay via UPI or Cash.
3. **Verified payment only**: Automatic printing is permitted only after server-side gateway verification. A direct UPI link, customer message, screenshot, soundbox alert, or browser redirect is never payment proof.
4. **Autonomous Windows Print Agent**: Node.js/TypeScript background service running on the shop PC that atomically claims approved jobs and sends documents directly to the local printer spooler.
5. **Historical Pricing Snapshots**: Pricing adjustments made in the Admin Dashboard apply strictly to future orders; previous orders retain their exact creation snapshots.

---

## Directory Structure

```
QuickPrint/
├── web/                       # Next.js 14 App Router Web Application
│   ├── app/                   # Customer routes, Admin portal & API endpoints
│   ├── components/            # Customer & Admin UI components
│   ├── lib/                   # Pricing engine, PDF parser, Supabase & Store
│   ├── types/                 # Comprehensive TypeScript type definitions
│   └── package.json
│
├── print-agent/               # Windows Local Print Agent
│   ├── src/                   # Agent daemon, Windows spooler, API client
│   ├── package.json
│   └── README.md              # Installation & Service guide for Shop PC
│
├── supabase/
│   ├── schema.sql             # PostgreSQL schema, atomic claim RPC, RLS
│   └── storage.sql            # Private storage bucket & access policies
│
├── docs/
│   ├── NEW_SHOP_SETUP.md      # 15-Minute New Shop Onboarding Checklist
│   └── ARCHITECTURE.md        # System architecture and data flow diagrams
│
└── README.md
```

---

## Quick Start (Local Development)

### 1. Run the Web Application
```powershell
cd web
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) for Customer View, and [http://localhost:3000/admin](http://localhost:3000/admin) for Shopkeeper Dashboard.

### 2. Run the Print Agent (Simulation Mode)
```powershell
cd print-agent
npm install
npm run test-print
```

---

## Deploying for a New Print Shop

See [`docs/NEW_SHOP_SETUP.md`](file:///docs/NEW_SHOP_SETUP.md) for the complete 15-minute deployment guide.
