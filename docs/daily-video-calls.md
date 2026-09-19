# Daily video calls

## Implemented

- A video-call action in Messages and project conversations.
- An incoming Accept/Decline dialog anywhere under `/home`, outgoing ringing/cancel, in-app Daily Prebuilt, and hang-up. The caller and recipient check devices in Daily's prejoin interface; audio/video initially start off.
- Call history inside the conversation: calling, active, declined, cancelled, ended, or missed. Ringing expires after 60 seconds. Rooms and tokens expire after one hour.
- Existing calls can be resumed after a page reload with Return to call. Navigating within the home layout preserves the call provider. Closing the browser stops local media. Device errors and peer disconnects do not end the shared call; participants can reconnect until explicit hang-up or expiry. Use WorkSync's End call button to hang up.
- Device errors show permission/device guidance and a Retry connection button. Retry destroys the previous iframe before reconnecting. Insecure origins show HTTPS/localhost guidance without attempting to acquire devices.
- Incoming notifications require WorkSync to be open. There are no service-worker push calls or guaranteed background ringing when the browser is closed. Permission prompts, device selection, screen sharing and microphone/camera controls use Daily Prebuilt.

## Configuration

Set `DAILY_API_KEY` to the Daily REST API key in `.env.local` and the deployed server environment. It must not have a `NEXT_PUBLIC_` prefix. Existing Supabase URL, anon key and service-role key are also required. Restart the dev server after editing environment values.

Daily integration uses the official `@daily-co/daily-js` package. Server endpoints call the fixed `https://api.daily.co/v1` origin; clients receive only room-specific meeting tokens through an authenticated, non-cached response. Tokens are passed through `join()` rather than placed in room links or message history.

Reference: [Daily private rooms](https://docs.daily.co/reference/rest-api/rooms/create-room), [meeting tokens](https://docs.daily.co/reference/rest-api/meeting-tokens/create-meeting-token), [Prebuilt iframe](https://docs.daily.co/reference/daily-js/factory-methods/create-frame).

## Persistence and access control

No schema migration is required or applied. Calls are signed, versioned records in the existing `messages.message` field. A call's ID is its message ID; its signature covers participants, conversation, state and expiration. Displays parse these records, but only the server verifies their authenticity before showing incoming calls or issuing tokens. Copying a record into another conversation/message or changing its sender invalidates it.

Starting checks current conversation membership, requires exactly two participants and checks blocks in either direction if the optional `user_blocks` table is installed. Other block-query errors fail closed. Invitations are inserted with the caller's authenticated database client and existing message RLS/triggers. State changes use the server client, explicit membership/actor checks and a conditional update against the previous message value. Only the recipient can accept or decline a ringing invitation. Ended, declined and expired calls cannot be rejoined.

Rooms are private with knocking disabled, a two-participant maximum, unique user IDs and automatic expiry/ejection. Tokens have a specific room, user ID, expiry and no owner privileges. End-call cleanup ejects/bans both bound users and deletes the room; expiry is the fallback if provider cleanup fails. Local media is destroyed immediately when the user presses End call. No recording or transcription is enabled by this implementation.

The existing messaging feature migration remains deferred. Calls do not change that migration or require it. Rotating `DAILY_API_KEY` invalidates existing call-record signatures; start a new call afterward.

Realtime updates are supplemented by four-second polling. Existing-call checks and a per-caller recent-invitation limit reduce duplicate starts, but start creation has no cross-server transaction lock across Daily and Supabase. Simultaneous starts in separate server processes can produce competing invitations; cancel one and retry. A dedicated call table/RPC would be appropriate for strict global busy locking at scale.

## Verification in this implementation

- TypeScript and targeted ESLint passed.
- 127 regression tests passed, including call signature tampering/replay, nonmember/block rejection, recipient-only answer, expired/terminal states, private expiring rooms, token scope, failed invitation cleanup and end-call ejection.
- A live read-only Supabase request confirmed the existing message columns are available (HTTP 200). No conversation or call records were inserted into the live database for testing.
- Daily returned HTTP 401 for the initial key and for the updated file value. A second check read `.env.local` directly: no duplicate assignment or inherited-key override was present, and Daily still returned 401. No provider test room was created. Live room/token creation remains blocked by the credential.
- Browser camera/microphone access, audio/video between two devices, and live database writes were not verified.

After a working key is configured, test two signed-in participants: call/accept/join, decline, cancel, no answer, hang up from both interfaces, reload/resume, permission denial, loss of connection, tab closing, and calls from different conversations. Verify a third unrelated account and blocked users cannot start or join. Confirm call history updates and no metadata JSON appears in conversation previews. Test on localhost or HTTPS; production camera/microphone access requires a secure context.
