# QuickPrint Local Windows Print Agent

The QuickPrint Local Print Agent runs continuously on the print shop's Windows PC. It securely communicates with the shop's QuickPrint web deployment, detects approved print jobs, automatically downloads the customer files, dispatches them to the configured Windows printer, and marks the order status as `PRINTED`.

---

## Features

- **Atomic Job Claiming**: Prevents duplicate prints across network restarts or race conditions.
- **Direct Windows Spooler**: Dispatches jobs natively to any installed Windows printer (HP, Canon, Epson, Brother, Ricoh, etc.).
- **Live Heartbeat**: Sends health telemetry to the shopkeeper's Admin Dashboard.
- **Dry-Run / Simulation Mode**: Test entire end-to-end workflows without wasting physical paper.
- **Auto Cleanup**: Deletes local temporary files immediately after printing.

---

## Installation on Shop PC

### 1. Prerequisites
- Windows 10 / 11 / Server
- Node.js (v18 or higher) installed
- Printer installed and configured in Windows

### 2. Setup
1. Copy the `print-agent/` folder to the shop PC (e.g. `C:\QuickPrint-Agent`).
2. Open PowerShell or Command Prompt in that directory:
   ```powershell
   cd C:\QuickPrint-Agent
   npm install
   ```

3. Create your `.env` file from `.env.example`:
   ```powershell
   copy .env.example .env
   ```

4. Edit `.env` with the shop's deployment values:
   ```env
   BACKEND_URL=https://royal-xerox.quickprint.app
   PRINT_AGENT_SECRET=qp_sec_live_98a72b1c4e5f603d
   AGENT_ID=counter-pc-01
   PRINTER_NAME=HP LaserJet Pro M404dn
   POLL_INTERVAL_MS=3000
   SIMULATE_PRINT=false
   ```

---

## Running the Agent

### Development / Console Run
```powershell
npm run dev
```

### Dry Run (Simulated Printing)
```powershell
npm run test-print
```

### Production Build & Run
```powershell
npm run build
npm start
```

---

## Setting Up as a Windows Background Service (Auto-Start with Windows)

To ensure the agent starts automatically when the PC powers on, you can use **PM2** or **NSSM**:

### Option A: Using PM2 (Recommended)
```powershell
npm install -g pm2 pm2-windows-startup
pm2-startup install
pm2 start dist/index.js --name "quickprint-agent"
pm2 save
```

### Option B: Using Windows Startup Folder
1. Create a file named `start-agent.bat`:
   ```bat
   @echo off
   cd /d "C:\QuickPrint-Agent"
   npm start
   ```
2. Press `Win + R`, type `shell:startup`, and press Enter.
3. Paste a shortcut to `start-agent.bat` into the Startup folder.
