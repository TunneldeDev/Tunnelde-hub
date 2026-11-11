import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { getEventListeners } from "node:events";
import { test } from "node:test";
import { createEditorBufferClient } from "../sdk/editor/client.mjs";
import { createPlugin } from "../sdk/tunnelde-plugin.mjs";

const id = { tabId: "tab", documentId: "doc", version: 0 };
const meta = { ...id, path: "/a.txt", name: "a.txt", utf16Length: 3, dirty: false };
const changed = (revision, snapshot = meta) => ({ schemaVersion: 1, revision, changed: true, snapshot: { ...snapshot } });
const unchanged = revision => ({ schemaVersion: 1, revision, changed: false });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test("observation projects immutable metadata, null states and conditional replies", async () => {
  const envelope = changed("a", { ...meta, content: "secret", sessionId: "private" });
  let reply = envelope;
  const calls = [], client = createEditorBufferClient({ call: async (...args) => { calls.push(args); return reply; } });
  const first = await client.observe({ tabId: "tab" });
  assert.deepEqual(first.snapshot, meta);
  assert(Object.isFrozen(first.snapshot));
  envelope.snapshot.name = "mutated";
  assert.equal(first.snapshot.name, "a.txt");
  reply = unchanged("a");
  assert.deepEqual(await client.observe({ tabId: "tab", revision: "a" }), unchanged("a"));
  reply = { schemaVersion: 1, revision: "b", changed: true, snapshot: null };
  assert.equal((await client.observe()).snapshot, null);
  assert.equal(calls[0][0], "editor.observe");
  assert(Object.isFrozen(client));
});

test("observation rejects invalid selectors, tokens, mismatched identities and envelopes", async () => {
  let count = 0;
  const client = createEditorBufferClient({ call: async () => { count++; return changed("a"); } });
  for (const value of [null, [], { extra: true }, { tabId: null }, { tabId: "" }, { tabId: "a\0" },
    { revision: null }, { revision: "" }, { revision: "😀".repeat(33) }, { revision: "\u0085" }])
    await assert.rejects(client.observe(value), /Invalid editor buffer request/);
  assert.equal(count, 0);
  for (const [reply, request] of [
    [null, {}], [unchanged("a"), {}], [unchanged("b"), { revision: "a" }],
    [{ ...unchanged("a"), snapshot: null }, { revision: "a" }], [changed("a"), { revision: "a" }],
    [changed("a", { ...meta, tabId: "wrong" }), { tabId: "tab" }],
    [changed("a", { ...meta, version: 0.1 }), {}], [changed("a", { ...meta, dirty: 1 }), {}],
    [changed("a", { ...meta, utf16Length: -1 }), {}], [{ ...changed("a"), schemaVersion: 2 }, {}],
  ]) await assert.rejects(createEditorBufferClient({ call: async () => reply }).observe(request), /Invalid editor buffer response/);
});

test("range reads bind identities, preserve options and expose only bounded text fields", async () => {
  const options = { signal: new AbortController().signal, timeoutMs: 3000 };
  const response = { schemaVersion: 1, ...id, offset: 0, totalLength: 3, text: "a😀", nextOffset: null, private: true };
  let args;
  const client = createEditorBufferClient({ call: async (...values) => { args = values; return response; } });
  const result = await client.readRange({ ...id, offset: 0, limit: 3 }, options);
  assert.deepEqual(args, ["editor.readRange", { ...id, offset: 0, limit: 3 }, options]);
  assert.equal(Object.hasOwn(result, "private"), false);
  assert(Object.isFrozen(result));
  for (const fields of [{ documentId: "wrong" }, { version: 1 }, { offset: 1 }, { text: "longer" },
    { nextOffset: 3 }, { totalLength: 2 }, { text: "\ud800", totalLength: 1 }, { totalLength: 5, text: "", nextOffset: 0 }])
    await assert.rejects(createEditorBufferClient({ call: async () => ({ ...response, ...fields }) }).readRange({ ...id, offset: 0, limit: 3 }), /Invalid editor buffer response/);
  assert.deepEqual(await createEditorBufferClient({ call: async () => ({ ...response, text: "a", totalLength: 3, nextOffset: 1 }) }).readRange({ ...id, offset: 0, limit: 2 }),
    { schemaVersion: 1, ...id, offset: 0, totalLength: 3, text: "a", nextOffset: 1 });
});

test("mutation facade snapshots caller edits, performs one CAS call and never retries", async () => {
  const gate = deferred(), request = { ...id, edits: [{ start: 0, end: 1, text: "b" }] };
  let captured, calls = 0;
  const client = createEditorBufferClient({ call: async (method, params) => { assert.equal(method, "editor.applyEdits"); calls++; captured = params; return gate.promise; } });
  const pending = client.applyEdits(request);
  request.edits[0].text = "changed"; request.version = 9;
  assert.deepEqual(captured, { ...id, edits: [{ start: 0, end: 1, text: "b" }] });
  assert(Object.isFrozen(captured.edits[0]));
  gate.resolve({ schemaVersion: 1, ...id, version: 1, dirty: true, utf16Length: 3, private: true });
  assert.deepEqual(await pending, { schemaVersion: 1, ...id, version: 1, dirty: true, utf16Length: 3 });
  const failing = createEditorBufferClient({ call: async () => { calls++; throw new Error("editor.documentChanged"); } });
  await assert.rejects(failing.applyEdits({ ...id, edits: [] }), /editor.documentChanged/);
  assert.equal(calls, 2);
});

test("requests reject invalid offsets, overlapping edits, surrogate text and aggregate size before transport", async () => {
  const client = createEditorBufferClient({ call: () => assert.fail("must not call transport") });
  for (const fields of [{ offset: -1 }, { offset: 0.1 }, { limit: 1 }, { limit: null }, { limit: 16385 }, { version: -1 }, { documentId: "" }, { future: true }])
    await assert.rejects(client.readRange({ ...id, offset: 0, ...fields }), /Invalid editor buffer request/);
  for (const edits of [null, [{ start: 0, end: 1, text: "\ud800" }], [{ start: 0, end: 1, text: "😀".repeat(16385) }],
    [{ start: 0, end: 1, text: "a" }, { start: 0, end: 0, text: "b" }],
    [{ start: 1, end: 3, text: "a" }, { start: 2, end: 2, text: "b" }],
    [{ start: 0, end: 1, text: "a", extra: true }], [{ start: 2, end: 1, text: "a" }],
    Array.from({ length: 129 }, () => ({ start: 0, end: 0, text: "" }))])
    await assert.rejects(client.applyEdits({ ...id, edits }), /Invalid editor buffer request/);
});

test("mutation results reject wrong lifetimes, unsafe versions and oversized metadata", async () => {
  const response = { schemaVersion: 1, ...id, version: 1, dirty: true, utf16Length: 3 };
  for (const fields of [{ tabId: "wrong" }, { documentId: "new" }, { version: 2 }, { version: -1 }, { dirty: 1 }, { utf16Length: 2097153 }, { schemaVersion: 2 }])
    await assert.rejects(createEditorBufferClient({ call: async () => ({ ...response, ...fields }) }).applyEdits({ ...id, edits: [] }), /Invalid editor buffer response/);
});

test("selector subscriptions retain their tab and serialize slow callbacks without overlapping reads", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const owner = new AbortController(), callback = deferred(), calls = [], received = [];
  const replies = [changed("a"), unchanged("a"), { schemaVersion: 1, revision: "c", changed: true, snapshot: null }];
  const client = createEditorBufferClient({ call: async (...args) => { calls.push(args); return replies.shift(); } });
  const options = { signal: owner.signal, tabId: "tab", intervalMs: 1000 };
  const sub = client.subscribe(value => { received.push(value); return received.length === 1 ? callback.promise : undefined; }, options);
  options.tabId = "changed";
  await flush(); t.mock.timers.tick(60000); await flush(); assert.equal(calls.length, 1);
  callback.resolve(); await flush(); t.mock.timers.tick(1000); await flush();
  assert.equal(received.length, 1);
  t.mock.timers.tick(1000); await flush(); assert.equal(received[1], null);
  assert.deepEqual(calls.map(args => args.slice(0, 2)), [["editor.observe", { tabId: "tab" }],
    ["editor.observe", { tabId: "tab", revision: "a" }], ["editor.observe", { tabId: "tab", revision: "a" }]]);
  assert(calls.every(args => args[2].timeoutMs === 10000));
  owner.abort(); assert.deepEqual(await sub.done, { reason: "aborted" });
  assert.equal(getEventListeners(owner.signal, "abort").length, 0);
});

test("cancelled unsettled subscriptions retain quota and fence late replies", async () => {
  const pending = deferred(), owner = new AbortController(), signals = [];
  const client = createEditorBufferClient({ call: (_method, _params, options) => { signals.push(options.signal); return pending.promise; } });
  const subscriptions = Array.from({ length: 8 }, () => client.subscribe(() => assert.fail("late delivery"), { signal: owner.signal }));
  await flush(); owner.abort();
  assert(signals.every(signal => signal.aborted));
  assert.throws(() => client.subscribe(() => {}, { signal: new AbortController().signal }), /Too many/);
  pending.resolve(changed("late"));
  for (const sub of subscriptions) assert.deepEqual(await sub.done, { reason: "aborted" });
  const stopped = client.subscribe(() => assert.fail(), { signal: new AbortController().signal });
  stopped.stop(); assert.deepEqual(await stopped.done, { reason: "stopped" });
});

test("subscription validation, callback failures and owner cancellation clean up", async () => {
  const owner = new AbortController(), error = new Error("callback failed");
  const client = createEditorBufferClient({ call: async () => changed("a") });
  for (const options of [{}, { signal: owner.signal, intervalMs: 1 }, { signal: owner.signal, tabId: null }])
    assert.throws(() => client.subscribe(() => {}, options));
  const sub = client.subscribe(() => { throw error; }, { signal: owner.signal });
  assert.deepEqual(await sub.done, { reason: "failed", error });
  assert.equal(sub.closed, true);
  assert.equal(getEventListeners(owner.signal, "abort").length, 0);
});

test("real stdio cancellation removes the pending read and ignores late responses", async () => {
  const input = new PassThrough(), output = new PassThrough(), lines = [];
  output.on("data", chunk => lines.push(...chunk.toString().trim().split("\n").map(JSON.parse)));
  const plugin = createPlugin({}, { input, output }), owner = new AbortController();
  const sub = createEditorBufferClient(plugin.host).subscribe(() => assert.fail(), { signal: owner.signal, tabId: "tab" });
  await flush();
  const request = lines.find(value => value.method === "editor.observe");
  assert.deepEqual(request.params, { tabId: "tab" });
  owner.abort(); assert.deepEqual(await sub.done, { reason: "aborted" });
  input.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: changed("late") }) + "\n");
  await flush();
  await plugin.close();
});

test("real stdio deadlines fail a subscription without overlapping or retrying", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const input = new PassThrough(), output = new PassThrough(), lines = [];
  output.on("data", chunk => lines.push(...chunk.toString().trim().split("\n").map(JSON.parse)));
  const plugin = createPlugin({}, { input, output }), owner = new AbortController();
  const sub = createEditorBufferClient(plugin.host).subscribe(() => assert.fail(), { signal: owner.signal });
  await flush(); t.mock.timers.tick(10000); await flush();
  const result = await sub.done;
  assert.equal(result.reason, "failed"); assert.match(result.error.message, /timed out: editor.observe/);
  assert.equal(lines.filter(value => value.method === "editor.observe").length, 1);
  await plugin.close();
});
