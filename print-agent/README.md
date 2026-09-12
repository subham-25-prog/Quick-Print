# QuickPrint Windows agent

Read [the agent runbook](../docs/PRINT_AGENT.md) and configure [.env.example](.env.example). Use Node 22, run npm ci, npm run build, then npm start. Sandbox must simulate; live must select a real printer. Preserve the state journal across restarts. SUBMITTED is not proof of physical printing.

Printer discovery runs at every heartbeat (15 seconds by default), including in simulation mode. Only Windows physical printer queues are reported, with their offline/error status. Install the printer's Windows driver and keep the agent running under the Windows user who can access it. The settings page refreshes every five seconds.

`PRINTER_NAME` is optional: with no preference, the agent initially uses the available physical Windows default or first available physical printer. A saved dashboard selection takes precedence. Switching applies between jobs; an unavailable selected printer never silently redirects documents to another printer. The dashboard shows a pending selection until a later heartbeat confirms it. Upgrade both the website and agent, rebuild the agent, and restart it while idle, keeping its journal and state directory.
