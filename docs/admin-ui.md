# WorkSync admin

The shared sidebar/header and table/dialog layout now load real records through `worksync_admin_records`. `/admin` checks membership for navigation; every database routine independently verifies `admin_members` using `auth.uid()`. User-editable metadata is never accepted as administrator authority.

Routes: overview, users, jobs, services, projects, reports, verification, audit, financial.

- Users and project/contract metadata are read-only oversight views.
- Jobs/services support reversible hiding and restoring without deleting content.
- Report queues support under review, resolved and dismissed states.
- Verification supports private document viewing and approval/rejection.
- Mutations require notes, create audit records and notify affected users. Notes are visible to affected users.
- Financial monitoring explicitly remains unavailable until real payments are integrated. There are no sample transaction totals or cash-out actions.

The old `admin-data.ts` and sample attachment helpers remain unused reference fixtures. Production routes do not import them.

Database setup is pending. Provision `admin_members` only through trusted SQL, then test admin/non-admin accounts and private document access. See `platform-supabase-prompt.md` and `platform-development.md` for limitations and preparation steps.
