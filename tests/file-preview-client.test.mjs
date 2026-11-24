import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";
import ts from "typescript";
import { createFilePreviewClient } from "../sdk/files/preview/client.mjs";

const id = { id: "preview", revision: "frame" };
const metadata = { ...id, attemptId: "attempt", source: { kind: "remote", sessionId: "peer" }, path: "/a.png",
  line: 0, column: 0, presentation: "quickLook", renderer: "image", providerId: "render:image", providerCount: 1, state: "ready", errorCode: null };
const changed = () => structuredClone({ schemaVersion: 1, revision: "observation", changed: true, snapshot: metadata });
const page = () => structuredClone({ schemaVersion: 1, ...id, total: 1, offset: 0, nextOffset: null, items: [{ id: "render:image", name: "Images", renderer: "image" }] });
const accepted = { schemaVersion: 1, accepted: true };
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };

test("docked preview metadata and explicit layout actions retain the same typed resource identity", async () => {
  const raw = changed(); raw.snapshot.presentation = "docked";
  const calls = [];
  const client = createFilePreviewClient({ call: async (method, params) => {
    calls.push([method, params]); return method === "filePreview.observe" ? raw : accepted;
  } });
  assert.deepEqual((await client.observe()).snapshot, raw.snapshot);
  for (const action of ["dock", "undock"]) {
    assert.deepEqual(await client.action({ ...id, action }), accepted);
    assert.deepEqual(calls.at(-1), ["filePreview.action", { ...id, action }]);
    await assert.rejects(client.action({ ...id, action, providerId: "extra" }), /Invalid file preview request/);
  }
});

test("preview types resolve classified contracts and require explicit endpoints and revisions", () => {
  const program = ts.createProgram([resolve("tests/fixtures/file-preview/consumer.mts")], {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: false, types: ["node"],
  });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
});

test("preview replies preserve explicit endpoint, immutable metadata, conditional null and provider order", async () => {
  let raw = changed(); raw.snapshot.private = "secret";
  const calls = [], client = createFilePreviewClient({ call: async (...args) => { calls.push(args); return raw; } });
  const value = await client.observe(); assert.deepEqual(value, changed());
  raw.snapshot.source.sessionId = "mutated"; assert.equal(value.snapshot.source.sessionId, "peer");
  assert(Object.isFrozen(value.snapshot.source)); assert(Object.isFrozen(value.snapshot));
  raw = { schemaVersion: 1, revision: "closed", changed: true, snapshot: null };
  assert.deepEqual(await client.observe(), raw);
  raw = { schemaVersion: 1, revision: "closed", changed: false };
  assert.deepEqual(await client.observe({ revision: "closed" }), raw);
  raw = page(); raw.items[0].url = "private://renderer";
  const options = { signal: new AbortController().signal, timeoutMs: 4000 };
  const providers = await client.providers({ ...id, limit: 1 }, options);
  assert.deepEqual(providers, page()); assert(Object.isFrozen(providers.items[0]));
  assert.deepEqual(calls.at(-1), ["filePreview.providers", { ...id, limit: 1 }, options]);
});

test("preview requests reject malformed fields, getters, symbols, unsafe coordinates and implicit targets", async () => {
  let calls = 0;
  const client = createFilePreviewClient({ call: async () => { calls++; assert.fail(); } });
  for (const input of [null, [], { revision: null }, { revision: "bad\n" }, { revision: "\ud800" }, { revision: "😀".repeat(33) },
    { get revision() { assert.fail(); } }, { [Symbol()]: 1 }, { extra: true }])
    await assert.rejects(client.observe(input), /Invalid file preview request/);
  for (const input of [{ limit: 0 }, { limit: 33 }, { offset: 0.1 }, { revision: "" }, { extra: 1 }])
    await assert.rejects(client.providers({ ...id, ...input }), /Invalid file preview request/);
  for (const input of [{ action: "close", providerId: "extra" }, { action: "selectProvider", providerId: "" },
    { action: "close", revision: null }, { action: "delete" }])
    await assert.rejects(client.action({ ...id, ...input }), /Invalid file preview request/);
  const good = { source: { kind: "remote", sessionId: "peer" }, path: "/a" };
  for (const input of [null, { ...good, source: { kind: "remote" } }, { ...good, source: { kind: "local", sessionId: "extra" } },
    { ...good, source: { get kind() { assert.fail(); } } }, { ...good, path: "relative" }, { ...good, path: "/\0" },
    { ...good, path: "/" + "中".repeat(10923) }, { ...good, line: null }, { ...good, column: -1 },
    { ...good, line: Number.MAX_SAFE_INTEGER + 1 }, { ...good, line: NaN }, { ...good, ticket: "private" }])
    await assert.rejects(client.open(input), /Invalid file preview request/);
  assert.equal(calls, 0);
});

test("preview replies reject invalid state/error combinations, identity, pagination, accessors and unsafe values", async () => {
  for (const mutate of [v => v.schemaVersion = 2, v => v.snapshot.state = "done", v => v.snapshot.errorCode = "readFailed",
    v => v.snapshot.attemptId = "", v => v.snapshot.source.sessionId = "", v => v.snapshot.path = "relative",
    v => v.snapshot.line = -1, v => v.snapshot.column = Number.MAX_SAFE_INTEGER + 1,
    v => v.snapshot.presentation = "panel", v => v.snapshot.providerCount = 0,
    v => { v.snapshot.state = "error"; v.snapshot.errorCode = null; },
    v => { v.snapshot.state = "unavailable"; v.snapshot.errorCode = "rendererUnavailable"; },
    v => Object.defineProperty(v.snapshot, "renderer", { get() { assert.fail(); } })]) {
    const raw = changed(); mutate(raw);
    await assert.rejects(createFilePreviewClient({ call: async () => raw }).observe(), /Invalid file preview response/);
  }
  for (const mutate of [v => v.id = "other", v => v.revision = "later", v => v.offset = 1, v => v.total = 0,
    v => v.items = [], v => v.items = Array(1), v => v.nextOffset = 1,
    v => { v.items.push({ ...v.items[0] }); v.total = 2; }, v => v.items[0].name = "中".repeat(41),
    v => v.items[0].renderer = "html"]) {
    const raw = page(); mutate(raw);
    await assert.rejects(createFilePreviewClient({ call: async () => raw }).providers(id), /Invalid file preview response/);
  }
  await assert.rejects(createFilePreviewClient({ call: async () => ({ schemaVersion: 1, revision: "x", changed: false }) }).observe(), /Invalid file preview response/);
  await assert.rejects(createFilePreviewClient({ call: async () => changed() }).observe({ revision: "observation" }), /Invalid file preview response/);
});

test("preview mutations detach requests and call once even if acknowledgement is lost", async () => {
  const gate = deferred(), input = { source: { kind: "remote", sessionId: "peer" }, path: "/a.pdf", line: 2 }, calls = [];
  const client = createFilePreviewClient({ call: async (...args) => { calls.push(args); return gate.promise; } });
  const pending = client.open(input); input.source.sessionId = "changed"; input.path = "/b.pdf";
  assert.deepEqual(calls[0].slice(0, 2), ["filePreview.open", { source: { kind: "remote", sessionId: "peer" }, path: "/a.pdf", line: 2 }]);
  assert(Object.isFrozen(calls[0][1].source)); gate.resolve(accepted); assert.deepEqual(await pending, accepted);
  let failures = 0;
  const failed = createFilePreviewClient({ call: async () => { failures++; throw Error("lost acknowledgement"); } });
  await assert.rejects(failed.action({ ...id, action: "retry" }), /lost acknowledgement/);
  assert.equal(failures, 1);
  await assert.rejects(createFilePreviewClient({ call: async () => ({ accepted: true }) }).action({ ...id, action: "close" }), /Invalid file preview response/);
});

test("composite renderer IDs preserve both maximum manifest identifiers without truncation", async () => {
  const providerId = "p".repeat(64) + ":" + "r".repeat(64);
  let raw = changed(); raw.snapshot.providerId = providerId;
  const client = createFilePreviewClient({ call: async () => raw });
  assert.equal((await client.observe()).snapshot.providerId, providerId);
  raw = page(); raw.items[0].id = providerId;
  assert.equal((await client.providers(id)).items[0].id, providerId);
  raw = accepted;
  assert.deepEqual(await client.action({ ...id, action: "selectProvider", providerId }), accepted);
  await assert.rejects(client.action({ ...id, action: "selectProvider", providerId: providerId + "x" }), /Invalid file preview request/);
});

test("preview observers serialize deliveries, coalesce unchanged frames, and retain pending quota after cancel", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const owner = new AbortController(), gate = deferred(), calls = [], received = [];
  const client = createFilePreviewClient({ call: async (...args) => { calls.push(args);
    return calls.length === 1 ? changed() : { schemaVersion: 1, revision: "observation", changed: false }; } });
  const subscription = client.subscribe(async value => { received.push(value); await gate.promise; }, { signal: owner.signal, intervalMs: 1000 });
  await flush(); t.mock.timers.tick(10000); await flush(); assert.equal(calls.length, 1);
  gate.resolve(); await flush(); t.mock.timers.tick(1000); await flush();
  assert.deepEqual(calls[1][1], { revision: "observation" }); assert.equal(received.length, 1);
  owner.abort(); assert.deepEqual(await subscription.done, { reason: "aborted" });
  const pending = deferred(), source = new AbortController(), busy = createFilePreviewClient({ call: async () => pending.promise });
  assert.throws(() => busy.subscribe(() => {}), /owner AbortSignal/);
  const handles = Array.from({ length: 8 }, () => busy.subscribe(() => {}, { signal: source.signal }));
  await flush(); handles[0].stop(); assert.throws(() => busy.subscribe(() => {}, { signal: source.signal }), /Too many observation/);
  source.abort(); pending.resolve(changed()); await Promise.all(handles.map(h => h.done));
});

test("actual host preview producers remain compatible with independent SDK consumers", { skip: !process.env.TUNNELDE_FILE_PREVIEW_CONTRACT_OUTPUT }, async () => {
  const { samples } = JSON.parse(await readFile(process.env.TUNNELDE_FILE_PREVIEW_CONTRACT_OUTPUT, "utf8"));
  assert(samples.length >= 8);
  for (const sample of samples) {
    const client = createFilePreviewClient({ call: async () => sample.result });
    assert.deepEqual(await client[sample.method.slice("filePreview.".length)](sample.params), sample.result);
  }
});
