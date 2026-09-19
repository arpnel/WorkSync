# Project read cache

Project lists, application requests, project workspaces, and delivery history share a browser-memory cache with a 30-second TTL and a 40-entry limit. Reopening a recently viewed project reuses its saved result, including the workspace's related queries. Simultaneous normal reads share one request. Nothing is written to localStorage or cached on the server.

Keys include the signed-in user and, where applicable, the order or project ID. Signing out or changing accounts clears entries. Pending reads cannot repopulate a cleared cache, and account changes reject results from the previous account.

Initial loads and existing background checks reuse fresh entries. Realtime workspace/delivery events, Retry, and explicit refresh bypass the TTL. Successful actions in the project hooks and delivery panel clear cached reads before reloading. Forced reads supersede older requests so a pre-save response cannot replace a new cache entry.

Row counts are not used: approvals, revisions, edits, and deletions can change the result without increasing a count. Existing periodic checks remain as fallback when realtime is unavailable; remote changes may take around 30 seconds plus the polling interval to appear. A full browser reload starts with an empty cache.

Payment checks and mutation authorization remain uncached. This cache improves repeat navigation; the first visit still performs the existing database queries. Live latency and multi-account browser behavior have not been benchmarked.
