# Windows agent

Use Node 22 on the shop user's Windows account and the official driver for the selected USB/Wi-Fi/network printer. HP, Canon, Epson and Brother are possible via Windows drivers, but **each driver/model must pass installation acceptance**. No physical hardware was tested in this engineering run.

Run `npm ci`, `npm run build`, configure .env, then `npm start` inside print-agent. AGENT_ID must match web PRINT_AGENT_ID and PRINT_AGENT_SECRET must match exactly. BACKEND_URL is the stable HTTPS origin. Sandbox requires SIMULATE_PRINT=true; live rejects simulation, test jobs and an empty PRINTER_NAME. Select the exact Windows printer name, not a filename such as agent.db.

The agent posts a heartbeat, checks Windows readiness, atomically claims one shop job, downloads its private PDF with a claim token, writes/fsyncs a local dispatch journal, obtains a server start authorization, calls one print engine and acknowledges SUBMITTED. Claims expire only **before** dispatch. A PRINTING job is never automatically reissued.

## Meaning of status

- PENDING / CLAIMED: no physical dispatch is yet authorized.
- PRINTING: dispatch boundary crossed; outcome may be uncertain after a crash.
- SUBMITTED: Windows print command accepted/completed its submission. Not proof of physical paper.
- FAILED: pre-dispatch failure; admin may retry after resolving it.
- REVIEW: possible dispatch; no automatic reprint. Check printer/spooler and the local journal.
- PRINTED is reserved for a future trustworthy completion source; this agent does not fabricate it.

One authorized database job is guaranteed by constraints/transactions. Generic Windows printing cannot guarantee exactly-once **physical** output across a PC crash after spool submission; the design chooses no automatic redispatch in ambiguous cases.

WMI status is driver-dependent. Microsoft documents No Error=2 and warns that some drivers report Idle without feeding accurate status: [Win32_Printer](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-printer). Do not interpret a heartbeat or Idle as physical completion.

## Operations

Health JSON is local only at http://127.0.0.1:9191. It is not exposed on the LAN and does not allow remote printing. Structured logs avoid credentials and document contents.

Keep .env, state/dispatch.jsonl and state/agent.lock protected by the shop user's filesystem permissions. Preserve the journal and state path through restarts/upgrades. Lost completion responses retry acknowledgements only. A corrupt journal stops the agent. Do not clear it to force a reprint.

An agent.lock.acquiring directory left by a crash during lock acquisition requires explicit recovery: verify all agent processes are stopped, preserve the journal, then remove only that empty guard directory. Do not remove a lock from a running process.

After a successful manual run, stop it and execute install_service.ps1. It creates one hidden logon shortcut, not both a service and task. It refuses old startup entries; remove those intentionally after stopping the old agent. Printer access requires the shop user to stay signed in. Re-run npm start visibly for diagnosis.

If a REVIEW job remains, stop automatic recovery attempts, record the job/order/reference, inspect Windows queue and physical output, and reconcile/refund with the owner. There is no unsafe “mark paid” or blind reprint bypass. A crash before start acceptance may also require operator recovery; availability never takes precedence over duplicate-print safety.
