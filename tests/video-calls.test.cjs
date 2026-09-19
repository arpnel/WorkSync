/* eslint-disable @typescript-eslint/no-require-imports -- Node regression harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");
function load(path, modules = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: (name) => modules[name],
      Buffer,
      URL,
      Date,
      Set,
      AbortSignal,
      process: {
        env: {
          DAILY_API_KEY: "test-key",
          SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
        },
      },
      ...globals,
    },
  );
  return exports;
}
const messages = load("lib/calls/callMessage.ts");
const caller = "00000000-0000-4000-8000-000000000001";
const recipient = "00000000-0000-4000-8000-000000000002";
const outsider = "00000000-0000-4000-8000-000000000003";
const conversation = "00000000-0000-4000-8000-000000000004";
const callId = "00000000-0000-4000-8000-000000000005";
const makeCall = (state = "ringing") => ({
  id: callId,
  conversationId: conversation,
  callerId: caller,
  recipientId: recipient,
  callerName: "Caller",
  recipientName: "Recipient",
  state,
  createdAt: Date.now(),
  ringingUntil: Date.now() + 60000,
  expiresAt: Date.now() + 3600000,
});
function harness({
  actor = caller,
  blocked = false,
  blockError = null,
  saveFailure = false,
} = {}) {
  const provider = [],
    rows = new Map();
  const db = {
    from(table) {
      const filters = {};
      let mutation;
      const query = {
        select() {
          return this;
        },
        eq(key, value) {
          filters[key] = value;
          return this;
        },
        in() {
          return this;
        },
        or() {
          return this;
        },
        like() {
          return this;
        },
        gte() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        insert(value) {
          mutation = { insert: value };
          return this;
        },
        update(value) {
          mutation = { update: value };
          return this;
        },
        maybeSingle() {
          return Promise.resolve(execute(true));
        },
        single() {
          return Promise.resolve(execute(true));
        },
        then(resolve, reject) {
          return Promise.resolve(execute(false)).then(resolve, reject);
        },
      };
      function execute(single) {
        if (table === "conversation_participants")
          return {
            data: filters.user_id
              ? [{ conversation_id: conversation }]
              : [{ user_id: caller }, { user_id: recipient }],
            error: null,
          };
        if (table === "user_blocks")
          return {
            data: blocked
              ? [{ blocker_id: caller, blocked_id: recipient }]
              : [],
            error: blockError,
          };
        if (table === "profiles")
          return {
            data: [
              { user_id: caller, display_name: "Caller" },
              { user_id: recipient, display_name: "Recipient" },
            ],
            error: null,
          };
        assert.equal(table, "messages");
        if (mutation?.insert) {
          if (saveFailure) return { data: null, error: { message: "denied" } };
          rows.set(mutation.insert.message_id, mutation.insert);
          return { data: null, error: null };
        }
        const row = rows.get(filters.message_id);
        if (mutation?.update) {
          if (!row || (filters.message && row.message !== filters.message))
            return { data: null, error: null };
          rows.set(row.message_id, { ...row, ...mutation.update });
          return { data: { message_id: row.message_id }, error: null };
        }
        return {
          data: single ? (row ?? null) : [...rows.values()],
          error: null,
        };
      }
      return query;
    },
  };
  const api = load(
    "services/calls/callServer.ts",
    {
      "server-only": {},
      "node:crypto": crypto,
      "@/lib/calls/callMessage": messages,
      "@supabase/supabase-js": {},
    },
    {
      fetch: async (url, options) => {
        const body = options.body ? JSON.parse(options.body) : undefined;
        provider.push({ url, ...options, body });
        return {
          ok: true,
          status: 200,
          json: async () =>
            url.endsWith("meeting-tokens")
              ? { token: "room-token" }
              : { url: `https://test.daily.co/ws-${callId}` },
        };
      },
    },
  );
  const ctx = { db, client: db, user: { id: actor } };
  const save = (call) =>
    rows.set(call.id, {
      message_id: call.id,
      conversation_id: call.conversationId,
      sender_id: call.callerId,
      message: api.signCall(call),
    });
  return { api, ctx, provider, rows, save };
}
test("signed calls reject forged content and replay into another conversation or message", () => {
  const h = harness();
  const call = makeCall();
  h.save(call);
  const row = h.rows.get(callId);
  assert.equal(h.api.verifiedCall(row).id, callId);
  assert.equal(
    h.api.verifiedCall({
      ...row,
      message: row.message.replace('"ringing"', '"active"'),
    }),
    null,
  );
  assert.equal(h.api.verifiedCall({ ...row, conversation_id: outsider }), null);
  assert.equal(h.api.verifiedCall({ ...row, message_id: outsider }), null);
  assert.equal(h.api.verifiedCall({ ...row, sender_id: recipient }), null);
});
test("only recipients can answer and terminal or expired calls cannot reopen", () => {
  const { api } = harness();
  const call = makeCall();
  assert.throws(() => api.nextCallState(call, caller, "accept"), /recipient/);
  assert.throws(
    () => api.nextCallState(call, outsider, "end"),
    /cannot access/,
  );
  assert.equal(api.nextCallState(call, recipient, "accept").state, "active");
  assert.equal(api.nextCallState(call, recipient, "decline").state, "declined");
  assert.equal(api.nextCallState(call, caller, "end").state, "cancelled");
  assert.throws(
    () => api.nextCallState({ ...call, ringingUntil: 0 }, recipient, "accept"),
    /finished/,
  );
  assert.throws(
    () => api.nextCallState({ ...call, state: "ended" }, caller, "end"),
    /finished/,
  );
});
test("nonmembers and blocked participants cannot create rooms", async () => {
  for (const options of [
    { actor: outsider },
    { blocked: true },
    { blockError: { code: "42501" } },
  ]) {
    const h = harness(options);
    await assert.rejects(h.api.startCall(h.ctx, conversation, callId));
    assert.equal(h.provider.length, 0);
  }
});
test("room creation is private, expiring, limited to two participants, and records only signed call metadata", async () => {
  const h = harness();
  await h.api.startCall(h.ctx, conversation, callId);
  const creation = h.provider[0].body;
  assert.equal(creation.privacy, "private");
  assert.equal(creation.properties.max_participants, 2);
  assert.equal(creation.properties.enable_knocking, false);
  assert.equal(creation.properties.eject_at_room_exp, true);
  assert.ok(creation.properties.exp > Date.now() / 1000);
  assert.ok(h.api.verifiedCall(h.rows.get(callId)));
  assert.doesNotMatch(
    h.rows.get(callId).message,
    /room-token|test-key|https:\/\//,
  );
});
test("failed invitation persistence cleans up the provider room", async () => {
  const h = harness({ saveFailure: true });
  await assert.rejects(
    h.api.startCall(h.ctx, conversation, callId),
    /invitation/,
  );
  assert.ok(h.provider.some((request) => request.method === "DELETE"));
  assert.equal(h.rows.size, 0);
});
test("join requires an active call, membership and a room-bound non-owner token", async () => {
  const h = harness({ actor: recipient });
  h.save(makeCall());
  await assert.rejects(h.api.actOnCall(h.ctx, callId, "join"), /not active/);
  assert.equal(h.provider.length, 0);
  h.save(makeCall("active"));
  const result = await h.api.actOnCall(h.ctx, callId, "join");
  assert.equal(result.token, "room-token");
  const token = h.provider.find((r) => r.url.endsWith("meeting-tokens")).body
    .properties;
  assert.equal(token.room_name, `ws-${callId}`);
  assert.equal(token.user_id, recipient);
  assert.equal(token.is_owner, false);
  assert.equal(token.eject_at_token_exp, true);
  const other = harness({ actor: outsider });
  other.save(makeCall("active"));
  await assert.rejects(
    other.api.actOnCall(other.ctx, callId, "join"),
    /not found/,
  );
  assert.equal(other.provider.length, 0);
});
test("ending a call persists its state and ejects both bound user IDs", async () => {
  const h = harness();
  h.save(makeCall("active"));
  assert.equal(
    (await h.api.actOnCall(h.ctx, callId, "end")).call.state,
    "ended",
  );
  assert.equal(h.api.verifiedCall(h.rows.get(callId)).state, "ended");
  const eject = h.provider.find((r) => r.url.endsWith("/eject"));
  assert.deepEqual(eject.body.user_ids, [caller, recipient]);
  assert.equal(eject.body.ban, true);
});
test("incoming lists do not ring for forged or blocked call messages", async () => {
  const h = harness({ actor: recipient });
  h.save(makeCall());
  h.rows.set(outsider, {
    message_id: outsider,
    conversation_id: conversation,
    sender_id: caller,
    message: "hello",
  });
  assert.equal((await h.api.listCalls(h.ctx)).length, 1);
  const blocked = harness({ actor: recipient, blocked: true });
  blocked.save(makeCall());
  assert.equal((await blocked.api.listCalls(blocked.ctx)).length, 0);
});
test("history preserves ordinary messages and labels missed calls without exposing protocol metadata", () => {
  assert.equal(messages.callPreview("hello"), "hello");
  assert.equal(
    messages.parseCallMessage(messages.CALL_PREFIX + "not json"),
    null,
  );
  const h = harness();
  const call = { ...makeCall(), ringingUntil: 0 };
  assert.equal(
    messages.callPreview(h.api.signCall(call)),
    "Video call · Missed",
  );
});
