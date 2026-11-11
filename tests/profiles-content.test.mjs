import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getEventListeners } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import schema from "../sdk/preferences/schema.json" with { type: "json" };
import { createProfilesClient } from "../sdk/profiles/client.mjs";
import { createPlugin } from "../sdk/tunnelde-plugin.mjs";
import { chunk, MAX_CONTENT_BYTES } from "../sdk/profiles/content/validation.mjs";
import { profileValues } from "../sdk/profiles/content/values.mjs";

const revision = "pc1:" + "a".repeat(64), id = "work";
const catalogue = { version: 1, revision, activeId: id, items: [{ id, name: "Work", updatedAt: 1 }] };
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve: value => resolve(value) }; };
// Small schema-valid values for hostile-transport tests; interoperability tests
// below consume actual Rust output, rather than claiming these are native data.
function minimal(rule) {
  if (rule.enum) return rule.enum[0];
  if (rule.anyOf) return minimal(rule.anyOf[0]);
  return ({ string: () => "", boolean: () => false, integer: () => rule.minimum ?? 0,
    number: () => rule.minimum ?? 0, null: () => null, array: () => [],
    object: () => Object.fromEntries((rule.required ?? []).map(key => [key, minimal(rule.properties[key])])),
  })[rule.type]();
}
const values = Object.fromEntries(Object.entries(schema.groups).map(([key, rule]) => [key, minimal(rule)]));
function response(text, request, step = 65_536) {
  const bytes = new TextEncoder().encode(text);
  let end = Math.min(request.offset + step, bytes.length);
  while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
  return { version: 1, id, revision, offset: request.offset, totalBytes: bytes.length,
    text: new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(request.offset, end)), nextOffset: end === bytes.length ? null : end };
}
const owner = () => ({ signal: new AbortController().signal });

test("content catalogue validates detached immutable metadata, selection and content revision", async () => {
  const raw = structuredClone(catalogue); raw.private = "secret"; raw.items[0].settings = "private";
  const calls = [], client = createProfilesClient({ call: async (...args) => { calls.push(args); return raw; } });
  const result = await client.catalogue(); assert.deepEqual(result, catalogue);
  assert(Object.isFrozen(result) && Object.isFrozen(result.items) && Object.isFrozen(result.items[0]));
  raw.items[0].name = "changed"; assert.equal(result.items[0].name, "Work");
  assert.deepEqual(calls, [["profiles.catalogue", {}, undefined]]);
  for (const mutation of [{ version: 2 }, { revision: "p1:metadata" }, { revision: revision + "\n" }, { activeId: "missing" }, { activeId: undefined }, { items: [] }])
    await assert.rejects(createProfilesClient({ call: async () => ({ ...catalogue, ...mutation }) }).catalogue());
});

test("read assembles exact UTF-8 segments, validates public groups and deep-freezes without leaking native fields", async () => {
  const raw = structuredClone(values); raw.appearance.userCss = "/*中文😀*/";
  const text = JSON.stringify(raw), request = { id, revision }, calls = [];
  const client = createProfilesClient({ call: async (method, params, options) => {
    assert.equal(method, "profiles.read"); calls.push({ ...params });
    assert(options.signal instanceof AbortSignal && options.timeoutMs > 0 && options.timeoutMs <= 30_001);
    return { ...response(text, params, 37), private: "not copied" };
  } });
  const promise = client.read(request, owner()); request.id = "changed";
  const result = await promise; assert.deepEqual(result, raw); assert(calls.length > 1);
  assert(calls.every(item => item.id === id && item.revision === revision));
  assert(Object.isFrozen(result.appearance.colors));
  assert.throws(() => { result.appearance.userCss = "changed"; });
  for (const bad of [{ ...raw, uiProviders: {} }, { ...raw, appearance: { ...raw.appearance, private: 1 } },
    { ...raw, appearance: { ...raw.appearance, userCss: "x".repeat(200_001) } },
    { ...raw, network: { ...raw.network, profiles: [{ password: "secret" }] } }, { ...raw, terminal: null }])
    assert.throws(() => profileValues(JSON.stringify(bad)), /^Error: Invalid public profile values$/);
  assert.throws(() => profileValues('{"userCss":"\\ud800"}'));
});

test("invalid request, owner, deadline and null fields fail before any transport", async () => {
  const client = createProfilesClient({ call: async () => assert.fail() });
  for (const request of [null, [], {}, { id, revision: "p1:metadata" }, { id: "\ud800", revision }, { id: "x".repeat(129), revision },
    { id, revision: revision.toUpperCase() }, { id, revision, extra: true }]) await assert.rejects(client.read(request, owner()), TypeError);
  for (const options of [undefined, {}, { signal: null }, { ...owner(), timeoutMs: 0 }, { ...owner(), timeoutMs: 120_001 },
    { ...owner(), timeoutMs: 1.1 }, { ...owner(), timeoutMs: NaN }, { ...owner(), other: 1 }])
    await assert.rejects(client.read({ id, revision }, options), TypeError);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(client.read({ id, revision }, { signal: cancelled.signal }), { name: "AbortError" });
});

test("malformed progress, byte count, mixed revisions and inconsistent totals never deliver a partial profile", async () => {
  const request = { id, revision, offset: 0, limit: 65_536 }, good = response(JSON.stringify(values), request);
  for (const mutation of [{ version: 2 }, { id: "other" }, { revision: "pc1:" + "b".repeat(64) }, { offset: 1 },
    { text: "\ud800" }, { totalBytes: MAX_CONTENT_BYTES + 1 }, { totalBytes: -1 }, { totalBytes: 2.5 },
    { nextOffset: 1 }, { nextOffset: good.totalBytes }, { text: "", nextOffset: 0 }, { text: "x".repeat(65_537) }])
    assert.throws(() => chunk({ ...good, ...mutation }, request), /Invalid profile content response/);
  const text = JSON.stringify(values);
  for (const change of [reply => { reply.revision = "pc1:" + "b".repeat(64); }, reply => { reply.totalBytes++; }]) {
    let count = 0;
    const client = createProfilesClient({ call: async (_method, params) => {
      const reply = response(text, params, 100); if (++count === 2) change(reply); return reply;
    } });
    await assert.rejects(client.read({ id, revision }, owner()), /Invalid profile content response/);
    assert.equal(count, 2);
  }
});

test("cancelled pending transports retain quota and late values are never accepted", async () => {
  const pending = deferred(), signal = new AbortController(), calls = [];
  const client = createProfilesClient({ call: async (_method, _params, options) => { calls.push(options); return pending.promise; } });
  const operations = Array.from({ length: 4 }, () => client.read({ id, revision }, { signal: signal.signal }));
  const results = operations.map(promise => promise.catch(error => error));
  await flush(); signal.abort(); assert(calls.every(call => call.signal.aborted));
  await assert.rejects(client.read({ id, revision }, owner()), /Too many/);
  pending.resolve(response(JSON.stringify(values), { id, revision, offset: 0 }));
  assert((await Promise.all(results)).every(error => error.name === "AbortError"));
  assert.equal(getEventListeners(signal.signal, "abort").length, 0);
  const next = client.read({ id, revision }, owner()); await next;
});

test("one deadline covers all pages and host conflict is preserved without restart", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const waiting = deferred(), calls = [], text = JSON.stringify(values);
  const client = createProfilesClient({ call: async (_method, params, options) => {
    calls.push(options); if (calls.length === 2) return waiting.promise; return response(text, params, 100);
  } });
  const result = client.read({ id, revision }, { ...owner(), timeoutMs: 1000 }).catch(error => error);
  await flush(); assert.equal(calls.length, 2); t.mock.timers.tick(1000);
  assert(calls[1].signal.aborted); waiting.resolve(response(text, { offset: 100 }, 100));
  assert.equal((await result).name, "TimeoutError"); assert.equal(calls.length, 2);
  let attempts = 0;
  await assert.rejects(createProfilesClient({ call: async () => { attempts++; throw new Error("profiles.conflict"); } }).read({ id, revision }, owner()), /profiles.conflict/);
  assert.equal(attempts, 1);
});

test("hostile one-byte pagination stops at a fixed page budget", async () => {
  let calls = 0;
  const client = createProfilesClient({ call: async (_method, request) => {
    calls++; return { version: 1, id, revision, offset: request.offset, totalBytes: 10_000, text: " ", nextOffset: request.offset + 1 };
  } });
  await assert.rejects(client.read({ id, revision }, owner()), /page limit/); assert.equal(calls, 4096);
});

test("real stdio abort sends a cancellation control frame and rejects late responses", async () => {
  const input = new PassThrough(), output = new PassThrough(), requests = [];
  output.on("data", bytes => requests.push(JSON.parse(bytes.toString())));
  const runtime = createPlugin({}, { input, output }), controller = new AbortController();
  try {
    const result = createProfilesClient(runtime.host).read({ id, revision }, { signal: controller.signal }).catch(error => error);
    await flush(); assert.equal(requests[0].method, "profiles.read"); controller.abort();
    assert.equal((await result).name, "AbortError");
    input.write(JSON.stringify({ jsonrpc: "2.0", id: requests[0].id, result: response(JSON.stringify(values), { offset: 0 }) }) + "\n");
    await flush(); assert.equal(requests.filter(item => item.method === "profiles.read").length, 1);
    assert.deepEqual(requests[1], { jsonrpc: "2.0", method: "$/cancelRequest", params: { id: requests[0].id } });
  } finally { runtime.close(); }
});

test("actual large Rust profile producer satisfies catalogue, segmented SDK assembly and preference schema", { skip: !process.env.TUNNELDE_PROFILE_CONTENT_OUTPUT }, async () => {
  const fixture = JSON.parse(await readFile(process.env.TUNNELDE_PROFILE_CONTENT_OUTPUT, "utf8"));
  const calls = [], client = createProfilesClient({ call: async (method, request) => {
    calls.push(method);
    if (method === "profiles.catalogue") return fixture.catalogue;
    assert.equal(method, "profiles.read");
    assert.equal(request.id, fixture.catalogue.items[0].id); assert.equal(request.revision, fixture.catalogue.revision);
    return fixture.pages.find(page => page.offset === request.offset);
  } });
  const catalogue = await client.catalogue();
  const result = await client.read({ id: catalogue.items[0].id, revision: catalogue.revision }, owner());
  assert.deepEqual(result, fixture.values); assert(calls.length > 2);
});
