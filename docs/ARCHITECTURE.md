# QuickPrint System Architecture

## End-to-End System Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer (Mobile Phone)
    participant NextApp as Web Application (Next.js / Vercel)
    participant DB as Supabase PostgreSQL & Storage
    actor Shopkeeper as Shopkeeper (Admin Dashboard)
    participant Agent as Windows Print Agent (Shop PC)
    participant Printer as Windows Physical Printer

    Customer->>NextApp: Scans QR code & opens Shop URL
    Customer->>NextApp: Uploads PDF/Image & selects Print Options
    NextApp->>NextApp: Calculates live price (Pages × Rate × Copies + Add-ons)
    Customer->>NextApp: Chooses UPI or Cash & submits Order
    NextApp->>DB: Saves Order with exact pricing snapshot
    NextApp-->>Customer: Shows Order Number (QP-XXXX) & Live Status Screen

    Shopkeeper->>NextApp: Views Order in Admin Queue & verifies payment
    Shopkeeper->>NextApp: Clicks "Verify & Approve Print"
    NextApp->>DB: Updates order status to APPROVED & inserts into print_jobs

    loop Polling / Heartbeat
        Agent->>NextApp: Claims approved job (claim_next_print_job RPC)
    end

    NextApp->>DB: Locks job atomically & updates status to PRINTING
    NextApp-->>Agent: Returns signed download URL & print parameters
    Agent->>DB: Downloads document securely
    Agent->>Printer: Dispatches document to Windows spooler
    Printer-->>Agent: Print spool completed
    Agent->>NextApp: Reports job completion (POST /api/agent/complete)
    NextApp->>DB: Updates order status to PRINTED
    NextApp-->>Customer: Live Status Screen updates to PRINTED & READY!
```

---

## State Transition Diagram

```mermaid
stateDiagram-v2
    [*] --> PAYMENT_VERIFICATION_PENDING: Customer Submits Order
    PAYMENT_VERIFICATION_PENDING --> REJECTED: Shopkeeper Declines
    PAYMENT_VERIFICATION_PENDING --> CANCELLED: Customer/Admin Cancels
    PAYMENT_VERIFICATION_PENDING --> APPROVED: Shopkeeper Verifies Payment
    
    APPROVED --> PRINTING: Print Agent Claims Job
    PRINTING --> FAILED: Printer Spooler Failure / Offline
    FAILED --> APPROVED: Admin Clicks Retry
    PRINTING --> PRINTED: Spooling Succeeded
    PRINTED --> [*]
```

---

## Security Model

1. **Storage Isolation**: Customer documents are stored in private Supabase Storage buckets (`shop-documents`).
2. **Signed URLs**: Temporary signed URLs (expires in 5–60 minutes) are generated only when required by the print agent or admin preview.
3. **Agent Authentication**: Print agent calls are authorized via secret token (`PRINT_AGENT_SECRET`), preventing unauthorized job access or spoofing.
4. **Idempotency**: Atomic PostgreSQL row locks (`FOR UPDATE SKIP LOCKED` inside `claim_next_print_job`) guarantee no job is ever printed twice even during network hiccups or agent restarts.
