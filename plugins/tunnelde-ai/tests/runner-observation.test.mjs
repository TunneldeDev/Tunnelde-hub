import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { createRunnerObserver } from "../lib/runner-observation.mjs";

const target = { sessionId: "ssh", runnerId: "runner", afterSeq: 7 };

function fixture(call) {
  const calls = [], waits = [];
  let time = 0;
  const observe = createRunnerObserver({ call: async (...args) => {
    calls.push(structuredClone(args.slice(0, 2)));
    return call(...args);
  } }, {
    now: () => time,
    wait: async (ms, signal) => {
      signal?.throwIfAborted();
      waits.push(ms);
      time += ms;
    },
  });
  return { observe, calls, waits, advance: ms => { time += ms; } };
}

for (const method of ["runners.status", "runners.poll"]) {
  test(`${method} retries only busy reads with unchanged identity and cursor`, async () => {
    const signal = new AbortController().signal;
    const result = method === "runners.status" ? { status: "notFound" } : { events: [], nextSeq: 7, state: { status: "running" } };
    let attempts = 0;
    const f = fixture((actual, params, options) => {
      assert.equal(actual, method);
      assert.deepEqual(params, target);
      assert.equal(options.signal, signal);
      assert.ok(options.timeoutMs <= 30000 && options.timeoutMs > 0);
      // A faulty transport cannot change the target of the next attempt.
      params.runnerId = "other";
      if (++attempts < 3) throw new Error("plugin.runners.busy");
      return result;
    });
    assert.equal(await f.observe(method, target, signal), result);
    assert.deepEqual(f.waits, [100, 200]);
    assert.equal(f.calls.length, 3);
    assert.ok(f.calls.every(([, params]) => params.runnerId === "runner" && params.afterSeq === 7));
    assert.equal(target.runnerId, "runner");
  });
}

test("runner mutations cannot enter the retry helper", async () => {
  const f = fixture(() => assert.fail("No mutation may be submitted"));
  for (const method of ["runners.start", "runners.startInitialized", "runners.send", "runners.stop", "runners.deploy"])
    await assert.rejects(f.observe(method, target), /Only runner observations/);
  assert.deepEqual(f.calls, []);
});

test("persistent contention exhausts a bounded attempt budget and preserves the error", async () => {
  const busy = new Error("plugin.runners.busy");
  const f = fixture(() => { throw busy; });
  await assert.rejects(f.observe("runners.poll", target), error => error === busy);
  assert.equal(f.calls.length, 8);
  assert.deepEqual(f.waits, [100, 200, 400, 800, 1600, 1600, 1600]);
});

test("slow busy responses consume the shared deadline instead of renewing it", async () => {
  const busy = new Error("plugin.runners.busy"), timeouts = [];
  const f = fixture((_, __, { timeoutMs }) => {
    timeouts.push(timeoutMs);
    f.advance(15000);
    throw busy;
  });
  await assert.rejects(f.observe("runners.status", target), error => error === busy);
  assert.deepEqual(timeouts, [30000, 14900]);
  assert.deepEqual(f.waits, [100]);
  assert.equal(f.calls.length, 2);
});

test("a delayed backoff never issues another request after its deadline", async () => {
  const busy = new Error("plugin.runners.busy");
  let time = 0, calls = 0;
  const observe = createRunnerObserver({ async call() { calls++; throw busy; } }, {
    now: () => time,
    wait: async () => { time += 30001; },
  });
  await assert.rejects(observe("runners.poll", target), error => error === busy);
  assert.equal(calls, 1);
});

for (const message of ["pluginSecurity.revoked", "plugin.permissionDenied", "connection lost", "Host call timed out: runners.poll", "prefix plugin.runners.busy", "plugin.runners.stopPending"]) {
  test(`runner observation does not retry ${message}`, async () => {
    const failure = Object.assign(new Error(message), { code: -32000 });
    const f = fixture(() => { throw failure; });
    await assert.rejects(f.observe("runners.poll", target), error => error === failure);
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.waits, []);
  });
}

test("an already cancelled observation issues no request", async () => {
  const controller = new AbortController(), reason = new Error("Stopped");
  controller.abort(reason);
  const f = fixture(() => assert.fail("Cancelled request submitted"));
  await assert.rejects(f.observe("runners.poll", target, controller.signal), error => error === reason);
  assert.deepEqual(f.calls, []);
});

test("cancellation rejects a late successful observation", async () => {
  const controller = new AbortController(), reason = new Error("Stopped");
  const f = fixture(() => {
    controller.abort(reason);
    return { state: { status: "running" }, events: [] };
  });
  await assert.rejects(f.observe("runners.poll", target, controller.signal), error => error === reason);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.waits, []);
});

test("cancelling real backoff clears its timer and abort listener", async () => {
  const controller = new AbortController(), reason = new Error("Stopped");
  let calls = 0;
  const observe = createRunnerObserver({ async call() {
    calls++;
    setImmediate(() => controller.abort(reason));
    throw new Error("plugin.runners.busy");
  } });
  await assert.rejects(observe("runners.poll", target, controller.signal), error => error === reason);
  assert.equal(calls, 1);
  assert.deepEqual(getEventListeners(controller.signal, "abort"), []);
});
