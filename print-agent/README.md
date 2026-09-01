# QuickPrint Local Windows Print Agent

The QuickPrint Local Print Agent runs continuously on the print shop's Windows PC. It securely communicates with the shop's QuickPrint web deployment, detects approved print jobs, automatically downloads customer files, dispatches them to the configured Windows printer, and marks the order status as `PRINTED`.

---

## Key Features

- **Zero-Config Printer Detection**: Automatically queries Windows WMI/spooler for all connected USB and network printers.
- **Local Health Dashboard**: Built-in HTTP health server running at **`http://localhost:9191`** for the shopkeeper to view live agent health, active printer status, and real-time job logs.
- **Atomic Job Claiming**: Prevents duplicate prints across network restarts or race conditions.
- **Direct Windows Spooler**: Dispatches jobs natively to any installed Windows printer (HP, Canon, Epson, Brother, Ricoh, etc.).
- **Automated Windows Auto-Start**: Includes `install_service.ps1` script to auto-start agent silently when Windows boots up.
- **Dry-Run / Simulation Mode**: Test entire end-to-end workflows without wasting physical paper (`--simulate`).

---

## 1-Command Onboarding & Installation

### 1. Prerequisites
- Windows 10 / 11 / Server PC connected to the printer
- Node.js (v18 or higher) installed

### 2. Setup
1. Copy the `print-agent/` folder to `C:\QuickPrint-Agent` on the shop PC.
2. Run automated service installer:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install_service.ps1
   ```

3. Configure environment (`.env`):
   ```env
   BACKEND_URL=https://royal-xerox.quickprint.app
   PRINT_AGENT_SECRET=qp_sec_live_98a72b1c4e5f
   AGENT_ID=counter-pc-01
   PRINTER_NAME=
   POLL_INTERVAL_MS=3000
   SIMULATE_PRINT=false
   ```
   *(Note: Leave `PRINTER_NAME=` empty to use the Windows Default Printer, or specify printer name).*

---

## Local Health Dashboard

Open **`http://localhost:9191`** in any browser on the shop PC to view:
- **Agent Status**: ONLINE / HEALTHY
- **Connected Printer**: Active Windows printer name
- **Processed Jobs Counter**: Total prints completed & errors
- **Real-Time Job Log**: Order #, document name, status timestamps

---

## Running the Agent Manually

```powershell
# Development run
npm run dev

# Dry Run / Simulated Printing (no physical paper used)
npm run test-print

# Production Run
npm start
```
