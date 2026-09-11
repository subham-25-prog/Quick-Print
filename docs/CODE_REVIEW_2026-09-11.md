# Code cleanup and verification — 11 September 2026

Reviewed the web application, API and database access helpers, authentication, payment integration, print agent, and test configuration using source inspection, compiler checks, automated tests, and a production build. This is not proof that every production path is error-free.

## Changes

- Removed compiler-identified unused imports, UI state, unused props, and calculations.
- Fixed the status-page nullable access-token type error and existing lint errors.
- Enabled TypeScript unused-local and unused-parameter checks.
- Avoided redundant pricing requests and browser subscriptions when a parent supplies the shop name. Initial rendering no longer reads local storage, avoiding server/client name mismatches.
- Batched heartbeat printer persistence into one upsert, with errors propagated. Printer listing filters virtual printers without performing deletion or a duplicate read.
- Disabled development admin credential fallbacks in production and removed the hard-coded agent secret fallback. Production requires ADMIN_PIN (at least 4 characters), ADMIN_SESSION_SECRET (at least 16 characters), and PRINT_AGENT_SECRET (at least 32 characters).
- Included the previously skipped pricing assertions in Vitest and added authentication and printer persistence regression tests.
- Updated browser expectations to match the existing payment redirects and current UI text, retaining checkout, payment authority, offline-agent, and mobile layout checks.

## Verification

- ESLint: passed.
- Web TypeScript, including unused-code checks: passed.
- Unit, API, agent, and local PostgreSQL tests: 74 passed across 12 files.
- Next.js production build: passed.
- Print-agent TypeScript build: passed.
- Mobile Chromium: all 5 scenarios reported passing; inspected the generated order-status screenshot. The runner hung during local server shutdown and was interrupted after the scenarios completed.
- Git whitespace check: passed.

Browser payment responses were fixtures, and database tests used local PGlite. No real charge, physical print, live database migration, or deployment was performed. Reduced request counts are verified by code and regression tests; production latency has not been benchmarked.
