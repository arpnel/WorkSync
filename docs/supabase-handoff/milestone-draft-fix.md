# Draft milestone compatibility fix

Prepared, not applied. Based on the supplied live function definitions and columns.

The discussion workspace now lists/adds/removes `contract_milestones` using
`worksync_draft_milestones`, and uses their IDs for contract approvals. Active
work continues to use `milestones`. Draft deadlines are date-only, matching
the live milestone date type.

Review and apply `milestone-draft-patch.sql` BEFORE deploying the application
changes. Until that RPC exists, discussion milestone reads will report an error.
The patch adds nullable `contract_milestones.due_date`, a participant-only draft
RPC, and copies due_date during activation using the supplied activation body.
Existing active-project add/remove RPCs, policies, and historical rows are not
rewritten. Existing drafts without dates remain without dates; no backfill is
performed. The existing title/display-order activation deduplication is retained.

Mutations lock the contract using the activation advisory lock and row lock,
require an accepted milestone service request with a draft/pending contract,
and reject finalized projects. Any existing final signatures must be withdrawn
by their owners before mutation: the deployed guard prohibits clearing the
other participant's signature. Addition validates amount, budget, date, and
the 100-milestone limit. Removal is restricted to the selected contract.

Verification: TypeScript and targeted lint passed; 12 existing project tests
passed. SQL has not been executed or validated against a local/live PostgreSQL
instance. These tests do not establish grants, RLS, trigger behavior, or the
full two-account signing flow.

After application in a test environment, verify with both participants:
add the first milestone with no project row; reload both views; approve each
draft and the common terms; sign; verify one activated project and copied
milestone dates. Test removing a draft, another user's access, signed-draft
edit rejection, over-budget additions, and concurrent additions. Confirm
standard contract activation still works. Do not treat this as deployed until
these checks succeed.
