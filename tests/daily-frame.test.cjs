/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = ts.transpileModule(
  fs.readFileSync("components/calls/DailyFrame.tsx", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
const flush = () => new Promise((resolve) => setImmediate(resolve));
function mount(secure = true) {
  const events = {};
  const states = [];
  let effect,
    cleanup,
    options,
    ended = 0,
    destroyed = 0,
    joined = 0;
  const frame = {
    on(name, callback) {
      events[name] = callback;
    },
    async join() {
      joined++;
    },
    async destroy() {
      destroyed++;
      events["left-meeting"]?.();
    },
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    window: { isSecureContext: secure },
    navigator: { mediaDevices: {} },
    require(name) {
      if (name === "react")
        return {
          useRef: (value) => ({ current: value === null ? {} : value }),
          useState(value) {
            const i = states.length;
            states.push(value);
            return [
              value,
              (next) => {
                states[i] = typeof next === "function" ? next(states[i]) : next;
              },
            ];
          },
          useEffect(fn) {
            effect = fn;
          },
        };
      if (name === "react/jsx-runtime")
        return { jsx: () => null, jsxs: () => null };
      if (name === "@/components/ui/button") return { Button: () => null };
      if (name === "@daily-co/daily-js")
        return {
          default: {
            createFrame(_container, config) {
              options = config;
              return frame;
            },
          },
        };
      throw new Error(name);
    },
  });
  exports.default({
    roomUrl: "https://example.daily.co/room",
    token: "test",
    onLeave: () => ended++,
  });
  cleanup = effect();
  return {
    events,
    states,
    cleanup,
    get options() {
      return options;
    },
    get ended() {
      return ended;
    },
    get destroyed() {
      return destroyed;
    },
    get joined() {
      return joined;
    },
  };
}
test("device denial followed by leaving preserves the call and actionable error", async () => {
  const view = mount();
  await flush();
  assert.equal(view.joined, 1);
  assert.equal(view.options.showLeaveButton, false);
  view.events["camera-error"]({ error: { type: "permissions" } });
  view.events["left-meeting"]();
  assert.match(view.states[0], /permission was denied/);
  assert.equal(view.ended, 0);
  assert.equal(view.events["participant-left"], undefined);
  view.cleanup();
  assert.equal(view.destroyed, 1);
  assert.equal(view.ended, 0);
});
test("insecure origins explain device restriction without creating a meeting", async () => {
  const view = mount(false);
  await flush();
  assert.equal(view.joined, 0);
  assert.match(view.states[0], /HTTPS or localhost/);
  view.cleanup();
});
test("unmount before SDK initialization does not acquire devices", async () => {
  const view = mount();
  view.cleanup();
  await flush();
  assert.equal(view.joined, 0);
});
