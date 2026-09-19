/* eslint-disable @typescript-eslint/no-require-imports -- Node regression harness inspects actual React element keys. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const runtime = require("react/jsx-runtime");
const source = ts.transpileModule(
  fs.readFileSync("app/home/messages/page.tsx", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
function page(detailsOpen) {
  let stateIndex = 0;
  const conversation = {
    conversationId: "250a2aa0-3d0c-4b1c-a747-8f49b4223832",
    participant: { userId: "other", name: "Carl" },
    lastMessageAt: "2026-09-06T12:00:00Z",
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: (name) => {
      if (name.includes("callMessage"))
        return { callPreview: (value) => value };
      if (name === "react/jsx-runtime") return runtime;
      if (name === "react")
        return {
          useState: (initial) => [
            stateIndex++ === 0 ? detailsOpen : initial,
            () => {},
          ],
        };
      if (name.includes("useMessaging"))
        return {
          useMessaging: () => ({
            preferences: {
              preferences: [],
              blockedUserIds: [],
              blockedByUserIds: [],
            },
            preferencesReady: true,
            conversations: [conversation],
            selectedConversation: conversation,
            selectedConversationId: conversation.conversationId,
            currentUserId: "me",
            messages: [
              {
                messageId: "one",
                senderId: "me",
                senderName: "You",
                message: "testing",
                createdAt: "2026-09-06T12:00:00Z",
              },
            ],
          }),
        };
      const Component = () => null;
      Component.displayName = name.split("/").at(-1);
      return {
        default: Component,
        Input: Component,
        Button: Component,
        X: Component,
        MoreHorizontal: Component,
      };
    },
  });
  return exports.default();
}
for (const detailsOpen of [false, true]) {
  test(
    (detailsOpen ? "shared details" : "message history") +
      " and composer have distinct sibling keys",
    () => {
      const layout = page(detailsOpen);
      const chat = layout.props.children;
      const conversation = chat.props.children[0];
      const children = conversation.props.children.filter(Boolean);
      const keys = children
        .filter((child) => child.key !== null)
        .map((child) => child.key);
      assert.equal(
        keys.length,
        new Set(keys).size,
        "Sibling components must not share the conversation ID as their key",
      );
      const history = children.filter(
        (child) => child.type?.displayName === "MessageScroller",
      );
      const composer = children.filter(
        (child) => child.type?.displayName === "MessageInput",
      );
      assert.equal(history.length, 1);
      const panel = chat.props.children[1];
      assert.equal(Boolean(panel), detailsOpen);
      if (detailsOpen) {
        assert.equal(panel.props.id, "chat-details-panel");
        assert.match(conversation.props.className, /^hidden /);
        assert.match(
          conversation.props.className,
          /@min-\[48rem\]\/chat-pane:flex/,
        );
      }
      assert.equal(composer.length, 1);
    },
  );
}
