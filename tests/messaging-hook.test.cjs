/* eslint-disable @typescript-eslint/no-require-imports -- Node harness controls hook effects and async request ordering. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = ts.transpileModule(
  fs.readFileSync("hooks/message/useMessaging.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function harness({ missingSetup = false } = {}) {
  const slots = [],
    pending = [],
    requests = [],
    listeners = new Map(),
    events = new Map(),
    reads = [];
  let index = 0,
    value,
    preferenceCalls = 0;
  const changed = (a, b) =>
    !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = index++;
      if (!slots[i])
        slots[i] = {
          value: typeof initial === "function" ? initial() : initial,
        };
      return [
        slots[i].value,
        (next) => {
          slots[i].value =
            typeof next === "function" ? next(slots[i].value) : next;
        },
      ];
    },
    useRef(initial) {
      const i = index++;
      if (!slots[i]) slots[i] = { current: initial };
      return slots[i];
    },
    useMemo(fn, deps) {
      const i = index++;
      if (!slots[i] || changed(slots[i].deps, deps))
        slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) {
      return react.useMemo(() => fn, deps);
    },
    useEffect(fn, deps) {
      const i = index++;
      if (!slots[i] || changed(slots[i].deps, deps)) {
        const old = slots[i];
        slots[i] = { deps, cleanup: old?.cleanup };
        pending.push(() => {
          slots[i].cleanup?.();
          slots[i].cleanup = fn();
        });
      }
    },
  };
  const api = {
    getMessageConversations: async () => ({
      currentUserId: "me",
      conversations: ["A", "B"].map((id) => ({
        conversationId: id,
        participant: { userId: "same-user" },
        unreadCount: 1,
      })),
    }),
    getMessagingPreferences: async () => {
      preferenceCalls++;
      if (missingSetup) throw { code: "PGRST205" };
      return { preferences: [], blockedUserIds: [], blockedByUserIds: [] };
    },
    isMessagingSetupMissing: (error) => error?.code === "PGRST205",
    getConversationMessages: (id) =>
      new Promise((resolve) => requests.push({ id, resolve })),
    markConversationRead: async (id) => {
      reads.push(id);
    },
    subscribeToConversationMessages: (id, callback) => {
      listeners.set(id, callback);
      return () => {};
    },
    subscribeToUserConversations: () => () => {},
    sendConversationMessage: async () => {},
  };
  const browser = {
    visibilityState: "visible",
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: (name) =>
      name === "react"
        ? react
        : name === "sonner"
          ? { toast: { error() {}, success() {} } }
          : api,
    window: browser,
    document: browser,
    console,
  });
  const render = (commit = true) => {
    index = 0;
    value = exports.useMessaging();
    if (commit) while (pending.length) pending.shift()();
    return value;
  };
  const settle = async () => {
    for (let i = 0; i < 8; i++) {
      render();
      await Promise.resolve();
    }
    return render();
  };
  return {
    render,
    settle,
    requests,
    listeners,
    events,
    reads,
    get value() {
      return value;
    },
    get preferenceCalls() {
      return preferenceCalls;
    },
  };
}
const message = (id, conversationId) => ({
  messageId: id,
  conversationId,
  message: "message from " + conversationId,
});
test("switching projects clears old messages before effects and ignores late realtime callbacks", async () => {
  const h = harness();
  await h.settle();
  h.value.setSelectedConversationId("A");
  await h.settle();
  h.requests[0].resolve([message("a", "A")]);
  await h.settle();
  assert.equal(h.value.messages[0].messageId, "a");
  const oldCallback = h.listeners.get("A");
  h.value.setSelectedConversationId("B");
  const next = h.render(false);
  assert.equal(next.messages.length, 0);
  assert.equal(next.loadingMessages, true);
  await h.settle();
  oldCallback();
  await h.settle();
  assert.equal(h.requests.filter((r) => r.id === "A").length, 1);
  h.requests
    .find((r) => r.id === "B")
    .resolve([message("b", "B"), message("b", "B"), message("foreign", "A")]);
  await h.settle();
  assert.equal(h.value.messages.length, 1);
  assert.equal(h.value.messages[0].conversationId, "B");
});
test("an old project's slow response cannot replace the selected project's history or mark it read", async () => {
  const h = harness();
  await h.settle();
  h.value.setSelectedConversationId("A");
  await h.settle();
  h.value.setSelectedConversationId("B");
  await h.settle();
  h.requests[1].resolve([message("b", "B")]);
  await h.settle();
  h.requests[0].resolve([message("a", "A")]);
  await h.settle();
  assert.equal(h.value.messages[0].messageId, "b");
  assert.deepEqual(h.reads, ["B"]);
});
test("missing optional tables do not reload on every focus and explicit retry still works", async () => {
  const h = harness({ missingSetup: true });
  await h.settle();
  assert.equal(h.preferenceCalls, 1);
  h.events.get("focus")();
  h.events.get("visibilitychange")();
  await h.settle();
  assert.equal(h.preferenceCalls, 1);
  assert.equal(h.value.conversations.length, 2);
  await h.value.reload();
  await h.settle();
  assert.equal(h.preferenceCalls, 2);
  assert.equal(h.value.preferencesReady, false);
});

test("selecting the already-open chat does not invalidate its pending load", async () => {
  const h = harness();
  await h.settle();
  h.value.setSelectedConversationId("A");
  await h.settle();
  h.value.setSelectedConversationId("A");
  await h.settle();
  h.requests[0].resolve([message("a", "A")]);
  await h.settle();
  assert.equal(h.value.messages.length, 1);
  assert.equal(h.value.loadingMessages, false);
});
