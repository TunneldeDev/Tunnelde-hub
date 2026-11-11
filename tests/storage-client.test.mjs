import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { getEventListeners } from "node:events";
import { test } from "node:test";
import { createStorageClient } from "../sdk/storage/client.mjs";
import { createPlugin } from "../sdk/tunnelde-plugin.mjs";

const changed = revision => ({ version: 1, revision, changed: true, snapshot: { version: 1, revision, values: { draft: { text: "Hello", list: [null, 0.25, true] } } } });
const unchanged = revision => ({ version: 1, revision, changed: false });
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test("storage snapshots deeply detach and freeze valid JSON, including nested prototype keys", async () => {
  const raw = changed("r");
  raw.private = "transport-secret"; raw.snapshot.locations = { host: "secret" };
  raw.snapshot.values.draft = JSON.parse('{"__proto__":{"safe":true},"unicode":"你好😀\\n"}');
  const expected = structuredClone(raw); delete expected.private; delete expected.snapshot.locations;
  const calls = [];
  const client = createStorageClient({ call: async (...args) => { calls.push(args); return raw; } });
  const value = await client.observe();
  assert.deepEqual(value, expected);
  assert(Object.isFrozen(client) && Object.isFrozen(value.snapshot.values.draft.__proto__));
  assert.equal(Object.getPrototypeOf(value.snapshot.values.draft), Object.prototype);
  assert.throws(() => { value.snapshot.values.draft.__proto__.safe = false; }, TypeError);
  raw.snapshot.values.draft.__proto__.safe = false;
  assert.equal(value.snapshot.values.draft.__proto__.safe, true);
  assert.deepEqual(calls, [["storage.observe", {}, undefined]]);
});

test("invalid requests never reach transport; valid selectors copy before await", async () => {
  let calls = 0;
  const pending = deferred(), request = { revision: "old" };
  const client = createStorageClient({ call: async (_method, params) => { calls++; assert.deepEqual(params, { revision: "old" }); return pending.promise; } });
  for (const bad of [null, [], new Date(), { id: "other" }, { path: "/" }, { revision: null }, { revision: undefined },
    { revision: "" }, { revision: "x".repeat(129) }, { revision: "😀".repeat(33) }, { revision: "\u0085" }, { revision: "\ud800" },
    { get revision() { assert.fail("do not invoke accessors"); } }, { [Symbol()]: "extra" }])
    await assert.rejects(client.observe(bad), /Invalid plugin storage observation request/);
  assert.equal(calls, 0);
  const result = client.observe(request); request.revision = "new";
  pending.resolve(unchanged("old")); assert.deepEqual(await result, unchanged("old"));
});

test("invalid JSON, unsafe numbers, depth, keys and excessive decoded work are redacted", async () => {
  const cycle = {}; cycle.x = cycle;
  let deep = null; for (let i = 0; i < 64; i++) deep = [deep];
  const cases = [null, [], unchanged("r"), { ...changed("r"), version: 2 },
    { ...changed("r"), changed: 1 }, { ...changed("r"), revision: "private\nsecret" },
    { ...changed("r"), snapshot: { ...changed("r").snapshot, revision: "other" } }];
  for (const invalid of [undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 5n, () => {},
    "\ud800", { "\ud800": true }, new Date(), cycle, deep, Array(5), { get x() { assert.fail(); } }, "x".repeat(512 * 1024)]) {
    const bad = changed("r"); bad.snapshot.values = { x: invalid }; cases.push(bad);
  }
  for (const key of ["", "bad/key", "key\n", "__proto__", "constructor", "prototype", "x".repeat(129)]) {
    const bad = changed("r"); bad.snapshot.values = Object.fromEntries([[key, null]]); cases.push(bad);
  }
  for (const raw of cases)
    await assert.rejects(createStorageClient({ call: async () => raw }).observe(), error => error.message === "Invalid plugin storage observation");
  for (const raw of [{ ...unchanged("r"), snapshot: null }, unchanged("other"), changed("r")])
    await assert.rejects(createStorageClient({ call: async () => raw }).observe({ revision: "r" }), /Invalid plugin storage observation$/);
  let boundary = null; for (let i = 0; i < 63; i++) boundary = [boundary];
  const raw = changed("r"); raw.snapshot.values = { x: boundary, n: Number.MAX_SAFE_INTEGER };
  assert.equal((await createStorageClient({ call: async () => raw }).observe()).changed, true);
});

test("latest-state subscriptions emit only changes and serialize reads and callbacks", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const owner = new AbortController(), pendingRead = deferred(), pendingReceiver = deferred();
  const replies = [changed("a"), unchanged("a"), pendingRead.promise], calls = [], received = [];
  const client = createStorageClient({ call: async (...args) => { calls.push(args); return replies.shift(); } });
  const sub = client.subscribe(async value => { received.push(value.revision); if (value.revision === "b") await pendingReceiver.promise; }, { signal: owner.signal, intervalMs: 1000 });
  await flush(); t.mock.timers.tick(1000); await flush(); t.mock.timers.tick(1000); await flush();
  assert.deepEqual(received, ["a"]); assert.equal(calls.length, 3);
  t.mock.timers.tick(60000); await flush(); assert.equal(calls.length, 3);
  pendingRead.resolve(changed("b")); await flush();
  t.mock.timers.tick(60000); await flush(); assert.equal(calls.length, 3);
  sub.stop(); let settled = false; sub.done.then(() => { settled = true; }); await flush(); assert.equal(settled, false);
  pendingReceiver.resolve(); assert.deepEqual(await sub.done, { reason: "stopped" });
  assert.deepEqual(received, ["a", "b"]);
  assert(calls.every(call => call[2].timeoutMs === 10000));
});

test("aborted unsettled reads keep their quota and late responses are not delivered", async () => {
  const owner = new AbortController(), pending = deferred();
  const signals = [];
  const client = createStorageClient({ call: (_method, _request, options) => { signals.push(options.signal); return pending.promise; } });
  const subscriptions = Array.from({ length: 8 }, () => client.subscribe(() => assert.fail(), { signal: owner.signal }));
  await flush(); owner.abort();
  assert(signals.every(signal => signal.aborted)); assert(subscriptions.every(sub => sub.closed));
  const another = new AbortController();
  assert.throws(() => client.subscribe(() => {}, { signal: another.signal }), /Too many/);
  pending.resolve(changed("late"));
  assert((await Promise.all(subscriptions.map(sub => sub.done))).every(value => value.reason === "aborted"));
  assert.equal(getEventListeners(owner.signal, "abort").length, 0);
  const reused = client.subscribe(() => {}, { signal: another.signal }); reused.stop(); await reused.done;
});

test("owners, intervals, callback and host failures are checked without retry", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const owner = new AbortController(); let calls = 0;
  const client = createStorageClient({ call: async () => { calls++; throw new Error("permission revoked"); } });
  for (const options of [undefined, {}, { signal: owner.signal, intervalMs: 999 }, { signal: owner.signal, intervalMs: 60001 }])
    assert.throws(() => client.subscribe(() => {}, options));
  owner.abort(); assert.deepEqual(await client.subscribe(() => assert.fail(), { signal: owner.signal }).done, { reason: "aborted" });
  const failed = await client.subscribe(() => {}, { signal: new AbortController().signal }).done;
  assert.equal(failed.reason, "failed"); assert.match(failed.error.message, /permission revoked/);
  t.mock.timers.tick(60000); await flush(); assert.equal(calls, 1);
  const callbackFailure = await createStorageClient({ call: async () => changed("r") }).subscribe(() => { throw new Error("receiver"); }, { signal: new AbortController().signal }).done;
  assert.equal(callbackFailure.reason, "failed");
});

test("real stdio cancellation and deadlines stop storage subscriptions", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const action of ["abort", "timeout", "close"]) {
    const input = new PassThrough(), output = new PassThrough(), requests = [];
    output.on("data", bytes => requests.push(JSON.parse(bytes.toString())));
    const runtime = createPlugin({}, { input, output }), owner = new AbortController();
    const sub = createStorageClient(runtime.host).subscribe(() => assert.fail(), { signal: owner.signal });
    await flush(); assert.equal(requests.length, 1); assert.equal(requests[0].method, "storage.observe");
    if (action === "abort") owner.abort();
    else if (action === "close") runtime.close();
    else t.mock.timers.tick(10000);
    const result = await sub.done;
    assert.equal(result.reason, action === "abort" ? "aborted" : "failed");
    input.write(JSON.stringify({ jsonrpc: "2.0", id: requests[0].id, result: changed("late") }) + "\n");
    await flush(); t.mock.timers.tick(60000); await flush(); assert.equal(requests.length, 1);
    runtime.close();
  }
});
