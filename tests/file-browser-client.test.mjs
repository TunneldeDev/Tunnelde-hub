import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";
import ts from "typescript";
import { createFileBrowserClient } from "../sdk/files/browser/client.mjs";

const id = { paneId: "one", revision: "frame" };
const metadata = { ...id, tabId: "tab", source: { kind: "remote", sessionId: "peer" }, path: "/work",
  total: 2, selectedCount: 3, busy: false, suspended: false, error: null, errorTruncated: false };
const entry = { name: "a.json", path: "/work/a.json", isDir: false, isHidden: false,
  size: 2, modified: -1, permissions: null, selected: true };
const catalogue = { total: 1, offset: 0, nextOffset: null, items: [metadata] };
const changed = (revision = "a") => structuredClone({ schemaVersion: 1, revision, changed: true, snapshot: catalogue });
const listing = () => structuredClone({ schemaVersion: 1, ...id, total: 2, offset: 0, nextOffset: 1, items: [entry] });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };

test("browser types expose classified immutable RPCs and owned facade", () => {
  const program = ts.createProgram([resolve("tests/fixtures/file-browser/consumer.mts")], {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: false, types: ["node"],
  });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
});

test("catalogue snapshots and pages preserve visible order and detached immutable fields", async () => {
  let raw = changed(); raw.snapshot.items[0].private = "secret";
  const calls = [], client = createFileBrowserClient({ call: async (...args) => { calls.push(args); return raw; } });
  const result = await client.observe({ limit: 1 });
  assert.deepEqual(result.snapshot, catalogue);
  raw.snapshot.items[0].source.sessionId = "mutated";
  assert.equal(result.snapshot.items[0].source.sessionId, "peer");
  assert(Object.isFrozen(result.snapshot.items[0].source));
  raw = { schemaVersion: 1, revision: "a", changed: false };
  assert.deepEqual(await client.observe({ revision: "a" }), raw);
  raw = listing(); raw.items[0].private = "secret";
  const options = { signal: new AbortController().signal, timeoutMs: 4000 };
  const page = await client.read({ ...id, limit: 1 }, options);
  assert.deepEqual(page, listing());
  assert.deepEqual(calls.at(-1), ["fileBrowser.read", { ...id, limit: 1 }, options]);
  assert(Object.isFrozen(page.items[0])); assert(Object.isFrozen(client));
});

test("bad selectors, accessors, sparse arrays and unrelated action fields fail before transport", async () => {
  let calls = 0;
  const client = createFileBrowserClient({ call: async () => { calls++; assert.fail(); } });
  for (const request of [null, [], { limit: 0 }, { limit: 33 }, { offset: 0.5 }, { revision: null },
    { revision: "\ud800" }, { revision: "😀".repeat(33) }, { revision: "bad\n" },
    { get offset() { assert.fail(); } }, { [Symbol()]: 1 }]) await assert.rejects(client.observe(request), /Invalid file browser request/);
  for (const request of [{ limit: 257 }, { revision: "" }, { paneId: "bad\n" }, { extra: true }, { offset: -1 }])
    await assert.rejects(client.read({ ...id, ...request }), /Invalid file browser request/);
  for (const request of [{ action: "refresh", path: "/unused" }, { action: "open", path: "" },
    { action: "open", path: "/a", mode: null }, { action: "select", paths: Array(1) },
    { action: "select", paths: ["/a", "/a"] }, { action: "select", paths: Array(257).fill("/a") },
    { action: "select", paths: Object.defineProperty([], "0", { get() { assert.fail(); } }) },
    { action: "navigate", path: "/bad\0" }, { action: "delete", path: "/a" }])
    await assert.rejects(client.action({ ...id, ...request }), /Invalid file browser request/);
  assert.equal(calls, 0);
});

test("replies reject wrong identities, broken pagination, duplicate entries and serialized overflow", async () => {
  for (const mutate of [v => v.paneId = "other", v => v.revision = "new", v => v.schemaVersion = 2,
    v => v.offset = 1, v => v.total = 0, v => v.nextOffset = 0, v => v.items = [],
    v => { v.items.push({ ...v.items[0] }); v.nextOffset = null; },
    v => v.items[0].size = Number.MAX_SAFE_INTEGER + 1, v => v.items[0].permissions = -1,
    v => v.items[0].modified = Infinity, v => v.items[0].name = "\ud800",
    v => v.items[0].path = "/" + "中".repeat(10923),
    v => { v.items = Array.from({ length: 30 }, (_, i) => ({ ...entry, path: `/w/${i}`, name: "中".repeat(1000) })); v.total = 30; v.nextOffset = null; }]) {
    const raw = listing(); mutate(raw);
    await assert.rejects(createFileBrowserClient({ call: async () => raw }).read(id), /Invalid file browser response/);
  }
  for (const raw of [null, { schemaVersion: 1, revision: "a", changed: false },
    { ...changed(), schemaVersion: 2 }, { ...changed(), snapshot: { ...catalogue, nextOffset: 1 } },
    { ...changed(), snapshot: { ...catalogue, items: [{ ...metadata, errorTruncated: true }] } }])
    await assert.rejects(createFileBrowserClient({ call: async () => raw }).observe(), /Invalid file browser response/);
  await assert.rejects(createFileBrowserClient({ call: async () => changed("a") }).observe({ revision: "a" }), /Invalid file browser response/);
});

test("action clones the original selection and makes exactly one nonreplayed call", async () => {
  const gate = deferred(), input = { ...id, action: "select", paths: ["/a"] }, calls = [];
  const client = createFileBrowserClient({ call: async (...args) => { calls.push(args); return gate.promise; } });
  const pending = client.action(input);
  input.paths[0] = "/mutated"; input.revision = "later";
  assert.deepEqual(calls[0][1], { ...id, action: "select", paths: ["/a"] });
  assert(Object.isFrozen(calls[0][1].paths));
  gate.resolve({ accepted: true, private: "ignored" });
  assert.deepEqual(await pending, { accepted: true });
  let failures = 0;
  const failed = createFileBrowserClient({ call: async () => { failures++; throw Error("lost acknowledgement"); } });
  await assert.rejects(failed.action({ ...id, action: "refresh" }), /lost acknowledgement/);
  assert.equal(failures, 1);
  await assert.rejects(createFileBrowserClient({ call: async () => ({ accepted: false }) }).action({ ...id, action: "refresh" }), /Invalid file browser response/);
});

test("owned observations use query selectors, skip unchanged and serialize slow receivers", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const owner = new AbortController(), gate = deferred(), calls = [], received = [];
  let count = 0;
  const client = createFileBrowserClient({ call: async (...args) => { calls.push(args);
    return count++ === 0 ? changed() : { schemaVersion: 1, revision: "a", changed: false }; } });
  const subscription = client.subscribe(async value => { received.push(value); await gate.promise; },
    { signal: owner.signal, offset: 0, limit: 1, intervalMs: 1000 });
  await flush(); t.mock.timers.tick(10000); await flush();
  assert.equal(calls.length, 1); assert.equal(received.length, 1);
  gate.resolve(); await flush(); t.mock.timers.tick(1000); await flush();
  assert.deepEqual(calls[1][1], { offset: 0, limit: 1, revision: "a" });
  assert.equal(received.length, 1);
  owner.abort(); assert.deepEqual(await subscription.done, { reason: "aborted" });
  assert(subscription.closed);
});

test("subscription failures, owner disposal and pending quota retain exact runtime ownership", async () => {
  const gate = deferred(), owner = new AbortController(), client = createFileBrowserClient({ call: async () => gate.promise });
  assert.throws(() => client.subscribe(() => {}), /owner AbortSignal/);
  const live = Array.from({ length: 8 }, () => client.subscribe(() => {}, { signal: owner.signal }));
  await flush(); live[0].stop();
  assert.throws(() => client.subscribe(() => {}, { signal: owner.signal }), /Too many observation/);
  owner.abort(); gate.resolve(changed()); await Promise.all(live.map(s => s.done));
  const thrown = createFileBrowserClient({ call: async () => changed() }).subscribe(() => { throw Error("receiver failed"); }, { signal: new AbortController().signal });
  assert.equal((await thrown.done).reason, "failed");
});

test("real host browser bridge samples remain compatible with the SDK", { skip: !process.env.TUNNELDE_FILE_BROWSER_CONTRACT_OUTPUT }, async () => {
  const { samples } = JSON.parse(await readFile(process.env.TUNNELDE_FILE_BROWSER_CONTRACT_OUTPUT, "utf8"));
  assert(samples.length >= 10);
  for (const sample of samples) {
    const client = createFileBrowserClient({ call: async () => sample.result });
    assert.deepEqual(await client[sample.method.slice("fileBrowser.".length)](sample.params), sample.result);
  }
});
