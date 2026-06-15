# Skillink — Strict Milestone Escrow System

## What This Is

This document covers the complete escrow milestone system added to Skillink. It explains what was built, why each decision was made, and how the pieces fit together. It is written for developers who need to understand, debug, extend, or operate this system.

---

## The Problem We Solved

The original Skillink platform had milestones with four statuses (`pending`, `revision_requested`, `approved`, `paid`) and no enforcement logic. There was nothing preventing:

- A freelancer submitting work before the client had deposited any funds
- A client rejecting work indefinitely with no limit
- Funds being double-released if two requests landed at the same millisecond
- Funds sitting frozen forever if either party stopped responding

The new system replaces this with a strict, auditable, time-enforced escrow workflow.

---

## Architecture Overview

```
Client Browser
     │
     ▼
FastAPI  ──→  routers/milestone_escrow_router.py  (dumb HTTP layer)
                         │
                         ▼
             services/milestone_state_machine.py  (all logic lives here)
                    │           │
                    ▼           ▼
               PostgreSQL    services/notification_service.py
               (row-locked        (fires AFTER commit)
                transactions)
                    ▲
                    │
run_worker.py  ──→  workers/milestone_worker.py
(standalone         (APScheduler, FOR UPDATE SKIP LOCKED)
 process)
```

The web server and the background worker run as **separate processes**. They share the same PostgreSQL database but never share memory or scheduler state.

---

## How Money Flows

```
Client funds milestone
        │
        ▼
  escrow_transactions (type=fund)
        │
  [work submitted → reviewed → approved]
        │
        ▼
  Freelancer.wallet_balance  +=  milestone.amount
  escrow.released_amount     +=  milestone.amount
  escrow_transactions (type=release)
  WalletTransaction (type=deposit)
```

On a refund:
```
  escrow_transactions (type=refund)
  [actual money movement handled by payment gateway outside Skillink]
```

Every money event creates an immutable `EscrowTransaction` row. These rows are never updated — they are the permanent audit log.

---

## State Machine

### States

| State | Meaning |
|---|---|
| `awaiting_funds` | Initial state. Freelancer workspace locked. |
| `funded` | Client deposited funds. Escrow locked. Freelancer can start. |
| `in_review` | Freelancer submitted deliverables. Client must act. |
| `in_revision` | Client rejected with feedback. Freelancer must resubmit. Max 2 allowed. |
| `in_dispute` | Max revisions hit, or a party escalated. Admin must resolve. |
| `closed_success` | Client approved, or admin ruled for freelancer. Funds released. |
| `closed_refunded` | Admin ruled for client, or mutual cancellation. Funds returned. |
| `closed_auto_approve` | Client ghosted for 7 days. Funds auto-released to freelancer. |
| `closed_auto_refund` | Freelancer missed deadline by 5 days. Funds auto-returned to client. |

### Allowed Transitions

```
awaiting_funds ──→ funded
funded         ──→ in_review
                   closed_auto_refund
in_review      ──→ in_revision
                   closed_success
                   in_dispute
                   closed_auto_approve
                   closed_refunded
in_revision    ──→ in_review
                   in_dispute
in_dispute     ──→ closed_success
                   closed_refunded
```

Terminal states (`closed_*`) have no outbound transitions. Any attempt to transition out of a terminal state raises `HTTP 400`.

### How Transitions Are Enforced

All transitions go through `MilestoneStateMachine.transition()` in `services/milestone_state_machine.py`. The router calls this function — it does no logic itself.

The function:
1. Reads parent IDs (contract, freelancer) without locking
2. Acquires row locks in **Parent → Child order**: Freelancer → Escrow → Milestone
3. Validates the transition is allowed
4. Validates the actor has the right role
5. Executes side effects (wallet credit, EscrowTransaction, WalletTransaction, SystemLog)
6. Saves the idempotency key atomically with the state change
7. Calls `db.commit()`
8. Fires notifications **after** the commit

### Why the Lock Order Matters

The `POST /wallet/withdraw` endpoint locks the Freelancer row first, then queries milestones. If `transition()` locked Milestone first and then Freelancer, any simultaneous withdrawal would cause a classic deadlock — PostgreSQL would kill one of the transactions. By always locking **Freelancer → Escrow → Milestone**, both code paths acquire locks in the same order and never cross.

### Why Notifications Fire After Commit

If `notify()` were called before `db.commit()` and the commit then failed (network drop, constraint violation), the database rolls back but the email has already been sent. The user gets an email about a state that doesn't exist in the database. By calling `notify()` strictly after a successful commit, this is impossible. A failed notification after a successful commit is recoverable (resend); the reverse is not.

### Why Relationship Fields Are Extracted Before Commit

After `db.commit()`, SQLAlchemy detaches ORM objects from the session. Accessing `milestone.contract.freelancer.user_id` on a detached object triggers a lazy load, which fails. The transition function eager-loads all needed relationships (using `joinedload`) and extracts `freelancer_user_id`, `client_user_id`, `m_title` into local variables before committing. These local variables are then passed to `notify()` after the commit.

### Revision Cap

The cap is enforced in the state machine, not in the router. At the `in_review → in_revision` transition:

```python
if milestone.revision_count >= 2:
    raise HTTPException(400, "Maximum revisions (2) reached. Use /escalate instead.")
```

The client physically cannot reject a third time via the normal endpoint. Their only option is `/escalate`, which opens a dispute for admin resolution.

---

## Milestone Splitting

When a client calls `POST /contracts/{id}/auto-split`, the service `services/milestone_service.py` applies these rules:

| Budget | Split |
|---|---|
| < $500 | 2 milestones: 50% / 50% |
| $500–$3,000 | 3 milestones: 30% / 40% / 30% |
| > $3,000 | `ceil(budget / 1500)` milestones, each capped at $1,500; last absorbs remainder |

The splitting logic is a pure function with no database calls. It uses Python's `Decimal` type to prevent floating-point rounding errors in percentage calculations.

Each created milestone starts in `awaiting_funds`. Milestones are spaced 2 weeks apart via the `deadline` field.

---

## Idempotency

Financial endpoints (`/fund`, `/approve`, `/admin/resolve`) require an `Idempotency-Key` header containing a UUID generated by the frontend client. On the backend:

1. Before calling the state machine, the router checks `IdempotencyLog` for the key.
2. If the key exists, the endpoint returns the current milestone state and does nothing.
3. If the key is new, the state machine saves it to `IdempotencyLog` **in the same `db.commit()`** as the state change.

Because the key is saved atomically with the state change, a failed commit means the key is not saved. A retry will be processed as a new request, which is the correct behaviour. A successful commit saves both the state change and the key together, blocking all future retries.

**Frontend responsibility:** Generate `crypto.randomUUID()` once before sending a financial action and reuse that UUID on retries for the same action (store it in component state until the server confirms success).

---

## Background Workers

### Why a Separate Process

Uvicorn runs multiple worker processes (`--workers 4`). If APScheduler were started inside the FastAPI lifespan, each process would start its own scheduler, resulting in 4 simultaneous job executions every hour. This causes duplicate state transitions, duplicate wallet credits, and duplicate notification emails.

The scheduler runs in `run_worker.py` as a completely separate process — typically as a separate Docker service with a single instance.

### Job Concurrency: FOR UPDATE SKIP LOCKED

Each worker job does two steps:

**Step 1 — Grab a non-conflicting batch (short session):**
```python
with SessionLocal() as db:
    stale_ids = db.scalars(
        select(Milestone.milestone_id)
        .where(...)
        .with_for_update(skip_locked=True)
        .limit(50)
    ).all()
```

`SKIP LOCKED` means rows that are locked by another worker are automatically skipped. Multiple worker containers can run without ever processing the same milestone.

**Step 2 — Process each ID in its own transaction:**
```python
for m_id in stale_ids:
    with SessionLocal() as db:
        try:
            state_machine.transition(milestone_id=m_id, ...)
        except Exception as exc:
            logger.warning(...)
```

Each milestone gets its own session and transaction. One failure doesn't abort the batch.

**Why not advisory locks?**
A `pg_try_advisory_xact_lock` releases the moment the first `db.commit()` inside the loop is called. All subsequent milestones in the loop run completely unprotected. `SKIP LOCKED` isolates at the row level instead of the job level, and is the correct pattern for batch workers.

### The Three Jobs

| Job | Trigger | Action |
|---|---|---|
| `check_auto_approve` | `IN_REVIEW` for > 7 days | Transition to `CLOSED_AUTO_APPROVE` — freelancer gets funds |
| `check_auto_refund` | `FUNDED`, deadline passed > 5 days, no submission | Transition to `CLOSED_AUTO_REFUND` — client gets funds back |
| `check_stale_awaiting_funds` | `AWAITING_FUNDS` for > 48 hours | Send reminder notification to client (no state change) |

All jobs run every hour.

---

## Database Migration

### Why Alembic

The previous approach ran raw SQL from `main.py`'s startup handler. This caused two problems:

1. **Race conditions:** In a multi-instance deployment, every starting instance runs migrations simultaneously against the same database.
2. **No version control:** There was no record of which schema changes had been applied. Cloning the repo and starting fresh would fail silently.

The new system uses Alembic. Migrations are run as a separate step before the app starts (e.g., Docker entrypoint: `alembic upgrade head && uvicorn ...`).

### Why `autocommit_block()` for ENUM Changes

PostgreSQL requires `ALTER TYPE ... ADD VALUE` to run outside any transaction block. Alembic wraps its `upgrade()` function in a `BEGIN ... COMMIT` by default. Manually calling `COMMIT` inside `upgrade()` fractures the transaction and can leave the `alembic_version` table out of sync with the actual schema.

The correct pattern is Alembic's native `autocommit_block()` context manager:

```python
with op.get_context().autocommit_block():
    op.execute("ALTER TYPE milestonestatus ADD VALUE IF NOT EXISTS 'awaiting_funds'")
```

Standard DDL (column additions, table creation) runs outside the `autocommit_block()` in the normal transaction.

### Migration Order

The `escrow_transactions` table must be created **before** the `milestones.escrow_transaction_id` FK column is added. Reversing this order causes a FK constraint violation and crashes the deployment. The migration explicitly comments this dependency.

---

## Currency Precision

All financial amounts in the new code use `Numeric(precision=10, scale=2)` (mapped to PostgreSQL `NUMERIC(10, 2)`), not `Float`. 

`Float` uses IEEE 754 binary floating-point, which cannot represent many decimal fractions exactly (`0.10 + 0.20 = 0.30000000000000004`). For the percentage split in admin arbitration and for escrow ledger reconciliation, this causes the ledger to fail to balance by fractions of a cent. `NUMERIC` uses exact decimal arithmetic.

The existing `Milestone.amount` and `Escrow.amount` columns remain `Float` for backward compatibility. New columns and `EscrowTransaction.amount` use `NUMERIC`.

---

## API Endpoints

All new endpoints live under `routers/milestone_escrow_router.py` and are registered in `main.py`.

### `POST /milestones/{id}/fund`
**Role:** Client  
**Header:** `Idempotency-Key: <uuid>`  
**Body:** `{ "payment_reference": "optional-string" }`  
**Transitions:** `awaiting_funds → funded`  
**Side effects:** Creates `EscrowTransaction(type=fund)`, sets `funded_at`, notifies freelancer.

### `POST /milestones/{id}/submit`
**Role:** Freelancer  
**Body:** `{ "submission_note": "optional-string" }`  
**Transitions:** `funded → in_review` OR `in_revision → in_review` (resubmit)  
**Side effects:** Sets `submitted_at`, notifies client.

### `POST /milestones/{id}/approve`
**Role:** Client  
**Header:** `Idempotency-Key: <uuid>`  
**Transitions:** `in_review → closed_success`  
**Side effects:** Releases funds to freelancer wallet, creates `EscrowTransaction(type=release)`, `WalletTransaction`, `SystemLog`, notifies freelancer.

### `POST /milestones/{id}/reject`
**Role:** Client  
**Body:** `{ "feedback": "required, 10–1000 chars" }`  
**Transitions:** `in_review → in_revision`  
**Side effects:** Increments `revision_count`, stores feedback. Blocked if `revision_count >= 2` — client must `/escalate` instead.

### `POST /milestones/{id}/escalate`
**Role:** Either party  
**Transitions:** `in_review → in_dispute` OR `in_revision → in_dispute`  
**Side effects:** Notifies both parties.

### `POST /milestones/{id}/admin/resolve`
**Role:** Admin only  
**Header:** `Idempotency-Key: <uuid>`  
**Body:** `{ "resolution": "force_pay|force_refund|split", "split_percentage": 0-100, "note": "optional" }`  
**Transitions:** `in_dispute → closed_success` (force_pay or split) or `in_dispute → closed_refunded` (force_refund)  
**Side effects:** All math and DB writes happen in `MilestoneStateMachine.resolve_arbitration()` — zero logic in the router. Writes `SystemLog`.

### `POST /contracts/{id}/auto-split`
**Role:** Client or Admin  
**Transitions:** Creates new milestones in `awaiting_funds`  
**Guard:** Contract must be `active` with no existing new-style milestones. Cannot split twice.

### `GET /milestones/{id}/escrow`
**Role:** Any authenticated user  
Returns `MilestoneDetailResponse` with all new fields.

---

## Frontend

### Route
`/contract/:contractId/escrow` → `MilestoneEscrowPage.tsx`

Accessible from the existing ContractPage via the "Manage Escrow Milestones →" button in the contract actions panel.

### Status Colors

| Status | Color |
|---|---|
| `awaiting_funds` | Grey (sub) |
| `funded` | Purple (accent) |
| `in_review` | Blue |
| `in_revision` | Orange |
| `in_dispute` | Red |
| `closed_success` / `closed_auto_approve` | Green |
| `closed_refunded` / `closed_auto_refund` | Grey |

### Action Buttons by Role and Status

| Status | Client sees | Freelancer sees | Admin sees |
|---|---|---|---|
| `awaiting_funds` | Fund Milestone | "Waiting for client…" | — |
| `funded` | "Freelancer working…" | Submit Work | — |
| `in_review` | Approve + Request Revision | "Awaiting client review…" | — |
| `in_revision` | "Waiting for resubmission…" | Resubmit Work | — |
| `in_dispute` | Escalate (already done) | Escalate (already done) | Resolve Dispute |
| closed | — | — | — |

Escalate to Dispute is available to both client and freelancer from `in_review` and `in_revision` states.

### Idempotency on the Frontend

For financial actions (Fund, Approve, Admin Resolve), the modals generate a `crypto.randomUUID()` at call time and include it as the `Idempotency-Key` header. This prevents double-charges on browser retries or double-clicks.

---

## What Was Not Changed

- The original `pending`, `revision_requested`, `approved`, `paid` milestone statuses remain in the enum for backward compatibility with existing rows.
- The original `PUT /milestones/{id}/status` endpoint still works for legacy milestones. New-style milestones (any of the 9 new statuses) are rejected by this endpoint with a clear error message.
- The `POST /contracts/{id}/complete` endpoint now accepts `closed_success` and `closed_auto_approve` as "done" states in addition to `paid`.
- No changes were made to `ClientDashboard.tsx`, `AdminDashboard.tsx`, or `FreelancerDashboard.tsx`.

---

## Files Changed / Created

### Backend (`D:\Skilllink\Skilllink-backend`)

| File | Type | Description |
|---|---|---|
| `requirements.txt` | Modified | Added `APScheduler==3.10.4`, `alembic==1.13.1` |
| `models.py` | Modified | New enums, `EscrowTransaction`, `IdempotencyLog`, 5 new `Milestone` columns |
| `schema.py` | Modified | Mirrored new statuses, 6 new request/response schemas |
| `main.py` | Modified | Registers `milestone_escrow_router` |
| `routers/contract_router.py` | Modified | Legacy endpoint guard, `complete_contract` fix |
| `alembic.ini` | Created | Alembic configuration |
| `alembic/env.py` | Created | Uses `DATABASE_URL` env var, imports all models |
| `alembic/script.py.mako` | Created | Revision template |
| `alembic/versions/0001_milestone_escrow.py` | Created | Full migration with `autocommit_block()` |
| `services/milestone_service.py` | Created | Pure milestone splitting logic |
| `services/milestone_state_machine.py` | Created | Full state machine, locking, arbitration |
| `workers/__init__.py` | Created | Package marker |
| `workers/milestone_worker.py` | Created | APScheduler jobs with SKIP LOCKED |
| `run_worker.py` | Created | Standalone worker process entry point |
| `routers/milestone_escrow_router.py` | Created | 7 API endpoints |

### Frontend (`D:\Skilllink\Skilllink-Frontend`)

| File | Type | Description |
|---|---|---|
| `src/pages/MilestoneEscrowPage.tsx` | Created | Full escrow workflow page |
| `src/pages/ContractPage.tsx` | Modified | 9 new status colors, "Manage Escrow →" button |
| `src/App.tsx` | Modified | `/contract/:contractId/escrow` route |

---

## Deployment

### First-time setup (running the migration)

```bash
# From inside the backend container or with DATABASE_URL set:
alembic upgrade head
```

This applies the ENUM additions, new columns, `escrow_transactions` table, and `idempotency_logs` table.

### Docker Compose (recommended)

Add a `worker` service to your `docker-compose.yml`:

```yaml
worker:
  build: ./Skilllink-backend
  command: python run_worker.py
  environment:
    - DATABASE_URL=postgresql://skillink_user:password123@db:5432/skillink_db
  depends_on:
    - db
  restart: unless-stopped
```

Add migration to the `api` service entrypoint:

```yaml
api:
  command: sh -c "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"
```

---

## Testing the System

Manual verification flow:

1. Create a contract (existing flow)
2. Call `POST /contracts/{id}/auto-split` as client → verify milestones created with `awaiting_funds` status
3. Call `POST /milestones/{id}/fund` with `Idempotency-Key` header → verify `funded` status, `EscrowTransaction(type=fund)` row created
4. Call `POST /milestones/{id}/submit` as freelancer → verify `in_review`
5. Call `POST /milestones/{id}/approve` as client → verify `closed_success`, freelancer `wallet_balance` increased, `EscrowTransaction(type=release)` created
6. Repeat steps 3–4, then call `/reject` twice → verify third rejection is blocked with HTTP 400
7. After second rejection, call `/escalate` → verify `in_dispute`, call `/admin/resolve` with `split` → verify partial wallet credit and `EscrowTransaction(type=refund)` created
8. Seed a milestone with `submitted_at = NOW() - INTERVAL '8 days'` directly in psql, call `workers/milestone_worker.check_auto_approve()` manually → verify `closed_auto_approve`
9. Call `POST /milestones/{id}/fund` twice with the same `Idempotency-Key` → verify second call returns current state without creating duplicate records
