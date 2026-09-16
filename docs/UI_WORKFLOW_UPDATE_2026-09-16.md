# UI and workflow improvements — 2026-09-16

Implemented:
- Simplified customer ordering with clear steps and an itemized summary.
- Removed developer promotion cards from customer and shopkeeper pages.
- Added inline checkout validation, input limits, and empty-file checks.
- Reset page selection when changing documents to avoid carrying stale ranges.
- Added keyboard focus containment and Escape handling to payment selection.
- Added visible keyboard focus, mobile form sizing, and reduced-motion support.
- Replaced simulated print progress with server-reported states. SUBMITTED means sent to the printer, not proof of physical printing.
- Added admin logout failure handling and active navigation semantics.

Validation is local. Browser tests use API fixtures; they do not establish merchant settlement, deployed database readiness, or physical printer compatibility. The local customer page reported unavailable shop pricing during inspection and correctly prevented checkout.

Before declaring the installation production-ready, complete the existing live acceptance checklist in docs/HANDOVER_ACCEPTANCE.md with the shop database, merchant account, webhook, and physical printer.
