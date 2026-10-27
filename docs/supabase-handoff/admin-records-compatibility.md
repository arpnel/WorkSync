# Admin records compatibility ? 2026-09-30

The deployed function definition supplied by the user establishes a real contract mismatch. The frontend agrees with the historical September 14 SQL, but production implements a different moderation-feed contract. This is not fixed by aliasing users to accounts: accounts only contains moderated accounts. Likewise listings only contains moderation entries and cannot replace the Jobs or Services pages.

## Checked pages and identifiers

| Page | UI identifier | Read RPC / module |
| --- | --- | --- |
| /admin | overview | worksync_admin_records / overview |
| /admin/users | users | worksync_admin_records / users |
| /admin/jobs | jobs | worksync_admin_records / jobs |
| /admin/services | services | worksync_admin_records / services |
| /admin/projects | projects | worksync_admin_records / projects |
| /admin/reports | reports | worksync_admin_records / reports |
| /admin/verification | verification | worksync_admin_records / verification |
| /admin/audit | audit | worksync_admin_records / audit |
| /admin/financial | transactions | worksync_admin_records / transactions |
| /admin/disputes | disputes | worksync_list_disputes; no p_module |
| /admin/analytics | separate analytics page | worksync_admin_analytics; no p_module |

One application dispatch site exists, in services/admin/adminService.ts. All records pages use services/admin/adminModules.ts. Action RPC identifiers and authorization remain unchanged.

## Exact SQL comparison

Historical local SQL accepts: overview, users, jobs, services, projects, reports, verification, audit, transactions. It returns rows/total, so it is not the deployed implementation.

Deployed SQL accepts: all, reports, listing_reports, listings, listing_moderation, accounts, account_moderation, disputes, audit, audit_log. It returns records/limit/offset, with limit 50, and nested record_type envelopes.

Missing UI identifiers: overview, users, jobs, services, projects, verification, transactions. Reports and audit are supported but require envelope normalization. Disputes and analytics already use separate RPCs.

## Application changes

Centralized identifiers preserve evidenced UI names. Shared validation accepts records/limit/offset, normalizes report and audit envelopes, and still rejects malformed successful responses. Internal rows are a view model, not a claimed RPC response field. Optional overview stats remain supported. Pagination uses the actual response limit and offset; no total is fabricated. A full last page can expose one additional empty page because this contract provides no total or has-more indicator. Previous offsets allow returning from that page. Follow-up: the deployed dispute definition subsequently supplied by the user returns a plain array with a 100-row limit. That adapter is now corrected; see admin-disputes-analytics-fix.md.

## Prepared SQL ? not applied

admin-records-compatibility-patch.sql extends the supplied deployed definition with the seven missing UI modules, using the existing UI SELECT projections from local SQL. The existing ten moderation-feed identifiers and envelopes, admin authorization check, signature/defaults, volatility and search path remain intact. No table, policy, grant or unrelated RPC changes are included. CREATE OR REPLACE retains existing grants.

Review and explicitly apply this patch in Supabase SQL Editor before expecting all pages to load. The unsupported-module errors remain for the seven missing modules until the database change is deployed. Do not replay the old migration bundle. SQL execution, authenticated Admin access, and browser rendering have not been live-tested. Request records for the newly added modules use the existing normalized UI row fields inside the records envelope.

## Validation

TypeScript passed. Targeted Admin response/dispatch and database compatibility tests: 10 passed, 0 failed. Targeted Admin ESLint and git diff whitespace check passed. No SQL application or authenticated browser end-to-end verification was performed.
