# Freelancer work limits

## Post-install verification

User reported successful installation after the lock-order fix. Read-only live checks confirmed availability returns HTTP 200 and the expected boolean response for both anonymous and service-role callers, including one existing freelancer and empty input. Both roles correctly reject 201-ID batches with `22023`; anonymous calls to internal commitment/limit helpers correctly return `42501`. These intentional negative-test responses are expected, not application failures. No IDs or workload values were printed. TypeScript and all 31 relevant tests passed again. Live trigger writes, signed-in-role permissions, concurrency and browser rendering were not exercised. The implementation notes below describe the original preparation stage.

Implemented application UI and prepared `supabase/migrations/202609300002_freelancer_capacity.sql`. **Not applied remotely.** Apply the reviewed migration before deploying the new actions: application/service prechecks intentionally fail closed if the availability RPC is unavailable.

## Policy

- Default: 10 concurrent commitments.
- Established: 15 after 10 completed projects. This is the proposed default while awaiting the optional user preference; account age does not currently change the limit.
- Pending, active and revision projects count. Accepted service orders and accepted job applications awaiting a project reserve a slot. Linked application/order/project records count once.
- Pending requests/applications do not reserve slots, but cannot be newly submitted when full. Both service-request acceptance and client acceptance of a job applicant are checked again.
- Completed/cancelled projects release slots. Rejected/cancelled discussions without an active project do not count. Declining/withdrawing requests and finishing existing work remain possible.
- Existing excess commitments are not cancelled. Already-reserved discussions may become their project without consuming another slot. Additional work is blocked until capacity is available.
- No calendar-overlap exception: this caps simultaneous open commitments, regardless of their planned dates.

## Enforcement

The new BEFORE INSERT/UPDATE triggers cover `job_applications`, `service_orders`, and `projects`. Existing RPC bodies and response contracts are preserved. Direct permitted table writes receive the same checks. Existing RLS and authorization remain responsible for who may perform an action; the capacity guard does not grant any new write permission.

A row lock on the freelancer profile serializes new admissions. Admission reads fresh committed state after acquiring the lock. Transactions at stronger isolation are rejected with a retryable serialization error rather than using stale capacity snapshots. Existing workflow lock orders can produce a deadlock under contention; PostgreSQL rolls back one transaction. Validate real concurrent accepts in staging before production rollout.

The public batch RPC returns only freelancer ID and availability boolean (maximum 200 IDs per call). Internal commitment keys and limits are not callable by browser roles. No project names, counts, clients or payment information are exposed. New indexes support freelancer/status lookups; no existing rows are altered by the migration.

## UI

- Marketplace service cards: red dot and “Fully booked”, green dot and “Available for work”, or neutral unknown status.
- Service details: availability beside Report; Buy disabled when full.
- Job details: the signed-in freelancer sees a capacity notice and disabled application submission when full.
- Service creation, application submission and acceptance precheck availability. Database triggers remain authoritative if status changes after the check.
- Availability is batched separately from listing caches, refreshed every 30 seconds while visible and when the window regains focus. Errors never imply availability.

## Validation and deployment

Installation follow-up: the user reported SQLSTATE `40P01` while dropping the job-application trigger. The migration now obtains table locks on all five workload/dependency tables with `NOWAIT` before changing any functions or triggers, plus a three-second timeout for subsequent lock acquisition. Run the complete updated file during low traffic; the locks briefly block reads/writes until commit. If `55P03` reports a busy table, roll back and retry the whole transaction later. Do not run only the remainder after the failed statement or disable production triggers. The failed transaction cannot commit partial migration changes. This addresses installation lock ordering, not proof of concurrent runtime acceptance behavior. No live retry was performed by the assistant.

Run `pnpm.cmd typecheck`, targeted ESLint and `node --test tests/freelancer-capacity.test.cjs`. The SQL test uses the optional isolated PGlite runtime under `.next/payment-audit/runtime` from the payment audit; it explicitly skips if unavailable. It is not a full live Supabase clone or a multi-session concurrency test.

Validation completed: TypeScript and targeted ESLint passed. Capacity, guest marketplace, marketplace identities, page loading and platform workflow tests: 31 passed, zero failed. The migration was applied twice to the isolated fixture. Existing test mocks were updated for the new availability dependency; the marketplace identity test's missing cache mock was also supplied. No full-suite or browser run was performed for this change.

Before applying, review current columns and statuses for `projects`, `job_applications`, `service_orders`, `contracts`, and `freelancer_profiles`. This additive migration uses the source relationships already used by the app and previous supplied metadata; it does not replace deployed workflow functions.

After staging installation, test 9/10 slots, 14/15 slots with ten completed projects, simultaneous last-slot acceptance, service and job acceptance, activation of an already-reserved agreement, completion/cancellation release, and anonymous marketplace badges. Confirm two real concurrent accepts cannot exceed the limit. No live database writes or browser verification were performed by this change.
