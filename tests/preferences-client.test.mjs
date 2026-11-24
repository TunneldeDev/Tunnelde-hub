import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { getEventListeners } from "node:events";
import { test } from "node:test";
import { createPreferencesClient } from "../sdk/preferences/client.mjs";
import { createPlugin } from "../sdk/tunnelde-plugin.mjs";

const changed = revision => ({
  version: 1, revision, changed: true,
  snapshot: { version: 1, revision, values: { appearance: { theme: "dark" } }, defaults: {} },
});
const unchanged = revision => ({ version: 1, revision, changed: false });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const clock = t => t.mock.timers.enable({ apis: ["setTimeout"] });

test("strict facade forwards schema/read/CAS and validates a detached immutable conditional read", async () => {
  const calls = [], envelope = changed("r");
  envelope.internal = "ignore";
  envelope.snapshot.internal = "ignore";
  const client = createPreferencesClient({ call: async (...args) => {
    calls.push(args); return args[0] === "preferences.observe" ? envelope : args[0];
  } });
  assert.equal(await client.schema(), "preferences.schema");
  assert.equal(await client.read(), "preferences.snapshot");
  const update = { revision: "before", changes: { appearance: { theme: "dark" } } };
  await client.update(update);
  assert.equal(calls[2][1], update);
  const observed = await client.observe();
  assert.equal(Object.hasOwn(observed, "internal"), false);
  assert.equal(Object.hasOwn(observed.snapshot, "internal"), false);
  assert.notEqual(observed.snapshot, envelope.snapshot);
  assert(Object.isFrozen(observed.snapshot.values.appearance));
  assert.throws(() => { observed.snapshot.values.appearance.theme = "light"; }, TypeError);
  envelope.snapshot.values.appearance.theme = "light";
  assert.equal(observed.snapshot.values.appearance.theme, "dark");
  assert(Object.isFrozen(client));
});

test("observe rejects malformed request/response pairs without exposing payloads", async () => {
  let calls = 0;
  const client = createPreferencesClient({ call: async () => { calls++; return changed("r"); } });
  for (const request of [null, [], { extra: 1 }, { revision: null }, { revision: "" },
    { revision: "x".repeat(129) }, { revision: "😀".repeat(33) }, { revision: "a\nb" }]) {
    await assert.rejects(client.observe(request), /Invalid preference observation request/);
  }
  assert.equal(calls, 0);
  for (const [response, request] of [
    [null, {}], [[], {}], [{ ...changed("r"), version: 2 }, {}],
    [unchanged("r"), {}], [unchanged("other"), { revision: "r" }],
    [{ ...unchanged("r"), snapshot: null }, { revision: "r" }],
    [changed("r"), { revision: "r" }],
    [{ ...changed("r"), changed: 1 }, {}],
    [{ ...changed("r"), snapshot: { ...changed("r").snapshot, revision: "wrong" } }, {}],
    [{ ...changed("r"), snapshot: { ...changed("r").snapshot, values: [] } }, {}],
    [{ ...changed("r"), revision: "😀".repeat(33) }, {}],
    [{ ...changed("r"), revision: "secret\nmarker" }, {}],
  ]) {
    const bad = createPreferencesClient({ call: async () => response });
    await assert.rejects(bad.observe(request), error => error.message === "Invalid preference observation");
  }
  const good = createPreferencesClient({ call: async () => unchanged("😀".repeat(32)) });
  assert.equal((await good.observe({ revision: "😀".repeat(32) })).changed, false);
});

test("subscriptions deliver initially and only after a changed revision; idle polls remain small", async t => {
  clock(t);
  const owner = new AbortController(), calls = [], received = [];
  const replies = [changed("a"), unchanged("a"), changed("c")];
  const client = createPreferencesClient({ call: async (...args) => { calls.push(args); return replies.shift(); } });
  const sub = client.subscribe(value => received.push(value.revision), { signal: owner.signal });
  await flush();
  assert.deepEqual(received, ["a"]);
  t.mock.timers.tick(2000); await flush();
  assert.deepEqual(received, ["a"]);
  t.mock.timers.tick(2000); await flush();
  assert.deepEqual(received, ["a", "c"]);
  assert.deepEqual(calls.map(call => call.slice(0, 2)), [
    ["preferences.observe", {}], ["preferences.observe", { revision: "a" }],
    ["preferences.observe", { revision: "a" }],
  ]);
  assert(calls.every(call => call[2].timeoutMs === 10000 && call[2].signal instanceof AbortSignal));
  sub.stop(); sub.stop();
  assert.deepEqual(await sub.done, { reason: "stopped" });
  assert.equal(sub.closed, true);
  assert.equal(getEventListeners(owner.signal, "abort").length, 0);
  t.mock.timers.tick(60000); await flush(); assert.equal(calls.length, 3);
});

test("slow reads and async receivers do not overlap, and stop waits for their settlement", async t => {
  clock(t);
  const read = deferred(), receive = deferred(), owner = new AbortController();
  let calls = 0, received = 0, settled = false;
  const client = createPreferencesClient({ call: () => { calls++; return read.promise; } });
  const sub = client.subscribe(() => { received++; return receive.promise; }, { signal: owner.signal, intervalMs: 1000 });
  sub.done.then(() => { settled = true; });
  await flush(); t.mock.timers.tick(60000); await flush(); assert.equal(calls, 1);
  read.resolve(changed("a")); await flush();
  t.mock.timers.tick(60000); await flush(); assert.equal(calls, 1); assert.equal(received, 1);
  sub.stop(); await flush(); assert.equal(settled, false);
  receive.resolve(); assert.deepEqual(await sub.done, { reason: "stopped" });
  t.mock.timers.tick(60000); await flush(); assert.equal(calls, 1);
});

test("abort cancels pending transport and fences a late reply even if a transport ignores abort", async () => {
  const pending = deferred(), owner = new AbortController();
  let transportSignal, received = 0;
  const client = createPreferencesClient({ call: (_method, _request, options) => {
    transportSignal = options.signal; return pending.promise;
  } });
  const sub = client.subscribe(() => { received++; }, { signal: owner.signal });
  await flush(); owner.abort();
  assert.equal(transportSignal.aborted, true); assert.equal(sub.closed, true);
  pending.resolve(changed("late"));
  assert.deepEqual(await sub.done, { reason: "aborted" }); assert.equal(received, 0);
  assert.equal(getEventListeners(owner.signal, "abort").length, 0);
});

test("already aborted owners and immediate stop make no transport calls", async () => {
  const owner = new AbortController(); owner.abort();
  let calls = 0;
  const client = createPreferencesClient({ call: () => { calls++; } });
  const dead = client.subscribe(() => assert.fail(), { signal: owner.signal });
  assert.deepEqual(await dead.done, { reason: "aborted" });
  const liveOwner = new AbortController();
  const stopped = client.subscribe(() => assert.fail(), { signal: liveOwner.signal });
  stopped.stop(); assert.deepEqual(await stopped.done, { reason: "stopped" });
  assert.equal(calls, 0);
});

test("validation and quota apply before work; cancelled unsettled reads stay charged", async () => {
  const owner = new AbortController(), pending = deferred();
  const client = createPreferencesClient({ call: () => pending.promise });
  for (const options of [undefined, {}, { signal: owner.signal, intervalMs: 999 },
    { signal: owner.signal, intervalMs: 60001 }, { signal: owner.signal, intervalMs: 1.5 }])
    assert.throws(() => client.subscribe(() => {}, options));
  assert.throws(() => client.subscribe(null, { signal: owner.signal }));
  const subscriptions = Array.from({ length: 8 }, () => client.subscribe(() => {}, { signal: owner.signal }));
  await flush(); subscriptions.forEach(sub => sub.stop());
  assert.throws(() => client.subscribe(() => {}, { signal: owner.signal }), /Too many/);
  pending.resolve(changed("late")); await Promise.all(subscriptions.map(sub => sub.done));
  const reused = client.subscribe(() => {}, { signal: owner.signal }); reused.stop(); await reused.done;
});

test("permission/runtime, timeout, invalid response and listener errors stop without retries", async t => {
  clock(t);
  for (const failure of [new Error("permission revoked"), new Error("Host call timed out")]) {
    let calls = 0;
    const client = createPreferencesClient({ call: async () => { calls++; throw failure; } });
    const owner = new AbortController();
    const sub = client.subscribe(() => {}, { signal: owner.signal });
    assert.deepEqual(await sub.done, { reason: "failed", error: failure });
    assert.equal(sub.closed, true);
    assert.equal(getEventListeners(owner.signal, "abort").length, 0);
    t.mock.timers.tick(60000); await flush(); assert.equal(calls, 1);
  }
  const bad = createPreferencesClient({ call: async () => unchanged("missing-initial") });
  assert.equal((await bad.subscribe(() => assert.fail(), { signal: new AbortController().signal }).done).reason, "failed");
  const client = createPreferencesClient({ call: async () => changed("r") });
  for (const listener of [() => { throw new Error("sync callback"); }, async () => { throw new Error("async callback"); }]) {
    const result = await client.subscribe(listener, { signal: new AbortController().signal }).done;
    assert.equal(result.reason, "failed"); assert.match(result.error.message, /callback/);
  }
});

test("real stdio host close settles a pending subscription and suppresses later polling", async t => {
  clock(t);
  const input = new PassThrough(), output = new PassThrough();
  const runtime = createPlugin({}, { input, output });
  let calls = 0;
  output.on("data", data => {
    const request = JSON.parse(data.toString());
    if (request.method === "$/cancelRequest") return;
    calls++;
    if (calls === 1) input.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: changed("a") }) + "\n");
  });
  const client = createPreferencesClient(runtime.host);
  const sub = client.subscribe(() => {}, { signal: new AbortController().signal, intervalMs: 1000 });
  await flush(); t.mock.timers.tick(1000); await flush();
  assert.equal(calls, 2); runtime.close();
  const result = await sub.done;
  assert.equal(result.reason, "failed"); assert.match(result.error.message, /transport closed/);
  t.mock.timers.tick(60000); await flush(); assert.equal(calls, 2);
});

test("real stdio abort removes an outstanding read before a late response", async () => {
  const input = new PassThrough(), output = new PassThrough();
  const runtime = createPlugin({}, { input, output });
  let request;
  output.on("data", data => { const value=JSON.parse(data.toString()); if (value.id !== undefined) request=value; });
  const owner = new AbortController(), client = createPreferencesClient(runtime.host);
  const sub = client.subscribe(() => assert.fail(), { signal: owner.signal });
  await flush(); owner.abort(); assert.deepEqual(await sub.done, { reason: "aborted" });
  input.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: changed("late") }) + "\n");
  await flush(); runtime.close();
});

test("real stdio read deadline stops a silent subscription after ten seconds", async t => {
  clock(t);
  const input = new PassThrough(), output = new PassThrough();
  const runtime = createPlugin({}, { input, output });
  const calls = [];
  output.on("data", data => { calls.push(JSON.parse(data.toString())); });
  const client = createPreferencesClient(runtime.host);
  const sub = client.subscribe(() => assert.fail(), { signal: new AbortController().signal });
  await flush(); t.mock.timers.tick(9999); await flush();
  assert.equal(sub.closed, false);
  t.mock.timers.tick(1);
  const result = await sub.done;
  assert.equal(result.reason, "failed"); assert.match(result.error.message, /timed out: preferences.observe/);
  t.mock.timers.tick(60000); await flush();
  assert.equal(calls.filter(item => item.method === "preferences.observe").length, 1);
  assert.deepEqual(calls[1], {jsonrpc: "2.0", method: "$/cancelRequest", params: {id: calls[0].id}});
  assert.equal(calls.length, 2);
  runtime.close();
});
