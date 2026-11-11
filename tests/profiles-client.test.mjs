import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { getEventListeners } from "node:events";
import { test } from "node:test";
import { createProfilesClient } from "../sdk/profiles/client.mjs";
import { createPlugin } from "../sdk/tunnelde-plugin.mjs";

const item = { id: "work", name: "Work", updatedAt: 1 };
const changed = revision => ({ version: 1, revision, changed: true, snapshot: { version: 1, revision, items: [{ ...item }] } });
const unchanged = revision => ({ version: 1, revision, changed: false });
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test("profile observations project detached frozen metadata without leaking settings or transport fields", async () => {
  const raw = changed("r");
  raw.private = "transport-secret"; raw.snapshot.settings = { password: "secret" };
  raw.snapshot.items[0].settings = { uiProviders: "host-controlled" };
  const calls = [];
  const client = createProfilesClient({ call: async (...args) => { calls.push(args); return raw; } });
  const value = await client.observe();
  assert.deepEqual(value, changed("r"));
  assert(Object.isFrozen(client) && Object.isFrozen(value.snapshot.items[0]));
  assert.throws(() => value.snapshot.items.push(item), TypeError);
  raw.snapshot.items[0].name = "mutated";
  assert.equal(value.snapshot.items[0].name, "Work");
  assert.deepEqual(calls, [["profiles.observe", {}, undefined]]);
});

test("requests are validated and copied before awaiting transport", async () => {
  let calls = 0;
  const pending = deferred(), request = { revision: "old" };
  const client = createProfilesClient({ call: async (_method, params) => { calls++; assert.deepEqual(params, { revision: "old" }); return pending.promise; } });
  for (const bad of [null, [], { unknown: true }, { revision: null }, { revision: undefined },
    { revision: "" }, { revision: "x".repeat(129) }, { revision: "😀".repeat(33) }, { revision: "\u0085" }, { revision: "\ud800" }])
    await assert.rejects(client.observe(bad), /Invalid profile observation request/);
  assert.equal(calls, 0);
  const result = client.observe(request); request.revision = "new";
  pending.resolve(unchanged("old")); assert.deepEqual(await result, unchanged("old"));
});

test("malformed envelopes and metadata stop at the boundary with a redacted error", async () => {
  const cases = [null, [], unchanged("r"), { ...changed("r"), version: 2 },
    { ...changed("r"), changed: 1 }, { ...changed("r"), revision: "private\nsecret" },
    { ...changed("r"), snapshot: { ...changed("r").snapshot, revision: "other" } }];
  for (const mutation of [{ id: "" }, { id: "😀".repeat(33) }, { name: " Work" }, { name: "Work " },
    { name: "\n" }, { name: "\ud800" }, { name: "x".repeat(65) }, { updatedAt: -1 },
    { updatedAt: 0.1 }, { updatedAt: Number.MAX_SAFE_INTEGER + 1 }]) {
    const bad = changed("r"); Object.assign(bad.snapshot.items[0], mutation); cases.push(bad);
  }
  for (const items of [Array(33).fill(item), [item, item], [item, { ...item, id: "another", name: "WORK" }]]) {
    const bad = changed("r"); bad.snapshot.items = items; cases.push(bad);
  }
  for (const raw of cases)
    await assert.rejects(createProfilesClient({ call: async () => raw }).observe(), error => error.message === "Invalid profile observation");
  for (const raw of [{ ...unchanged("r"), snapshot: null }, unchanged("other"), changed("r")])
    await assert.rejects(createProfilesClient({ call: async () => raw }).observe({ revision: "r" }), /Invalid profile observation$/);
});

test("maximum native-compatible Unicode metadata remains bounded", async () => {
  const raw = changed("😀".repeat(32));
  raw.snapshot.items = Array.from({ length: 32 }, (_, i) => ({ id: `${i}${"😀".repeat(30)}`, name: `${i}${"中".repeat(60)}`, updatedAt: Number.MAX_SAFE_INTEGER }));
  assert.equal((await createProfilesClient({ call: async () => raw }).observe()).snapshot.items.length, 32);
});

test("latest-state subscriptions emit only changes and serialize reads and callbacks", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const owner = new AbortController(), pendingRead = deferred(), pendingReceiver = deferred();
  const replies = [changed("a"), unchanged("a"), pendingRead.promise], calls = [], received = [];
  const client = createProfilesClient({ call: async (...args) => { calls.push(args); return replies.shift(); } });
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
  const client = createProfilesClient({ call: (_method, _request, options) => { signals.push(options.signal); return pending.promise; } });
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
  const client = createProfilesClient({ call: async () => { calls++; throw new Error("permission revoked"); } });
  for (const options of [undefined, {}, { signal: owner.signal, intervalMs: 999 }, { signal: owner.signal, intervalMs: 60001 }])
    assert.throws(() => client.subscribe(() => {}, options));
  owner.abort(); assert.deepEqual(await client.subscribe(() => assert.fail(), { signal: owner.signal }).done, { reason: "aborted" });
  const failed = await client.subscribe(() => {}, { signal: new AbortController().signal }).done;
  assert.equal(failed.reason, "failed"); assert.match(failed.error.message, /permission revoked/);
  t.mock.timers.tick(60000); await flush(); assert.equal(calls, 1);
  const callbackFailure = await createProfilesClient({ call: async () => changed("r") }).subscribe(() => { throw new Error("receiver"); }, { signal: new AbortController().signal }).done;
  assert.equal(callbackFailure.reason, "failed");
});

test("real stdio cancellation and deadlines stop profile subscriptions", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const action of ["abort", "timeout", "close"]) {
    const input = new PassThrough(), output = new PassThrough(), requests = [];
    output.on("data", bytes => requests.push(JSON.parse(bytes.toString())));
    const runtime = createPlugin({}, { input, output }), owner = new AbortController();
    const sub = createProfilesClient(runtime.host).subscribe(() => assert.fail(), { signal: owner.signal });
    await flush(); assert.equal(requests.length, 1); assert.equal(requests[0].method, "profiles.observe");
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
