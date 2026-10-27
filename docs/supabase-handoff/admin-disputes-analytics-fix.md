# Admin disputes and analytics response compatibility

Based on the deployed function definitions supplied by the user on 2026-09-30, not on the historical migrations.

- worksync_list_disputes(text,integer,uuid) returns SETOF project_disputes: a plain JSON array with LIMIT 100 and offset pagination. Shared parsing now validates that array, preserves dispute_id for inspection/resolution, and uses project_id in the title because the RPC does not return a project title. A full last page may allow one further empty page; the RPC provides no total.
- worksync_admin_analytics returns from/to/status, users, listing_reports, listing_reports_by_status, disputes, disputes_by_status, suspended_accounts, hidden_listings and audit_actions. The adapter retains these real counts and status breakdowns. All-status calls now send null, not the literal all.
- The analytics filter description reflects the deployed semantics: dates apply to creation-time counts, while suspended accounts and hidden listings are current totals. Status does not filter users or audit actions. Available status choices include returned report/dispute statuses and the explicitly supported suspended/hidden values.
- The deployed analytics RPC does not supply completion rate, average project value, average rating, monthly activity or category activity. Their UI sections remain, explicitly unavailable rather than populated with invented zeros or empty charts. The historical full analytics response parser and chart rendering are retained, but full analytics requires an explicit backend contract extension; none was silently created or applied.
- No changes to permissions, SQL functions, moderation actions, dispute context, or non-Admin workflows. This correction does not establish that the separate dispute-context RPC matches production.

Validation: TypeScript passed; targeted ESLint passed; 12 Admin/compatibility tests passed. Tests cover the supplied response shapes, rejected malformed values, 100-row pagination, retained IDs, null status filtering, and unavailable metrics. No deployed browser or live write test was performed.
