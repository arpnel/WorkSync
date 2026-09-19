# Messaging features setup

Apply supabase/migrations/202609060001_messaging_features.sql in Supabase's SQL editor. This migration has not been run against the live project.

## Database additions

- conversation_preferences: per-participant archive and pin flags. Archiving hides a chat from the inbox until manually restored, including when new messages arrive. Other participants are unaffected.
- user_blocks: directed user-level blocks. Either person's block prevents new messages in both directions across their conversations, including project chat. Existing messages/read receipts remain accessible. This does not cancel work or payment obligations.
- A messages trigger enforces blocking for direct database writes and all application chat entry points. It preserves existing messages RLS policies; those must already enforce membership and sender identity.
- The existing private message-attachments bucket is reused (10 MB limit). Attachment path and MIME type use existing messages.attachment_url and attachment_type; no new message columns are required. Storage policies require conversation membership and sender-owned upload paths, matching project chat. Existing bucket privacy/size settings are set to private/10 MB. Existing stored HTTP(S) URLs remain supported.

No remote schema changes were made by the coding agent. Until setup succeeds, archive/pin/block controls are disabled, with a retry notice; existing text messaging, search, and shared history remain available. Uploads need the bucket and storage policies. Preference/block lists refresh on page focus and when returning to the tab. Database enforcement applies immediately even if another open tab has stale controls.

## Verification with two participants and a third unrelated account

1. Send text, a file, and an image from each participant. Open attachments from both chat and shared history. Refresh and verify persistence; use a fresh signed URL after five minutes.
2. Search for an older message and a shared filename. Confirm newest shared items appear first and that switching chats resets searches.
3. Pin a chat; verify order and the Pinned filter. Archive it; verify it leaves the inbox and can be restored from Archived. Confirm the other participant's preferences did not change.
4. Block the other participant. Verify both users' direct inserts to messages fail (also test the project-chat page); old history remains readable. Unblock and send again. If both blocked each other, one unblock must not remove the other's block.
5. With the unrelated account, verify preferences cannot be read/changed, another user's block cannot be removed, and attachment paths cannot be read or uploaded. Verify spoofing sender_id is rejected by existing messages RLS.
6. Fail a send (offline/network failure): draft and attachment remain. Attempt a file over 10 MB: rejection occurs before upload. Switch chats while sending: the old response must not replace the new chat's messages.
7. On a narrow screen, open the chat menu, browse shared content, close it, and return to the inbox. No call dependencies are added.

Message search and shared history cover the complete conversation, fetched in pages of 500 by the messages service (the PostgREST row limit should be at least 500). No message deletion/unsend is introduced so work history is preserved.
