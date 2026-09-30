/* eslint-disable @typescript-eslint/no-require-imports -- Exercise component event handlers with local mocks. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const flush = () => new Promise((resolve) => setImmediate(resolve));
function mount(file, exportName, props, seeds, modules) {
  const api = {},
    states = [];
  let index = 0;
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports: api,
      Error,
      crypto: { randomUUID: () => "file-id" },
      require(name) {
        if (name === "react")
          return {
            useState(value) {
              const i = index++;
              states[i] = Object.hasOwn(seeds, i) ? seeds[i] : value;
              return [
                states[i],
                (v) => {
                  states[i] = v;
                },
              ];
            },
            useEffect() {},
            useCallback: (fn) => fn,
          };
        if (name === "react/jsx-runtime")
          return {
            jsx: (type, props) => ({ type, props }),
            jsxs: (type, props) => ({ type, props }),
          };
        return modules[name] ?? new Proxy({}, { get: (_, key) => String(key) });
      },
    },
  );
  return { tree: api[exportName](props), states };
}
function button(node, text) {
  if (!node || typeof node !== "object") return null;
  if (node.props?.children === text && node.props.onClick) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = button(child, text);
    if (found) return found;
  }
  return null;
}
test("cancelling a meeting uses its row, not the empty or unrelated edit form", async () => {
  const calls = [];
  const row = {
    meeting_id: "meeting",
    title: "Existing meeting",
    starts_at: "2026-10-01T02:00:00Z",
    ends_at: "2026-10-01T03:00:00Z",
    link: "https://example.com",
    status: "scheduled",
  };
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: async () => ({ data: [], error: null }),
  };
  const { tree } = mount(
    "components/project/ProjectMeetings.tsx",
    "default",
    { projectId: "project", active: true },
    { 0: [row] },
    {
      "@/lib/supabaseClient": { supabase: { from: () => chain } },
      "@/services/project/projectMeetingService": {
        saveProjectMeeting: async (...args) => calls.push(args),
      },
    },
  );
  button(tree, "Cancel meeting").props.onClick();
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "project");
  assert.equal(calls[0][1], row);
  assert.equal(calls[0][2], "cancelled");
});
test("document refresh failure preserves committed files, while failed persistence cleans uploads", async () => {
  for (const failWrite of [false, true]) {
    let removed = 0,
      uploaded = 0;
    const query = {
      update: () => query,
      eq: () => query,
      select: () => query,
      single: async () => ({
        error: failWrite ? new Error("Save failed") : null,
      }),
    };
    const { tree, states } = mount(
      "components/profile/DocumentsEditor.tsx",
      "DocumentsEditor",
      {
        userId: "user",
        documents: [],
        onClose() {},
        onSaved() {
          throw new Error("Refresh failed");
        },
      },
      { 1: [{ type: "application/pdf", size: 100 }] },
      {
        "@/lib/supabaseClient": {
          supabase: {
            from: () => query,
            storage: {
              from: () => ({
                upload: async () => {
                  uploaded++;
                  return { error: null };
                },
                remove: async () => {
                  removed++;
                  return { error: null };
                },
              }),
            },
          },
        },
      },
    );
    button(tree, "Save").props.onClick();
    await flush();
    assert.equal(uploaded, 1);
    assert.equal(removed, failWrite ? 1 : 0);
    assert.match(states[5], failWrite ? /Save failed/ : /Documents were saved/);
  }
});
