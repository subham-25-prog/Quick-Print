# QuickPrint Windows agent

Read [the agent runbook](../docs/PRINT_AGENT.md) and configure [.env.example](.env.example). Use Node 22, run npm ci, npm run build, then npm start. Sandbox must simulate; live must select a real printer. Preserve the state journal across restarts. SUBMITTED is not proof of physical printing.
