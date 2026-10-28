/* eslint-disable @typescript-eslint/no-require-imports -- Node source regression test. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const server = fs.readFileSync("services/calls/callServer.ts", "utf8");
const service = fs.readFileSync("services/calls/callService.ts", "utf8");
const provider = fs.readFileSync("components/calls/CallProvider.tsx", "utf8");
const route = fs.readFileSync("app/api/calls/route.ts", "utf8");

test("Supabase Auth and database requests have configurable bounded deadlines", () => {
  assert.match(server, /CALLS_SUPABASE_\$\{kind\}_TIMEOUT_MS/);
  assert.match(server, /fetch\(input,[\s\S]*?signal: controller\.signal/);
  assert.match(server, /await response\.arrayBuffer\(\)/);
  assert.match(server, /`CALLS_SUPABASE_\$\{kind\}_TIMEOUT`/);
  assert.match(server, /kind === "AUTH"[\s\S]*?504/);
  assert.match(server, /CALLS_SUPABASE_\$\{kind\}_TIMEOUT_MS/);
});

test("database queries disable SDK retries and carry the incoming cancellation signal", () => {
  const readsAndWrites = server.match(/\.from\("(?:conversation_participants|user_blocks|messages|profiles)"\)/g) ?? [];
  const retriesDisabled = server.match(/\.retry\(false\)/g) ?? [];
  const cancellable = server.match(/const signals = \[requestSignal, init\?\.signal\]/g) ?? [];
  assert.equal(readsAndWrites.length, 10);
  assert.equal(retriesDisabled.length, readsAndWrites.length);
  assert.equal(cancellable.length, 1);
  assert.match(server, /if \(request\.signal\.aborted\)[\s\S]*?requestFailure\(/);
});

test("a user with no conversations returns before block and message queries", () => {
  const noConversations = server.indexOf(
    "if (!ids.length) return { calls: [], conversationIds: ids };",
  );
  const blocks = server.indexOf('.from("user_blocks")', noConversations);
  const messages = server.indexOf('.from("messages")', noConversations);
  assert.ok(noConversations >= 0);
  assert.ok(blocks > noConversations);
  assert.ok(messages > noConversations);
});

test("Auth, database, and video-service upstream failures remain controlled", () => {
  const authLookup = server.indexOf("await client.auth.getUser(bearer)");
  const authErrorBranch = server.indexOf("if (error) {", authLookup);
  const successContext = server.indexOf("return { db, client, user, signal", authErrorBranch);
  assert.ok(authLookup >= 0 && authErrorBranch > authLookup);
  assert.ok(successContext > authErrorBranch);
  assert.match(server, /Unable to verify your session\. Please try again shortly\./);
  assert.match(server, /CALLS_DAILY_INVALID_RESPONSE/);
  assert.match(server, /response\.status === 404 \? 410 : 502/);
  assert.match(route, /return failure\(error, request, "GET", started\)/);
  assert.match(route, /return failure\(error, request, "POST", started\)/);
});

test("callRequest combines owner cancellation with its existing fetch deadline", () => {
  assert.match(service, /signal\?: AbortSignal/);
  assert.match(service, /AbortSignal\.any\(\[signal, AbortSignal\.timeout\(45000\)\]\)/);
  assert.match(service, /signal\?\.throwIfAborted\(\)/);
});

test("provider cleanup aborts background refresh and join requests without overlapping refreshes", () => {
  assert.match(provider, /if \(!id \|\| pending\.current\) return/);
  assert.match(provider, /if \(!userId \|\| !conversationIds\.length\) return/);
  assert.match(provider, /const intervalMs = 60000;[\s\S]*?window\.setInterval/);
  assert.match(provider, /controller\.abort\(\);[\s\S]*?removeChannel\(channel\)/);
  assert.match(provider, /callRequest<CallResponse>\([\s\S]*?controller\.signal/);
  assert.match(provider, /if \(alive && !controller\.signal\.aborted\)/);
});

test("disconnects do not become internal errors and diagnostics contain no request identity", () => {
  assert.match(route, /if \(request\.signal\.aborted\)[\s\S]*?status: 499/);
  assert.match(route, /endpoint: "\/api\/calls"[\s\S]*?elapsedMs/);
  assert.doesNotMatch(route, /console\.(?:error|log)\([^;]*(?:bearer|token|user\.id|room)/i);
  assert.match(server, /CALLS_DAILY_INVALID_RESPONSE/);
});
