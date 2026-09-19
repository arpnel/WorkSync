/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const api = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("lib/readCache.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports: api },
);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("fresh data is reused and expires after the TTL", async () => {
  let now = 0,
    calls = 0;
  const cache = new api.ReadCache(30, 40, () => now);
  const fetcher = async () => ++calls;
  assert.equal(await cache.read("a", fetcher), 1);
  now = 29;
  assert.equal(await cache.read("a", fetcher), 1);
  now = 30;
  assert.equal(await cache.read("a", fetcher), 2);
});
test("simultaneous normal reads share one request", async () => {
  const cache = new api.ReadCache();
  const wait = deferred();
  let calls = 0;
  const fetcher = () => {
    ++calls;
    return wait.promise;
  };
  const first = cache.read("a", fetcher),
    second = cache.read("a", fetcher);
  wait.resolve("saved");
  assert.deepEqual(await Promise.all([first, second]), ["saved", "saved"]);
  assert.equal(calls, 1);
});
test("a post-mutation forced read cannot be overwritten by an older response", async () => {
  const cache = new api.ReadCache();
  const old = deferred();
  const first = cache.read("a", () => old.promise);
  await cache.read("a", async () => "approved", true);
  old.resolve("submitted");
  await first;
  assert.equal(await cache.read("a", async () => "unexpected"), "approved");
});
test("clearing during a read prevents the old response from repopulating cache", async () => {
  const cache = new api.ReadCache();
  const old = deferred();
  const first = cache.read("user-a:project", () => old.promise);
  cache.clear();
  old.resolve("old account");
  await first;
  assert.equal(
    await cache.read("user-a:project", async () => "fresh"),
    "fresh",
  );
  assert.equal(
    await cache.read("user-b:project", async () => "other account"),
    "other account",
  );
});
test("failed reads can be retried and do not cache an error", async () => {
  const cache = new api.ReadCache();
  await cache.read("a", async () => "old");
  await assert.rejects(
    cache.read(
      "a",
      async () => {
        throw new Error("offline");
      },
      true,
    ),
  );
  assert.equal(await cache.read("a", async () => "recovered"), "recovered");
});
test("the entry limit evicts old data", async () => {
  const cache = new api.ReadCache(30_000, 2);
  await cache.read("a", async () => 1);
  await cache.read("b", async () => 2);
  await cache.read("c", async () => 3);
  assert.equal(await cache.read("a", async () => 4), 4);
});
