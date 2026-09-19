# Project delivery workflow

The workspace uses the existing project, submission, revision, review, contract, and order tables. Client approval completes a standard project; milestone projects complete after every milestone is approved. Completion is persisted by the database, never inferred from the progress bar.

`supabase/migrations/202609190003_project_delivery_workflow.sql` is prepared locally and has not been applied. It replaces the existing submission and review RPCs to accept revised work, reject finished milestones, track submitted/revision-requested milestone states, and prevent review of an older delivery. It retains participant checks, project locks, revision limits, attachment checks, hold checks, and notifications. Before deployment, compare the deployed function signatures, status constraints, and preceding migrations with these definitions.

## Live acceptance checks

Use separate client and freelancer accounts plus an unrelated account:

1. Accept a request, negotiate scope and milestones, and confirm the agreement as both participants.
2. Confirm the existing payment integration unlocks submission only after the full agreed payment is verified.
3. Submit notes, links, and a private attachment. Verify the client can read these and the unrelated account cannot.
4. Request a revision. Verify instructions and remaining allowance, then resubmit from the freelancer account, including when the project has revision status.
5. Approve a standard delivery. Verify project, contract, and order become completed together, the list shows Completed, and neither party can submit more work or start checkout.
6. For milestone work, approve an intermediate milestone and verify the project stays active. Approve the last milestone and verify completion.
7. Verify stale/duplicate approvals and approvals by the freelancer or an unrelated account are rejected. Verify cancellation/dispute holds prevent delivery decisions.
8. Publish one review from each participant, verify persistence, and verify duplicate reviews are rejected.
9. Reload both accounts and verify delivery history, contract, reviews, and messages remain available. Completed projects must not permit new meetings.

No live database, payment, or two-account browser verification has been performed in this change.
