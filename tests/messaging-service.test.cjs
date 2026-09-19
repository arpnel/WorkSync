/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness for mocked TypeScript services. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = ts.transpileModule(
  fs.readFileSync("services/message/messageService.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function service(options = {}) {
  const writes = [],
    uploads = [],
    removals = [],
    ranges = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: "sender" } }, error: null }),
    },
    from: (table) => {
      const filters = [];
      let limit = 500;
      let cursor;
      const query = {
        select() {
          return this;
        },
        eq(column, value) {
          filters.push([column, value]);
          return this;
        },
        limit(value) {
          limit = value;
          return this;
        },
        or(value) {
          cursor = value;
          return this;
        },
        then(resolve, reject) {
          const page = ranges.length;
          ranges.push({ table, filters, cursor });
          const lastId = cursor?.match(/message_id.gt.([^)]*)/)[1];
          const rows = options.pages
            ? (options.pages[page] ?? [])
            : (options.messages ?? [])
                .filter((row) => !lastId || row.message_id > lastId)
                .slice(0, limit);
          return Promise.resolve({ data: rows, error: null }).then(
            resolve,
            reject,
          );
        },
        order() {
          return this;
        },
        in: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({
          data: options.noMembership ? null : { conversation_id: "chat" },
          error: null,
        }),
        range: async (start, end) => {
          ranges.push([start, end]);
          return {
            data: (options.messages || []).slice(start, end + 1),
            error: null,
          };
        },
        insert: async (row) => {
          writes.push({ table, row });
          return {
            error: options.insertError
              ? { message: "Messaging is unavailable for this conversation." }
              : null,
          };
        },
      };
      return query;
    },
    storage: {
      from: () => ({
        upload: async (path, file) => {
          uploads.push({ path, file });
          return { error: options.uploadError ? { message: "denied" } : null };
        },
        remove: async (paths) => {
          removals.push(...paths);
          return { error: null };
        },
        createSignedUrl: async (path) => ({
          data: { signedUrl: "https://example.test/" + path },
          error: null,
        }),
      }),
    },
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: () => ({ supabase: client }),
    crypto: { randomUUID: () => "unique-id" },
    console,
  });
  return { api: exports, writes, uploads, removals, ranges };
}
test("empty messages do not write; text is trimmed", async () => {
  const { api, writes } = service();
  await api.sendConversationMessage("chat", "   ");
  assert.equal(writes.length, 0);
  await api.sendConversationMessage("chat", "  agreed  ");
  assert.equal(writes[0].row.message, "agreed");
  assert.equal(writes[0].row.attachment_url, null);
});
test("attachment-only sends use the existing project-chat path and MIME fields", async () => {
  const { api, writes, uploads } = service();
  await api.sendConversationMessage("chat", "", {
    name: "design brief.pdf",
    size: 100,
    type: "application/pdf",
  });
  assert.equal(uploads[0].path, "sender/chat/unique-id-design_brief.pdf");
  assert.equal(writes[0].row.attachment_url, uploads[0].path);
  assert.equal(writes[0].row.attachment_type, "application/pdf");
  assert.equal(writes[0].row.message, "design brief.pdf");
});
test("oversize file and text are rejected before upload or insert", async () => {
  const { api, writes, uploads } = service();
  await assert.rejects(
    api.sendConversationMessage("chat", "", {
      name: "big.zip",
      size: 10485761,
    }),
    /10 MB/,
  );
  await assert.rejects(
    api.sendConversationMessage("chat", "x".repeat(10001)),
    /10,000/,
  );
  assert.equal(writes.length + uploads.length, 0);
});
test("upload rejection does not create a message", async () => {
  const { api, writes } = service({ uploadError: true });
  await assert.rejects(
    api.sendConversationMessage("chat", "caption", {
      name: "brief.pdf",
      size: 100,
    }),
    /upload/,
  );
  assert.equal(writes.length, 0);
});
test("database rejection propagates and cleans up the uploaded file", async () => {
  const { api, uploads, removals } = service({ insertError: true });
  await assert.rejects(
    api.sendConversationMessage("chat", "caption", {
      name: "brief.pdf",
      size: 100,
    }),
    /Messaging is unavailable/,
  );
  assert.equal(removals[0], uploads[0].path);
});
test("history fetches older pages and normalizes nullable message text", async () => {
  const messages = Array.from({ length: 501 }, (_, i) => ({
    message_id: String(i).padStart(4, "0"),
    created_at: "2026-09-06T12:00:00+00:00",
    conversation_id: "chat",
    sender_id: "sender",
    message: null,
    attachment_url: i === 500 ? "older.pdf" : null,
  }));
  const { api, ranges } = service({ messages });
  const history = await api.getConversationMessages("chat");
  assert.equal(history.length, 501);
  assert.equal(history[500].attachmentUrl, "older.pdf");
  assert.equal(history[0].message, "");
  assert.equal(ranges.length, 2);
});
test("nonparticipants cannot fetch conversation history", async () => {
  const { api, ranges } = service({ noMembership: true });
  await assert.rejects(
    api.getConversationMessages("chat"),
    /not a participant/,
  );
  assert.equal(ranges.length, 0);
});

test("inbox filters keep archives and blocked chats out of normal work categories", () => {
  const source = ts.transpileModule(
    fs.readFileSync("components/message/ConversationSections.tsx", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: () => ({}) });
  const match = exports.matchesSection;
  const chat = { category: "projects", pinned: true };
  assert.equal(match(chat, "all"), true);
  assert.equal(match(chat, "pinned"), true);
  assert.equal(match(chat, "orders"), false);
  assert.equal(match({ ...chat, archived: true }, "all"), false);
  assert.equal(match({ ...chat, archived: true }, "projects"), false);
  assert.equal(match({ ...chat, archived: true }, "archived"), true);
  assert.equal(
    match({ ...chat, blocked: true, archived: true }, "archived"),
    false,
  );
  assert.equal(
    match({ ...chat, blocked: true, archived: true }, "blocked"),
    true,
  );
});

test("history deduplicates overlapping pages and rejects rows from another project", async () => {
  const row = (i) => ({
    message_id: String(i).padStart(4, "0"),
    conversation_id: "chat",
    sender_id: "sender",
    created_at: "2026-09-06T12:00:00+00:00",
    message: "Project A",
  });
  const first = Array.from({ length: 500 }, (_, i) => row(i));
  const { api, ranges } = service({
    pages: [
      first,
      [row(499), { ...row(900), conversation_id: "other-project" }, row(500)],
    ],
  });
  const messages = await api.getConversationMessages("chat");
  assert.equal(messages.length, 501);
  assert.equal(new Set(messages.map((m) => m.messageId)).size, 501);
  assert.ok(messages.every((m) => m.conversationId === "chat"));
  assert.ok(
    ranges.every((q) =>
      q.filters.some(
        ([column, value]) => column === "conversation_id" && value === "chat",
      ),
    ),
  );
  assert.match(ranges[1].cursor, /created_at.gt.2026-09-06T12:00:00\+00:00/);
  assert.match(ranges[1].cursor, /message_id.gt.0499/);
});
test("a repeated full history page cannot loop indefinitely", async () => {
  const page = Array.from({ length: 500 }, (_, i) => ({
    message_id: String(i),
    conversation_id: "chat",
    sender_id: "sender",
    created_at: "2026-09-06T12:00:00Z",
  }));
  const { api, ranges } = service({ pages: [page, page, page] });
  assert.equal((await api.getConversationMessages("chat")).length, 500);
  assert.equal(ranges.length, 2);
});
test("only missing-schema errors disable automatic preference retries", () => {
  const { api } = service();
  assert.equal(api.isMessagingSetupMissing({ code: "PGRST205" }), true);
  assert.equal(api.isMessagingSetupMissing({ code: "42P01" }), true);
  assert.equal(api.isMessagingSetupMissing({ code: "42501" }), false);
  assert.equal(api.isMessagingSetupMissing(new Error("network failed")), false);
});
