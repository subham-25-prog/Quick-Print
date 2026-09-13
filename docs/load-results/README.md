# Local load results — 13 September 2026

Executed successfully on Node 22.22.2, Intel i5-1135G7, 8 logical CPUs, 7.7 GB RAM. The Vitest run took 23.37 seconds, including setup/imports. All 5,800 measured operations passed across ten scenarios.

| Scenario | Operations | In flight | Operations/sec | p95 latency |
|---|---:|---:|---:|---:|
| Database payment finalization | 1,000 | 25 | 517 | 59.89 ms |
| Repeated payment finalization (duplicate callbacks) | 1,000 | 50 | 1,350 | 49.45 ms |
| Database claim/start/acknowledge lifecycle | 1,000 | 25 | 325 | 94 ms |
| Database rate-limit decisions | 1,000 | 100 | 2,144 | 49.39 ms |
| Parse 10-page PDF | 500 | 1 | 1,935 | 1.11 ms |
| Parse 10-page PDF | 500 | 10 | 2,244 | 10.60 ms |
| Parse 10-page PDF | 500 | 50 | 1,417 | 66.70 ms |
| Parse 1,000-page PDF | 100 | 1 | 48 | 31.12 ms |
| Parse 1,000-page PDF | 100 | 10 | 68 | 157.99 ms |
| Parse 1,000-page PDF | 100 | 50 | 70 | 730.16 ms |

p95 means 95% of measured operations finished within that time. Maximum sampled process RSS was 478 MB; sampling at completion does not capture every transient peak and includes the test runtime/database.

Correctness assertions confirmed exactly 1,000 orders and jobs after duplicate callbacks, 1,000 unique claims, all jobs reaching SUBMITTED, and exactly 10 allowed decisions out of a 1,000-attempt rate-limit burst with a limit of 10.

## Interpretation and limits

These are local component measurements, not customer requests per second or printer pages per minute. Actual application SQL migrations and PDF page-counting code ran. PGlite uses an embedded PostgreSQL engine with a serialized connection: concurrent callers queue locally; this does not validate cross-session locking or Supabase performance. The payment provider and Windows agent were not invoked. No live data was modified.

The generated PDFs contain blank pages (666 bytes and 13,376 bytes), so results do not establish capacity for scanned, image-heavy, encrypted or 100 MB documents. Tests do not measure HTTP routing, browser checkout, uploads, storage, merchant latency, deployment limits, printer hardware, or long-duration stability. This is one short run, not a statistically established capacity ceiling.

For the 1,000-page fixture, concurrency 50 provided little throughput improvement over 10 while increasing p95 latency about 4.6 times. More simultaneous processing does not imply proportionally more throughput.

## Repeat

From the repository root, in PowerShell:

```powershell
$env:QUICKPRINT_LOAD_TEST='1'
npm test --workspace web -- --run tests/load.test.ts
Remove-Item Env:QUICKPRINT_LOAD_TEST
```

The opt-in test creates an isolated in-memory database and writes `docs/load-results/local-load.json`. It is skipped in ordinary test runs. The JSON is overwritten on each run; this document records the initial run.
