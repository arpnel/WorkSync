# Profile editing and page loading

## Profile

The circular header pencil opens the personal-information dialog and enables section editing. Personal information, professional details, industries and skills save from that dialog. Supporting documents, portfolio projects, services and client project listings have individual Save/Cancel dialogs on the Profile page. Finish editing hides those controls. Reviews, earned ratings and completed-work totals remain derived from the existing workflows.

Supporting documents use private Storage signed URLs; images and PDFs render inline, with a full-size link and a fallback for browsers that cannot embed PDFs. Portfolio covers resolve existing `portfolio_images` records and `thumbnail_image_id`. Uploads use existing buckets and columns. There are no migrations or remote database changes.

Draft selection and file selection do not persist before Save. Existing multi-table profile writes and Storage uploads are not a database transaction: a failed Save can retain completed valid writes. Errors keep the editor open; retrying a newly created portfolio project uses its saved ID rather than inserting another project.

## Notifications

Dashboard, header and notification-page items open a detail dialog. Related records load only when opened. Service requests resolve the order, service, contract terms and other participant's public identity. Project/request actions use the actual order ID and standard/milestone workspace. Job-application notifications store the job ID in existing SQL, so their action filters the application's Requests view by that job. Message notifications resolve a message or conversation ID and select that conversation. Missing/inaccessible records do not produce a fabricated record action or sender.

## Observed request bottlenecks and changes

- Marketplace previously invoked identity and category lookups for every listing. A result page now batches distinct identities and categories; the identity endpoint retains its existing 40-ID chunking and authorization. A fixture test verifies 40 cards with eight authors use one identity call and one category query.
- Recent listing, saved-listing, rating, profile and profile-service/portfolio reads use a bounded 30-second memory cache. Concurrent reads share a promise. The cache is account-scoped, clears on account changes, rejects outstanding reads from a previous account, and never persists private data to browser storage.
- Listing/profile mutations invalidate page reads. Role switches invalidate page and project reads. Workflow RPC writes invalidate both caches. Marketplace uses realtime invalidation plus focus/30-second visible-page refresh, with background refresh preserving the current grid.
- Dashboard and Schedule reuse the existing Projects cache. Schedule reads meetings in parallel with projects and invalidates project data on its existing realtime events.
- Notification consumers share one store and realtime subscription. Realtime events, preference changes and successful read-status writes invalidate notification reads. Visible-page polling remains a fallback when realtime is unavailable.
- Messaging participant and project-title queries now run in parallel; stable participant metadata uses the account-scoped 30-second cache. Chat messages remain uncached and keep their existing subscriptions. The conversation list still reads message history to derive latest messages/unread counts; replacing that with a database aggregate would require a separately reviewed database contract.

The identities API was inspected: authentication and role lookups precede its final profile lookup, and it explicitly returns uncached responses. This change reduces calls to that API instead of weakening authentication or caching its responses on the server. No live database execution plans or authenticated latency measurements were available.

## Validation

- TypeScript and focused ESLint passed.
- Nine cache/request tests passed: TTL/eviction, request deduplication, failed-read retry, mutation races, account switching and batched Marketplace reads.
- Local HTTP smoke checks returned 200 and rendered HTML for Profile, Dashboard, Marketplace, Projects, Schedule and Messages. These checks do not execute authenticated client data fetching.
- Production build was attempted and blocked by the existing Geist/Geist Mono Google Fonts network fetch failures.
- Signed-in browser interactions, private Storage permissions, two-account realtime behavior and live Supabase persistence still require verification. No production speedup is claimed from HTTP shell timing alone.
