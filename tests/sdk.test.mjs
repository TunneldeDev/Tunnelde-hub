import assert from "node:assert/strict";
import { test } from "node:test";
import { PassThrough } from "node:stream";
import { createInterface } from "node:readline";
import { createPlugin } from "../sdk/tunnelde-plugin.mjs";

function transport(handlers = {}, options = {}) {
  const input = new PassThrough(),
    output = new PassThrough();
  const frames = [],
    waiters = [];
  const lines = createInterface({ input: output });
  lines.on("error", () => {});
  lines.on("line", (line) => {
    const value = JSON.parse(line);
    const waiter = waiters.shift();
    waiter ? waiter(value) : frames.push(value);
  });
  const plugin = createPlugin(handlers, { input, output, ...options });
  return {
    plugin,
    output,
    send: (value) => input.write(JSON.stringify(value) + "\n"),
    next: () =>
      frames.length
        ? Promise.resolve(frames.shift())
        : new Promise((resolve) => waiters.push(resolve)),
    close: () => {
      plugin.close();
      lines.close();
      input.destroy();
      output.destroy();
    },
  };
}
test("SDK handles a nested host API call without blocking command replies", async () => {
  const t = transport({
    run: async (_, __, host) => ({
      text: (await host.call("hosts.snapshot")).hosts[0].name,
    }),
  });
  try {
    t.send({
      jsonrpc: "2.0",
      id: 1,
      method: "command.run",
      params: { command: "report" },
    });
    const request = await t.next();
    assert.equal(request.method, "hosts.snapshot");
    t.send({
      jsonrpc: "2.0",
      id: request.id,
      result: { hosts: [{ name: "Example" }] },
    });
    assert.deepEqual(await t.next(), {
      jsonrpc: "2.0",
      id: 1,
      result: { text: "Example" },
    });
  } finally {
    t.close();
  }
});
test("SDK propagates permission denial with RPC code", async () => {
  const t = transport();
  try {
    const pending = t.plugin.host.call("clipboard.readText");
    const request = await t.next();
    t.send({
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32003, message: "Permission denied" },
    });
    await assert.rejects(pending, {
      message: "Permission denied",
      code: -32003,
    });
  } finally {
    t.close();
  }
});
test("SDK preserves JSON null returned by host mutation methods", async () => {
  const t = transport();
  try {
    const pending = t.plugin.host.log("hello");
    const request = await t.next();
    assert.equal(request.method, "log");
    t.send({ jsonrpc: "2.0", id: request.id, result: null });
    assert.equal(await pending, null);
  } finally {
    t.close();
  }
});
test("SDK abort, timeout and disposal settle outstanding requests", async () => {
  const t = transport({}, { timeout: 20 });
  try {
    await assert.rejects(t.plugin.host.call("settings.get"), /timed out/);
    const controller = new AbortController();
    const pending = t.plugin.host.call(
      "api.describe",
      {},
      { signal: controller.signal },
    );
    controller.abort(new Error("Cancelled"));
    await assert.rejects(pending, /Cancelled/);
    const closing = t.plugin.host.call("api.describe");
    t.plugin.close();
    await assert.rejects(closing, /closed/);
  } finally {
    t.close();
  }
});

test("SDK validates API bounds without sending frames and recovers slots", async () => {
  const t = transport();
  try {
    await assert.rejects(
      t.plugin.host.call("storage.set", { value: "x".repeat(256 * 1024) }),
      /256 KiB/,
    );
    await assert.rejects(t.plugin.host.call("storage.set", []), /object/);
    await assert.rejects(
      t.plugin.host.call("api.describe", {}, { timeoutMs: 120001 }),
      /120000/,
    );
    const controllers = Array.from({ length: 32 }, () => new AbortController());
    const pending = controllers.map((controller) =>
      t.plugin.host
        .call("api.describe", {}, { signal: controller.signal })
        .catch((error) => error),
    );
    await assert.rejects(t.plugin.host.call("api.describe"), /Too many/);
    controllers.forEach((controller) => controller.abort());
    await Promise.all(pending);
    const recovered = t.plugin.host.call("api.describe", {}, { timeoutMs: 1 });
    await assert.rejects(recovered, /timed out/);
  } finally {
    t.close();
  }
});

test("SDK supports per-call deadlines and output failure cancels pending RPC", async () => {
  const t = transport({}, { timeout: 1 });
  try {
    const pending = t.plugin.host.call(
      "sessions.exec",
      { sessionId: "fixture", command: "echo ok" },
      { timeoutMs: 1000 },
    );
    const frame = await t.next();
    await new Promise((resolve) => setTimeout(resolve, 15));
    t.send({ jsonrpc: "2.0", id: frame.id, result: { stdout: "ok" } });
    assert.deepEqual(await pending, { stdout: "ok" });
    const stopped = t.plugin.host.call("api.describe", {}, { timeoutMs: 1000 });
    t.output.emit("error", new Error("Pipe closed"));
    await assert.rejects(stopped, /closed/);
  } finally {
    t.close();
  }
});

test("status bar helpers use versioned host calls without implicit execution", async () => {
  const t = transport();
  try {
    const item = { id: "connection", text: "Ready", alignment: "right", command: "open" };
    const pending = t.plugin.host.statusBar.set(item);
    const request = await t.next();
    assert.equal(request.method, "statusBar.set");
    assert.deepEqual(request.params, item);
    t.send({ jsonrpc: "2.0", id: request.id, result: null });
    assert.equal(await pending, null);
    const removing = t.plugin.host.statusBar.remove("connection");
    const removal = await t.next();
    assert.equal(removal.method, "statusBar.remove");
    assert.deepEqual(removal.params, { id: "connection" });
    t.send({ jsonrpc: "2.0", id: removal.id, result: true });
    assert.equal(await removing, true);
  } finally { t.close(); }
});

test("tab bar helpers register declarative controls and remove them through the host", async () => {
  const t = transport();
  try {
    const item = { id: "target", title: "Run", kind: "button", command: "run", when: { tabKind: "editor" }, placement: "leading", group: "execution", tooltip: "Run current file", showLabel: true, checked: false };
    const pending = t.plugin.host.tabBar.set(item);
    const frame = await t.next();
    assert.equal(frame.method, "tabBar.set");
    assert.deepEqual(frame.params, item);
    t.send({ jsonrpc: "2.0", id: frame.id, result: null });
    assert.equal(await pending, null);
    const pendingRemoval = t.plugin.host.tabBar.remove("target");
    const removal = await t.next();
    assert.equal(removal.method, "tabBar.remove");
    assert.deepEqual(removal.params, { id: "target" });
    t.send({ jsonrpc: "2.0", id: removal.id, result: true });
    assert.equal(await pendingRemoval, true);
  } finally { t.close(); }
});
