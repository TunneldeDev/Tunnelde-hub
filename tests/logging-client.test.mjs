import assert from "node:assert/strict";
import { test } from "node:test";
import { getEventListeners } from "node:events";
import { readFile } from "node:fs/promises";
import { createLoggingClient } from "../sdk/logging/client.mjs";

const entry = (message) => ({
  timestamp: "2026-11-11T10:00:00Z",
  level: "info",
  domain: "network",
  pluginId: null,
  message,
  fields: { status: 403 },
  truncated: false,
});
const page = (cursor = "a", entries = [], hasMore = false) => ({
  version: 1,
  source: "diagnostics",
  entries,
  cursor,
  hasMore,
  reset: false,
  gap: false,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

test("read validates strict requests, normalizes selectors and deeply freezes pages", async () => {
  const raw = page("a", [entry("中文😀")]),
    calls = [];
  const client = createLoggingClient({
    call: async (...args) => {
      calls.push(args);
      return raw;
    },
  });
  for (const input of [
    null,
    [],
    { source: null },
    { source: "all" },
    { cursor: null },
    { cursor: "a\n" },
    { limit: 0 },
    { limit: 201 },
    { filter: null },
    { filter: { levels: ["INFO"] } },
    { filter: { plugins: ["a", "a"] } },
    { filter: { text: "😀".repeat(65) } },
    { filter: { text: "\ud800" } },
    { path: "/" },
    {
      get source() {
        assert.fail("accessor executed");
      },
    },
    {
      filter: {
        get text() {
          assert.fail("accessor executed");
        },
      },
    },
  ])
    await assert.rejects(client.read(input), TypeError);
  assert.equal(calls.length, 0);
  const value = await client.read({
    filter: { domains: ["z", "a"] },
    limit: 1,
  });
  assert.deepEqual(calls[0], [
    "logs.read",
    { filter: { domains: ["a", "z"] }, limit: 1 },
    undefined,
  ]);
  assert.deepEqual(value, raw);
  assert(Object.isFrozen(value.entries[0].fields));
  raw.entries[0].fields.status = 200;
  assert.equal(value.entries[0].fields.status, 403);
});
test("invalid or over-budget producer pages are rejected", async () => {
  for (const mutate of [
    (v) => (v.version = 2),
    (v) => (v.path = "private"),
    (v) => (v.cursor = "a\n"),
    (v) => (v.source = "operations"),
    (v) => (v.entries = [entry("x"), entry("y")]),
    (v) => (v.entries[0].pluginId = "bad/id"),
    (v) => (v.entries[0].timestamp = "yesterday"),
    (v) => (v.entries[0].level = "INFO"),
    (v) => (v.entries[0].message = "x".repeat(16385)),
    (v) => (v.entries[0].fields = { unsafe: Number.MAX_SAFE_INTEGER + 1 }),
    (v) => (v.entries[0].fields = { unbounded: "x".repeat(32769) }),
    (v) => (v.entries[0].message = "\ud800"),
    (v) => (v.entries[0].fields = { text: "line\nforged" }),
    (v) => (v.hasMore = "true"),
  ]) {
    const raw = page("a", [entry("one")]);
    mutate(raw);
    await assert.rejects(
      createLoggingClient({ call: async () => raw }).read({ limit: 1 }),
      TypeError,
    );
  }
});
test("array accessors, sparse arrays and unbounded decoded fields fail before executing getters", async () => {
  const getter = [];
  Object.defineProperty(getter, "0", {
    enumerable: true,
    get() {
      assert.fail("array getter executed");
    },
  });
  const client = createLoggingClient({
    call: async () => assert.fail("invalid query reached transport"),
  });
  await assert.rejects(client.read({ filter: { domains: getter } }), TypeError);
  for (const values of [Array(1), Array(1_000_000_000), getter]) {
    const raw = page("a", [entry("x")]);
    raw.entries[0].fields = { values };
    await assert.rejects(
      createLoggingClient({ call: async () => raw }).read(),
      TypeError,
    );
  }
});
test("draining is serial and respects callback backpressure and end-of-stream delay", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const owner = new AbortController(),
    callback = deferred(),
    calls = [],
    received = [];
  const replies = [
    page("a", [entry("first")], true),
    page("b", [entry("second")]),
    page("b"),
  ];
  const client = createLoggingClient({
    call: async (...args) => {
      calls.push(args);
      return replies.shift();
    },
  });
  const sub = client.subscribe(
    async (value) => {
      received.push(value);
      if (received.length === 1) await callback.promise;
    },
    { signal: owner.signal, intervalMs: 1000 },
  );
  await flush();
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(calls.length, 1);
  callback.resolve();
  await flush();
  t.mock.timers.tick(0);
  await flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1].cursor, "a");
  assert.equal(calls[1][2].timeoutMs, 10000);
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(calls.length, 3);
  assert.equal(received.length, 2);
  owner.abort();
  assert.deepEqual(await sub.done, { reason: "aborted" });
  assert.equal(getEventListeners(owner.signal, "abort").length, 0);
});
test("gap/reset pages are delivered even without matching entries", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const owner = new AbortController(),
    values = [];
  let next = page("a");
  const client = createLoggingClient({ call: async () => next });
  const sub = client.subscribe((v) => values.push(v), {
    signal: owner.signal,
    intervalMs: 1000,
  });
  await flush();
  next = { ...page("b"), reset: true, gap: true };
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(values.length, 2);
  sub.stop();
  await sub.done;
});
test("cancellation suppresses late replies and quota remains until actual settlement", async () => {
  const calls = [],
    owner = new AbortController();
  const client = createLoggingClient({
    call: () => {
      const work = deferred();
      calls.push(work);
      return work.promise;
    },
  });
  let received = 0;
  const subs = Array.from({ length: 8 }, () =>
    client.subscribe(() => received++, { signal: owner.signal }),
  );
  await flush();
  owner.abort();
  assert(subs.every((sub) => sub.closed));
  assert.throws(
    () => client.subscribe(() => {}, { signal: new AbortController().signal }),
    /Too many/,
  );
  for (const work of calls) work.resolve(page());
  await Promise.all(subs.map((sub) => sub.done));
  assert.equal(received, 0);
  const aborted = new AbortController();
  aborted.abort();
  const sub = client.subscribe(() => assert.fail(), { signal: aborted.signal });
  assert.deepEqual(await sub.done, { reason: "aborted" });
});
test("stalled cursors and transport failures terminate without an unbounded loop", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const owner = new AbortController();
  const client = createLoggingClient({
    call: async () => page("same", [], true),
  });
  const sub = client.subscribe(
    () => {},
    { signal: owner.signal },
    { cursor: "same" },
  );
  const result = await sub.done;
  assert.equal(result.reason, "failed");
  assert.match(result.error.message, /did not advance/);
  const failing = createLoggingClient({
    call: async () => {
      throw new Error("revoked");
    },
  });
  const failed = failing.subscribe(() => assert.fail(), {
    signal: owner.signal,
  });
  assert.equal((await failed.done).error.message, "revoked");
});
test("subscription snapshots caller selectors and requires owner cancellation", async () => {
  const owner = new AbortController(),
    seen = [],
    work = deferred(),
    input = { filter: { domains: ["a"] } };
  const client = createLoggingClient({
    call: async (_name, params) => {
      seen.push(params);
      return work.promise;
    },
  });
  assert.throws(() => client.subscribe(() => {}, {}), /AbortSignal/);
  assert.throws(
    () => client.subscribe(() => {}, { signal: owner.signal, intervalMs: 0 }),
    RangeError,
  );
  const sub = client.subscribe(
    () => assert.fail(),
    { signal: owner.signal },
    input,
  );
  input.filter.domains[0] = "b";
  await flush();
  assert.deepEqual(seen[0].filter.domains, ["a"]);
  sub.stop();
  work.resolve(page());
  assert.deepEqual(await sub.done, { reason: "stopped" });
});
test(
  "actual Rust persisted log page is accepted by the SDK",
  { skip: !process.env.TUNNELDE_LOG_CONTRACT_OUTPUT },
  async () => {
    const raw = JSON.parse(
      await readFile(process.env.TUNNELDE_LOG_CONTRACT_OUTPUT, "utf8"),
    );
    assert.deepEqual(
      await createLoggingClient({ call: async () => raw }).read(),
      raw,
    );
    assert.equal(raw.entries[0].message, "producer→SDK");
  },
);
