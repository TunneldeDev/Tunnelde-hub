import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createMcpServer, createToken, tokenHash } from "../server.mjs";
import { TOOLS } from "../catalog.mjs";
import { createController } from "../index.mjs";
import { reviewAction } from "../reviewer.mjs";

const scope = {
  sessionIds: ["ssh-a"],
  hostIds: ["host-a"],
  localRoots: [process.cwd()],
  remoteRoots: [{ sessionId: "ssh-a", path: "/home/user" }],
};
async function fixture(t, options = {}) {
  const token = createToken(),
    otherToken = createToken();
  const clients = [
    {
      id: "a",
      name: "Client A",
      mode: "ask",
      scope: structuredClone(scope),
      tokenHash: tokenHash(token),
    },
    {
      id: "b",
      name: "Client B",
      mode: "full",
      scope: structuredClone(scope),
      tokenHash: tokenHash(otherToken),
    },
  ];
  const calls = [],
    cancelled = [],
    revoked = [];
  const server = createMcpServer({
    clients: () => clients,
    invoke: async (params) => {
      calls.push(params);
      return { ok: true };
    },
    cancel: async (id) => {
      cancelled.push(id);
    },
    revoke: async (id) => {
      revoked.push(id);
    },
    ...options,
  });
  const url = await server.start();
  t.after(() => server.stop());
  async function post(message, session, headers = {}, bearer = token) {
    return fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        authorization: `Bearer ${bearer}`,
        ...(session ? { "mcp-session-id": session, "mcp-protocol-version": "2025-11-25" } : {}),
        ...headers,
      },
      body: typeof message === "string" ? message : JSON.stringify(message),
    });
  }
  async function initialize(bearer = token) {
    const response = await post(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "Test", version: "1" },
        },
      },
      null,
      {},
      bearer,
    );
    assert.equal(response.status, 200);
    const session = response.headers.get("mcp-session-id");
    assert.match(session, /^[a-f0-9-]{36}$/);
    const initialized = await post(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      session,
      {},
      bearer,
    );
    assert.equal(initialized.status, 202);
    assert.equal(await initialized.text(), "");
    return session;
  }
  const call = async (session, name, args = {}, id = 10, bearer = token, extra = {}) =>
    (
      await post(
        { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args, ...extra } },
        session,
        {},
        bearer,
      )
    ).json();
  return {
    server,
    clients,
    token,
    otherToken,
    url,
    post,
    initialize,
    call,
    calls,
    cancelled,
    revoked,
  };
}

test("real HTTP lifecycle negotiates sessions, notifications, tools and version headers", async (t) => {
  const f = await fixture(t);
  const session = await f.initialize();
  const response = await f.post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, session);
  const { result } = await response.json();
  assert.equal(result.tools.length, TOOLS.length);
  assert.ok(
    result.tools.every(
      (tool) => tool.inputSchema.type === "object" && !Object.hasOwn(tool, "method"),
    ),
  );
  assert.equal(
    (await fetch(f.url, { headers: { authorization: `Bearer ${f.token}` } })).status,
    405,
  );
  assert.equal(
    (
      await f.post({ jsonrpc: "2.0", id: 3, method: "ping" }, session, {
        "mcp-protocol-version": "invalid",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(f.url, {
        method: "DELETE",
        headers: { authorization: `Bearer ${f.token}`, "mcp-session-id": session },
      })
    ).status,
    200,
  );
  assert.equal((await f.post({ jsonrpc: "2.0", id: 4, method: "ping" }, session)).status, 404);
});
test("authentication, Origin and Host checks apply before any tool executes", async (t) => {
  const f = await fixture(t);
  assert.equal((await fetch(f.url, { headers: { origin: "https://evil.example" } })).status, 403);
  const hostStatus = await new Promise((resolve, reject) => {
    const req = request(
      f.url,
      { headers: { host: "evil.example", authorization: `Bearer ${f.token}` } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(hostStatus, 403);
  assert.equal((await fetch(f.url)).status, 401);
  assert.equal(
    (await fetch(f.url, { headers: { authorization: `Bearer ${createToken()}` } })).status,
    401,
  );
  assert.equal(f.calls.length, 0);
});
test("client tokens cannot use another client's initialized session", async (t) => {
  const f = await fixture(t),
    session = await f.initialize();
  assert.equal(
    (await f.post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, session, {}, f.otherToken))
      .status,
    404,
  );
});
test("JSON, batch, content type, Accept and argument validation reject malformed input", async (t) => {
  const f = await fixture(t),
    session = await f.initialize();
  assert.equal((await f.post("{", session)).status, 400);
  assert.equal((await f.post([], session)).status, 400);
  assert.equal(
    (
      await f.post({ jsonrpc: "2.0", id: 1, method: "ping" }, session, {
        "content-type": "text/plain",
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await f.post({ jsonrpc: "2.0", id: 1, method: "ping" }, session, {
        accept: "application/json",
      })
    ).status,
    406,
  );
  assert.equal(
    (await f.call(session, "tunnelde_sessions_exec", { sessionId: "ssh-a" })).error.code,
    -32602,
  );
  assert.equal(
    (
      await f.call(session, "tunnelde_files_local_list", {
        path: "/tmp",
        review: { approved: true },
      })
    ).error.code,
    -32602,
  );
  assert.equal((await f.call(session, "tunnelde_secrets_get", { key: "x" })).error.code, -32602);
  assert.equal(f.calls.length, 0);
});
test("mode, scope, reviewer and client identity come exclusively from trusted plugin configuration", async (t) => {
  const f = await fixture(t),
    session = await f.initialize();
  const result = await f.call(
    session,
    "tunnelde_sessions_exec",
    { sessionId: "ssh-a", command: "pwd" },
    7,
    f.token,
    { mode: "full", scope: { sessionIds: ["other"] }, review: { approved: true } },
  );
  assert.equal(result.result.structuredContent.result.ok, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].mode, "ask");
  assert.deepEqual(f.calls[0].scope, scope);
  assert.match(f.calls[0].clientId, /^[a-f0-9-]{36}$/);
  assert.notEqual(f.calls[0].clientId, "a");
  assert.match(f.calls[0].requestId, /^[a-f0-9-]{36}$/);
  assert.equal(f.calls[0].review, undefined);
});
test("read-only mode omits mutations and refuses shell calls even when explicitly requested", async (t) => {
  const f = await fixture(t);
  f.clients[0].mode = "readOnly";
  const session = await f.initialize();
  const list = await (
    await f.post({ jsonrpc: "2.0", id: 9, method: "tools/list" }, session)
  ).json();
  assert.ok(list.result.tools.every((tool) => tool.annotations.readOnlyHint));
  assert.equal(
    (await f.call(session, "tunnelde_sessions_exec", { sessionId: "ssh-a", command: "pwd" })).error
      .code,
    -32602,
  );
  assert.equal(f.calls.length, 0);
});
test("approve mode uses only independent reviewer verdict and keeps false for host's human fallback", async (t) => {
  const reviews = [];
  const f = await fixture(t, {
    reviewer: async (action) => {
      reviews.push(action);
      return { approved: false, reason: "Ambiguous" };
    },
  });
  f.clients[0].mode = "approve";
  const session = await f.initialize();
  await f.call(session, "tunnelde_sessions_exec", { sessionId: "ssh-a", command: "pwd" });
  assert.equal(reviews.length, 1);
  assert.deepEqual(f.calls[0].review, { approved: false, reason: "Ambiguous" });
});
test("explicit cancellation targets only this session's request and cancels its host request", async (t) => {
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const f = await fixture(t, {
    invoke: async (_, signal) => {
      entered();
      return new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("Cancelled")), { once: true }),
      );
    },
  });
  const session = await f.initialize();
  const pending = f.call(
    session,
    "tunnelde_sessions_exec",
    { sessionId: "ssh-a", command: "sleep 60" },
    "long",
  );
  await ready;
  assert.equal(
    (
      await f.post(
        { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: "long" } },
        session,
      )
    ).status,
    202,
  );
  assert.equal((await pending).result.isError, true);
  assert.equal(f.cancelled.length, 1);
});
test("revocation ends sessions, blocks the token immediately and cancels in-flight calls", async (t) => {
  const f = await fixture(t),
    session = await f.initialize();
  await f.server.revokeClient("a");
  assert.equal((await f.post({ jsonrpc: "2.0", id: 2, method: "ping" }, session)).status, 401);
  assert.equal(f.server.sessionCount, 0);
  assert.equal(f.revoked.length, 1);
  assert.match(f.revoked[0], /^[a-f0-9-]{36}$/);
});
test("scope updates rotate the host runtime owner while preserving the client's token identity", async (t) => {
  const f = await fixture(t);
  const session = await f.initialize();
  await f.call(session, "tunnelde_hosts_snapshot");
  const oldOwner = f.calls[0].clientId;
  await f.server.revokeClient("a");
  assert.ok(f.revoked.includes(oldOwner));
  f.clients[0] = { ...f.clients[0], scope: { ...scope, sessionIds: ["ssh-new"] } };
  f.server.resumeClient("a");
  const newSession = await f.initialize();
  await f.call(newSession, "tunnelde_hosts_snapshot");
  assert.notEqual(f.calls.at(-1).clientId, oldOwner);
  assert.deepEqual(f.calls.at(-1).scope.sessionIds, ["ssh-new"]);
  assert.equal((await f.post({ jsonrpc: "2.0", id: 9, method: "ping" }, session)).status, 404);
});
test("an old review cannot resume execution after the same client receives a new runtime owner", async (t) => {
  let release, entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const f = await fixture(t, {
    reviewer: async () => {
      entered();
      await wait;
      return { approved: true, reason: "Approved" };
    },
  });
  f.clients[0].mode = "approve";
  const session = await f.initialize();
  const original = f.call(session, "tunnelde_sessions_exec", {
    sessionId: "ssh-a",
    command: "pwd",
  });
  await ready;
  await f.server.revokeClient("a");
  f.server.resumeClient("a");
  release();
  assert.equal((await original).result.isError, true);
  assert.equal(f.calls.length, 0);
});
test("transfers and tasks are isolated between clients and cancelled on revoke", async (t) => {
  const calls = [];
  const f = await fixture(t, {
    invoke: async (params) => {
      calls.push(params);
      if (params.method === "files.upload") return "transfer-a";
      if (params.method === "tasks.start") return { taskId: "task-a", status: "running" };
      if (params.method === "tasks.list") return [{ taskId: "task-a" }, { taskId: "other" }];
      return { status: "running" };
    },
  });
  const a = await f.initialize(),
    b = await f.initialize(f.otherToken);
  await f.call(a, "tunnelde_files_upload", {
    sessionId: "ssh-a",
    localPath: "/local/a",
    remotePath: "/remote/a",
  });
  await f.call(a, "tunnelde_tasks_start", { executable: "node", cwd: "/local" });
  assert.equal(
    (
      await f.call(
        b,
        "tunnelde_files_transferStatus",
        { transferId: "transfer-a" },
        20,
        f.otherToken,
      )
    ).result.isError,
    true,
  );
  assert.equal(
    (await f.call(b, "tunnelde_tasks_status", { taskId: "task-a" }, 21, f.otherToken)).result
      .isError,
    true,
  );
  assert.deepEqual((await f.call(a, "tunnelde_tasks_list")).result.structuredContent.result, [
    { taskId: "task-a" },
  ]);
  await f.server.revokeClient("a");
  assert.ok(
    calls.some(
      (call) => call.method === "files.cancelTransfer" && call.params.transferId === "transfer-a",
    ),
  );
  assert.ok(
    calls.some((call) => call.method === "tasks.cancel" && call.params.taskId === "task-a"),
  );
});
test("expired sessions require fresh initialization", async (t) => {
  let time = 100;
  const f = await fixture(t, { now: () => time, sessionTimeoutMs: 1000 });
  const session = await f.initialize();
  time += 1001;
  assert.equal((await f.post({ jsonrpc: "2.0", id: 5, method: "ping" }, session)).status, 404);
});
test("server shutdown closes the actual listening socket", async (t) => {
  const f = await fixture(t);
  await f.initialize();
  await f.server.stop();
  await assert.rejects(fetch(f.url));
});
test("large tool output stays within a one-MiB stdio frame without duplicated payload", async (t) => {
  const payload = { content: "x".repeat(600000) };
  const f = await fixture(t, { invoke: async () => payload });
  const session = await f.initialize();
  const response = await f.post(
    {
      jsonrpc: "2.0",
      id: 40,
      method: "tools/call",
      params: { name: "tunnelde_files_local_readText", arguments: { path: "/approved/file.txt" } },
    },
    session,
  );
  const text = await response.text();
  assert.ok(Buffer.byteLength(text) <= 1024 * 1024);
  const value = JSON.parse(text);
  assert.equal(value.result.isError, undefined);
  assert.equal(value.result.structuredContent, undefined);
  assert.deepEqual(JSON.parse(value.result.content[0].text), { result: payload });
});
test("token is blocked before asynchronous revocation cleanup finishes", async (t) => {
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const f = await fixture(t, { revoke: async () => barrier });
  const session = await f.initialize();
  const revoking = f.server.revokeClient("a");
  try {
    assert.equal((await f.post({ jsonrpc: "2.0", id: 2, method: "ping" }, session)).status, 401);
  } finally {
    release();
    await revoking;
  }
});
test("HTTP session deletion does not orphan owned background tasks on server stop", async (t) => {
  const calls = [];
  const f = await fixture(t, {
    invoke: async (params) => {
      calls.push(params);
      return params.method === "tasks.start"
        ? { taskId: "background-id", status: "running" }
        : true;
    },
  });
  const session = await f.initialize();
  await f.call(session, "tunnelde_tasks_start", { executable: "node", cwd: "/workspace" });
  await fetch(f.url, {
    method: "DELETE",
    headers: { authorization: `Bearer ${f.token}`, "mcp-session-id": session },
  });
  assert.equal(f.server.sessionCount, 0);
  await f.server.stop();
  assert.ok(
    calls.some((call) => call.method === "tasks.cancel" && call.params.taskId === "background-id"),
  );
});
test("protocol initialization gates tools and request body limits reject large payloads", async (t) => {
  const f = await fixture(t);
  const response = await f.post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "client", version: "1" },
    },
  });
  const session = response.headers.get("mcp-session-id");
  assert.equal(
    (await f.post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, session)).status,
    400,
  );
  assert.equal(
    (
      await f.post(
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { padding: "x".repeat(270000) } },
        session,
      )
    ).status,
    413,
  );
  assert.equal(f.calls.length, 0);
});
test("concurrent request IDs are unique and each client has a bounded pending queue", async (t) => {
  const entered = [];
  const f = await fixture(t, {
    invoke: async (params, signal) =>
      new Promise((resolve, reject) => {
        entered.push(params);
        signal.addEventListener("abort", () => reject(new Error("Cancelled")), { once: true });
      }),
  });
  const session = await f.initialize();
  const pending = [1, 2, 3, 4].map((id) =>
    f.call(session, "tunnelde_sessions_exec", { sessionId: "ssh-a", command: "sleep" }, id),
  );
  while (entered.length < 4) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    (
      await f.post(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "tunnelde_hosts_snapshot" },
        },
        session,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await f.post(
        {
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: { name: "tunnelde_hosts_snapshot" },
        },
        session,
      )
    ).status,
    429,
  );
  await f.server.revokeClient("a");
  assert.ok((await Promise.all(pending)).every((result) => result.result.isError));
});
test("stdio bridge subprocess initializes and calls a real Streamable HTTP server", async (t) => {
  const f = await fixture(t);
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("../bridge.mjs", import.meta.url))],
    {
      env: { ...process.env, TUNNELDE_MCP_URL: f.url, TUNNELDE_MCP_TOKEN: f.token },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  t.after(() => child.kill());
  const reader = createInterface({ input: child.stdout });
  const lines = [],
    waiters = [];
  reader.on("line", (line) => {
    const value = JSON.parse(line);
    const waiter = waiters.shift();
    waiter ? waiter(value) : lines.push(value);
  });
  const next = () =>
    lines.length ? Promise.resolve(lines.shift()) : new Promise((resolve) => waiters.push(resolve));
  const send = (message) => child.stdin.write(JSON.stringify(message) + "\n");
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "stdio-test", version: "1" },
    },
  });
  assert.equal((await next()).result.protocolVersion, "2025-11-25");
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.equal((await next()).result.tools.length, TOOLS.length);
  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "tunnelde_hosts_snapshot", arguments: {} },
  });
  assert.equal((await next()).result.structuredContent.result.ok, true);
  child.stdin.end();
  const exit = await new Promise((resolve) => child.on("exit", resolve));
  assert.equal(exit, 0);
  assert.equal(stderr, "");
});
test("reviewer accepts only strict independent JSON verdicts and refuses redirects/errors", async () => {
  const action = { method: "sessions.exec", params: { command: "pwd" }, scope };
  const config = { baseURL: "https://reviewer.example/v1", model: "independent-model" };
  const seen = [];
  const verdict = await reviewAction(
    config,
    "secret-key",
    action,
    undefined,
    async (url, options) => {
      seen.push([url, options]);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ approved: true, reason: "Print working directory" }),
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  );
  assert.equal(verdict.approved, true);
  assert.equal(String(seen[0][0]), "https://reviewer.example/v1/chat/completions");
  assert.equal(seen[0][1].redirect, "error");
  assert.equal(
    (await reviewAction(config, "key", action, undefined, async () => new Response("not JSON")))
      .approved,
    false,
  );
  assert.equal((await reviewAction(config, null, action)).approved, false);
  assert.equal(
    (await reviewAction({ ...config, baseURL: "http://external.example/v1" }, "key", action))
      .approved,
    false,
  );
});
function fakeHost() {
  const store = new Map(),
    secrets = new Map(),
    calls = [];
  return {
    store,
    secrets,
    calls,
    async call(method, params = {}) {
      calls.push([method, params]);
      if (method === "api.describe")
        return {
          methods: [
            "tools.invoke",
            "tools.cancel",
            "tools.revokeClient",
            "secrets.get",
            "secrets.set",
          ].map((name) => ({ name })),
        };
      if (method === "storage.get") return structuredClone(store.get(params.key) ?? null);
      if (method === "storage.set") {
        store.set(params.key, structuredClone(params.value));
        return null;
      }
      if (method === "secrets.get") return secrets.get(params.key) ?? null;
      if (method === "secrets.set") {
        secrets.set(params.key, params.value);
        return null;
      }
      if (method === "secrets.delete") {
        secrets.delete(params.key);
        return null;
      }
      if (method === "sessions.list") return [{ id: "ssh-a", hostId: "host-a", title: "A" }];
      if (method === "hosts.snapshot")
        return { hosts: [{ id: "host-a", name: "A", host: "example", username: "user" }] };
      if (method === "ui.confirm") return true;
      return null;
    },
  };
}
test("plugin creates a one-time token, persists only its hash and revokes without leaking keys", async () => {
  const host = fakeHost(),
    controller = createController(host);
  await controller.initialize();
  const result = await controller.run("client.create", {
    name: "Code",
    mode: "ask",
    sessionId: "ssh-a",
  });
  const token = /Token \(shown once\): ([A-Za-z0-9_-]{43})/.exec(result.text)[1];
  const state = host.store.get("mcp.state.v1");
  assert.equal(state.clients[0].tokenHash, tokenHash(token));
  assert.ok(!JSON.stringify(state).includes(token));
  assert.ok(!JSON.stringify(await controller.render("main", "zh-CN")).includes(token));
  await controller.run("client.revoke", { clientId: state.clients[0].id });
  assert.equal(host.store.get("mcp.state.v1").clients.length, 0);
  assert.ok(host.calls.some(([method]) => method === "tools.revokeClient"));
});
test("reviewer key goes only to OS secrets and is never returned by the plugin view", async () => {
  const host = fakeHost(),
    controller = createController(host);
  await controller.initialize();
  await controller.run("reviewer.save", {
    baseURL: "https://reviewer.example/v1",
    model: "judge",
    apiKey: "private-review-key",
  });
  assert.equal(host.secrets.get("mcp.reviewer.apiKey"), "private-review-key");
  assert.ok(!JSON.stringify(host.store.get("mcp.state.v1")).includes("private-review-key"));
  assert.ok(!JSON.stringify(await controller.render("main")).includes("private-review-key"));
  const forms = (await controller.render("main")).blocks.filter((block) => block.type === "form");
  assert.equal(
    forms.find((form) => form.id === "reviewer").fields.find((field) => field.id === "apiKey").type,
    "password",
  );
});
test("scope configuration rejects relative roots and full access requires host confirmation", async () => {
  const host = fakeHost(),
    controller = createController(host);
  await controller.initialize();
  await assert.rejects(
    controller.run("client.create", { name: "bad", mode: "ask", localRoot: "relative/folder" }),
    /absolute/,
  );
  await assert.rejects(
    controller.run("client.create", { name: "bad", mode: "ask", remoteRoot: "/home/user" }),
    /Choose a session/,
  );
  await controller.run("client.create", { name: "full", mode: "full", sessionId: "ssh-a" });
  assert.ok(
    host.calls.some(
      ([method, params]) =>
        method === "ui.confirm" && params.message.includes("arbitrary commands"),
    ),
  );
});
test("invalid persisted settings fail closed until explicit confirmed reset", async () => {
  const host = fakeHost();
  host.store.set("mcp.state.v1", { version: 9, clients: [{ tokenHash: "wrong" }] });
  const controller = createController(host);
  await controller.initialize();
  await assert.rejects(controller.run("start"), /invalid/);
  const view = await controller.render("main");
  assert.ok(
    view.blocks.some(
      (block) =>
        block.type === "form" && block.actions.some((action) => action.command === "reset"),
    ),
  );
  await controller.run("reset");
  assert.equal(host.store.get("mcp.state.v1").version, 1);
  assert.equal(host.store.get("mcp.state.v1").clients.length, 0);
});
test("installed plugin entry point supports real bidirectional host RPC and never autostarts HTTP", async (t) => {
  const host = fakeHost();
  const child = spawn(process.execPath, [fileURLToPath(new URL("../index.mjs", import.meta.url))], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  const pending = new Map();
  let sequence = 10000,
    stderr = "";
  child.stderr.on("data", (value) => {
    stderr += value;
  });
  const reader = createInterface({ input: child.stdout });
  reader.on("line", (line) => {
    const message = JSON.parse(line);
    if (message.method) {
      void host
        .call(message.method, message.params)
        .then((result) =>
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\n"),
        );
    } else {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });
  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++sequence;
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  const initialized = await call("initialize", { apiVersion: 1 });
  assert.equal(initialized.result.listening, false);
  const view = await call("view.render", { view: "main", locale: "zh-CN" });
  assert.equal(view.result.title, "Tunnelde MCP");
  const created = await call("command.run", {
    command: "client.create",
    input: { name: "stdio-host-test", mode: "readOnly" },
  });
  assert.match(created.result.text, /Token \(shown once\):/);
  const stopped = await call("shutdown");
  assert.equal(stopped.result, null);
  child.stdin.end();
  assert.equal(await new Promise((resolve) => child.on("exit", resolve)), 0);
  assert.equal(stderr, "");
});
