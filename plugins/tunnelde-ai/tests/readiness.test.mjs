import test from "node:test";
import assert from "node:assert/strict";
import { AiPlugin } from "../lib/engine.mjs";
import { checkedTask, prepareAgent } from "../lib/readiness.mjs";
import { installAgent, nodeInstallScript } from "../lib/installation.mjs";

const execution = { kind: "remote", sessionId: "ssh", hostId: "server", address: "test:22", title: "Server", home: "/home/test", cwd: "/home/test", runtime: "/opt/node", platform: "posix" };
const profile = { id: "api", name: "API", protocol: "openai-chat", model: "test" };

function fixture({ consent = true, failNode = false, authenticated = true, waiting = false, authStatus, sandboxFailure = false } = {}) {
  const calls = [], tasks = new Map(), storage = new Map();
  let seq = 0;
  const host = {
    calls, tasks,
    async call(method, params, options = {}) {
      options.signal?.throwIfAborted();
      calls.push({ method, params: structuredClone(params) });
      if (method === "storage.get") return storage.get(params.key) ?? null;
      if (method === "storage.set") { storage.set(params.key, params.value); return null; }
      if (method === "events.publish") return true;
      if (method === "sessions.list") return [{ id: "ssh", hostId: "server", title: "Server", address: "test:22" }];
      if (method === "files.sftp.resolveDirectory") return { home: execution.home, path: execution.cwd };
      if (method === "files.local.home") return "/home/local";
      if (method === "ui.confirm") return consent;
      if (method.startsWith("files.sftp.")) return null;
      if (method === "tasks.start") {
        const id = `task-${tasks.size}`;
        const node = params.args.includes("--eval");
        const finite = node || params.args.includes("--version") || params.args.includes("auth");
        const text = node ? JSON.stringify({ version: "24.0.0", path: "/opt/node" }) : params.args.includes("auth") ? JSON.stringify({ loggedIn: authenticated }) : "1.0.0";
        tasks.set(id, { status: params.args.includes("auth") && authStatus ? authStatus : waiting || !finite ? "running" : "completed", exitCode: failNode && node ? 127 : 0,
          events: finite ? [{ seq: ++seq, stream: failNode && node ? "stderr" : "stdout", data: failNode && node ? "node: not found" : text }] : [] });
        return { taskId: id };
      }
      const task = tasks.get(params.taskId);
      if (method === "tasks.readOutput") return { events: task.events.filter((event) => event.seq > params.afterSeq), truncated: false };
      if (method === "tasks.status") return { status: task.status, exitCode: task.exitCode };
      if (method === "tasks.cancel") { task.status = "cancelled"; return true; }
      if (method === "tasks.write") {
        const record = JSON.parse(params.data);
        let result;
        if (record.method === "initialize") result = { ok: true };
        if (record.method === "account/read") result = { requiresOpenaiAuth: true, account: authenticated ? { type: "chatgpt" } : null };
        if (record.method === "thread/start") {
          if (sandboxFailure) task.events.push({ seq: ++seq, stream: "stdout", data: JSON.stringify({ id: record.id, error: { message: "native sandbox unavailable" } }) + "\n" });
          else result = { thread: { id: "probe" } };
        }
        if (result) task.events.push({ seq: ++seq, stream: "stdout", data: JSON.stringify({ jsonrpc: "2.0", id: record.id, result }) + "\n" });
        if (record.type === "control_request") task.events.push({ seq: ++seq, stream: "stdout", data: JSON.stringify({ type: "control_response", response: { request_id: record.request_id, subtype: "success" } }) + "\n" });
        if (record.type === "get_state" || record.type === "get_available_models") task.events.push({ seq: ++seq, stream: "stdout", data: JSON.stringify({ type: "response", id: record.id, success: true, data: record.type === "get_state" ? { model: authenticated ? { id: "test" } : null } : { models: authenticated ? [{ id: "test" }] : [] } }) + "\n" });
        return true;
      }
      throw new Error(`Unexpected ${method}`);
    },
  };
  return host;
}

test("initialization reports timeouts and cancellations without suggesting an install", async () => {
  for (const status of ["timedOut", "cancelled"]) {
    const host = fixture({ authStatus: status });
    const selected = { ...profile, protocol: "claude-code", executable: "claude" };
    await assert.rejects(prepareAgent(host, selected, { ...execution }, {}), (error) => {
      assert.equal(error.code, status === "timedOut" ? "agent.prepare.timeout" : "agent.prepare.cancelled");
      assert.doesNotMatch(error.message, /auth login|Install or select/);
      assert.match(error.message, status === "timedOut" ? /did not respond.*remote host.*connection/ : /cancelled or access was revoked/);
      return true;
    });
    assert.ok([...host.tasks.values()].every((task) => task.status === "cancelled"));
  }
  const host = fixture({ waiting: true });
  await assert.rejects(checkedTask(host, execution, "claude", ["--version"], 1), { code: "agent.prepare.timeout" });
  assert.ok([...host.tasks.values()].every((task) => task.status === "cancelled"));
});
test("Codex preparation validates the selected sandbox without a prompt or permission downgrade", async () => {
  const selected = { ...profile, protocol: "codex", executable: "codex" };
  const denied = fixture({ sandboxFailure: true });
  await assert.rejects(prepareAgent(denied, selected, { ...execution }, {}), /native sandbox.*Access was not widened.*native sandbox unavailable/);
  const records = denied.calls.filter(call => call.method === "tasks.write").map(call => JSON.parse(call.params.data));
  const thread = records.find(record => record.method === "thread/start");
  assert.equal(thread.params.ephemeral, true);
  assert.match(thread.params.permissions, /^tunnelde-[a-f0-9-]{36}$/);
  assert.equal(thread.params.sandbox, undefined);
  assert.equal(records.some(record => record.method === "turn/start"), false);
  assert.ok([...denied.tasks.values()].every(task => task.status === "cancelled"));
  const full = fixture();
  await prepareAgent(full, selected, { ...execution }, {}, undefined, { mode: "full" });
  const fullRecords = full.calls.filter(call => call.method === "tasks.write").map(call => JSON.parse(call.params.data));
  assert.equal(fullRecords.find(record => record.method === "thread/start").params.sandbox, "danger-full-access");
});

test("declining initialization never probes Node, uploads files or starts an agent", async () => {
  const host = fixture({ consent: false });
  await assert.rejects(prepareAgent(host, profile, { ...execution }, {}), /cancelled/);
  assert.deepEqual(host.calls.map((call) => call.method), ["ui.confirm"]);
});

test("missing remote Node fails before upload and before appending a user turn", async () => {
  const host = fixture({ failNode: true });
  const engine = new AiPlugin(host);
  await engine.command("ai.configure", { config: { profiles: [profile], scope: {} } });
  await engine.command("ai.target", { targetId: "ssh", runtime: "/opt/node" });
  assert.equal(engine.block().readiness.status, "required");
  await assert.rejects(engine.command("ai.send", { message: "Never queued" }), /Initialize/);
  const result = await engine.command("ai.prepare", {});
  assert.equal(result.block.readiness.status, "checking");
  await engine.preparationPromise;
  assert.equal(engine.block().readiness.status, "error");
  assert.match(engine.block().readiness.detail, /node: not found/);
  assert.equal(engine.block().messages.length, 0);
  assert.equal(host.calls.some((call) => call.method === "files.sftp.mkdir"), false);
  assert.ok([...host.tasks.values()].every((task) => task.status === "cancelled"));
  await engine.shutdown();
});

test("remote API preparation verifies Node and worker JSON-RPC without secrets or a chat prompt", async () => {
  const host = fixture();
  const state = {};
  let persisted;
  const result = await prepareAgent(host, profile, { ...execution }, state, undefined, {
    checkpoint: async () => { persisted = structuredClone(state.remoteStdio); },
  });
  assert.match(result.detail, /protocol initialized/);
  const records = host.calls.filter((call) => call.method === "tasks.write").map((call) => JSON.parse(call.params.data));
  assert.ok(records.some((record) => record.method === "initialize"));
  assert.equal(records.some((record) => record.method === "command.run"), false);
  assert.equal(host.calls.some((call) => call.method === "secrets.get"), false);
  assert.ok(state.remoteStdio.directory.startsWith("/home/test/.TunneldeAI/Chats/"));
  assert.equal(persisted.directory, state.remoteStdio.directory);
  assert.equal(persisted.incomplete, false);
});

for (const protocol of ["codex", "claude-code", "pi"]) {
  test(`${protocol} preparation uses its native protocol and rejects a missing login`, async () => {
    const selected = { ...profile, protocol, executable: `/bin/${protocol}` };
    const host = fixture();
    await prepareAgent(host, selected, { ...execution }, {});
    const records = host.calls.filter((call) => call.method === "tasks.write").map((call) => JSON.parse(call.params.data));
    assert.equal(records.some((record) => record.method === "turn/start" || record.type === "user" || record.type === "prompt"), false);
    if (protocol === "pi") {
      const starts = host.calls.filter((call) => call.method === "tasks.start");
      const rpc = starts.find((call) => call.params.args.includes("rpc"));
      assert.ok(rpc.params.args.includes("--no-extensions"));
      assert.equal(rpc.params.args.includes("--extension"), false);
      assert.equal(rpc.params.args.some((arg) => arg.includes("pi-permissions.mjs")), false);
    }
    const signedOut = fixture({ authenticated: false });
    await assert.rejects(prepareAgent(signedOut, selected, { ...execution }, {}), /signed in|unavailable|not initialize/);
    assert.ok([...signedOut.tasks.values()].every((task) => task.status === "cancelled"));
  });
}

test("cancelling initialization stops owned tasks and leaves no user message", async () => {
  const host = fixture({ waiting: true });
  const engine = new AiPlugin(host);
  await engine.command("ai.configure", { config: { profiles: [profile], scope: {} } });
  await engine.command("ai.target", { targetId: "ssh", runtime: "/opt/node" });
  await engine.command("ai.prepare", {});
  while (!host.tasks.size) await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(engine.command("ai.session", { action: "new" }), /Cancel initialization/);
  await assert.rejects(engine.command("ai.target", { targetId: "local" }), /Stop active agents/);
  await assert.rejects(engine.command("ai.configure", { config: { profiles: [profile], scope: {} } }), /Stop active agents/);
  await engine.command("ai.stop", {});
  assert.equal(engine.block().readiness.status, "error");
  assert.match(engine.block().readiness.detail, /cancelled/);
  assert.equal(engine.block().messages.length, 0);
  assert.ok([...host.tasks.values()].every((task) => task.status === "cancelled"));
  await engine.shutdown();
});

test("changing provider configuration clears previous runtime readiness", async () => {
  const host = fixture();
  const engine = new AiPlugin(host);
  await engine.command("ai.configure", { config: { profiles: [profile], scope: {} } });
  await engine.command("ai.target", { targetId: "ssh", runtime: "/opt/node" });
  await engine.command("ai.prepare", {});
  await engine.preparationPromise;
  assert.equal(engine.block().readiness.status, "ready");
  assert.equal(engine.preparations.size, 1);
  await engine.command("ai.configure", { config: { profiles: [{ ...profile, model: "changed-model" }], scope: {} } });
  assert.equal(engine.block().readiness.status, "required");
  assert.equal(engine.preparations.size, 0);
  await assert.rejects(engine.command("ai.send", { message: "Not queued" }), /Initialize/);
  assert.equal(engine.block().messages.length, 0);
  await engine.shutdown();
});

test("installation consent is required before network requests or commands", async () => {
  const host = fixture({ consent: false });
  let fetched = false;
  await assert.rejects(installAgent(host, profile, { ...execution }, async () => { fetched = true; }), /cancelled/);
  assert.equal(fetched, false);
  assert.deepEqual(host.calls.map((call) => call.method), ["ui.confirm"]);
});

test("runtime installer quotes unusual home paths and checks official archive integrity before extraction", () => {
  const script = nodeInstallScript("/home/a'$(touch injected)", "https://nodejs.org/dist/v24.0.0/node-v24.0.0-linux-x64.tar.gz", "a".repeat(64));
  assert.ok(script.indexOf("checksum verification failed") < script.indexOf("tar -xzf"));
  assert.ok(script.includes("app_dir='/home/a'\"'\"'$(touch injected)/.TunneldeAI'"));
  assert.equal(script.includes("sudo"), false);
  assert.throws(() => nodeInstallScript("/home", "https://evil.test/archive", "a".repeat(64)), /Invalid official/);
  assert.throws(() => nodeInstallScript("/home", "https://nodejs.org/dist/v24.0.0/node-v24.0.0-linux-x64.tar.gz", "bad"), /Invalid official/);
});
