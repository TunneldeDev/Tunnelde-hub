import test from "node:test";
import { preparedRuntime } from "./prepared-fixture.mjs";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPlugin } from "../lib/sdk.mjs";
import { startRemote } from "../remote-entry.mjs";
import { AiPlugin } from "../lib/engine.mjs";
import { createRunnerObserver } from "../lib/runner-observation.mjs";
import { validateConfig } from "../lib/config.mjs";
import { PLUGIN_ID, PROFILE_POLICY } from "../lib/identity.mjs";

test("remote helper picker configuration does not require a legacy runnerPath", () => {
  const profile = {
    id: "main",
    protocol: "openai-chat",
    model: "model",
    helperBinary: "C:\\build\\tunnelde-agent",
    remote: {
      sessionId: "ssh",
      platform: "posix",
      directory: "/opt/agent",
      executable: "/opt/node",
    },
  };
  assert.equal(validateConfig({ profiles: [profile] }).profiles[0].remote.runnerPath, undefined);
  assert.throws(
    () => validateConfig({ profiles: [{ ...profile, helperBinary: undefined }] }),
    /local native helper/,
  );
});

test("SSH reconnection preserves scope fingerprint and rebinds only after host ownership verification", async () => {
  const data = new Map(),
    calls = [];
  const host = {
    async call(method, params) {
      calls.push({ method, params });
      if (method === "storage.get") return data.get(params.key) ?? null;
      if (method === "storage.set") {
        data.set(params.key, params.value);
        return null;
      }
      if (method === "runners.status") {
        assert.equal(params.sessionId, "new-ssh");
        return { status: "running" };
      }
      throw new Error(`Unexpected ${method}`);
    },
  };
  const profile = {
    id: "main",
    protocol: "openai-chat",
    model: "model",
    helperBinary: "C:\\runner",
    remote: {
      sessionId: "old-ssh",
      platform: "posix",
      directory: "/opt/agent",
      executable: "/opt/node",
    },
  };
  const config = {
    profiles: [profile],
    scope: { sessionIds: ["old-ssh"], remoteRoots: [{ sessionId: "old-ssh", path: "/work" }] },
  };
  const engine = new AiPlugin(host);
  await engine.command("ai.configure", { config });
  const revision = engine.configRevision,
    session = engine.newSession();
  session.remote = {
    sessionId: "old-ssh",
    runnerId: "runner",
    profileId: "main",
    revision,
    runId: "prior",
    afterSeq: 0,
  };
  session.run = { id: "prior", profileId: "main", mode: "ask", status: "interrupted" };
  const next = structuredClone(config);
  next.profiles[0].remote.sessionId = "new-ssh";
  next.scope.sessionIds = ["new-ssh"];
  next.scope.remoteRoots[0].sessionId = "new-ssh";
  await engine.command("ai.configure", { config: next });
  assert.equal(engine.configRevision, revision);
  await engine.command("ai.recover", { action: "inspect" });
  assert.equal(session.remote.sessionId, "new-ssh");
  next.scope.remoteRoots[0].path = "/other";
  await engine.command("ai.configure", { config: next });
  assert.notEqual(engine.configRevision, revision);
  await assert.rejects(
    engine.executeRemote(
      engine.config.profiles[0],
      engine.config,
      session,
      "resume",
      new AbortController().signal,
      true,
    ),
    /configuration changed/,
  );
  assert.ok(
    !calls.some((item) => item.method === "runners.deploy" || item.method === "runners.send"),
  );
});

test("24-hour approval waits are available only to explicitly remote transports", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const input = new PassThrough(),
    output = new PassThrough();
  output.resume();
  const remote = createPlugin(
    {},
    { input, output, longWaitMethods: ["ui.confirm", "tools.invoke"] },
  );
  let settled = false;
  const pending = remote.host
    .call("ui.confirm", { message: "offline" }, { timeoutMs: 86400000 })
    .then(() => {
      settled = true;
    });
  context.mock.timers.tick(120001);
  await Promise.resolve();
  assert.equal(settled, false);
  input.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: true }) + "\n");
  await pending;
  assert.equal(settled, true);
  remote.close();
  const localInput = new PassThrough(),
    localOutput = new PassThrough();
  localOutput.resume();
  const local = createPlugin({}, { input: localInput, output: localOutput });
  await assert.rejects(local.host.call("ui.confirm", {}, { timeoutMs: 86400000 }), /timeoutMs/);
  local.close();
});
test("remote entry uses fallback configuration and ephemeral initialized secrets", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tunnelde-ai-config-"));
  const input = new PassThrough(),
    output = new PassThrough();
  let client;
  try {
    const config = {
      profiles: [
        {
          id: "main",
          name: "Main",
          protocol: "openai-chat",
          model: "model",
          baseUrl: "https://example.com/v1",
        },
      ],
      activeProfileId: "main",
      scope: { localRoots: [directory] },
    };
    const file = path.join(directory, "config.json");
    await writeFile(
      file,
      JSON.stringify({ version: 1, pluginId: PLUGIN_ID, profilePolicy: PROFILE_POLICY, config }),
    );
    const replies = new Map(),
      waits = new Map();
    let buffer = "";
    output.on("data", (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const record = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        if (record.method)
          input.write(JSON.stringify({ jsonrpc: "2.0", id: record.id, result: null }) + "\n");
        else {
          replies.set(record.id, record);
          waits.get(record.id)?.(record);
        }
      }
    });
    const request = (id, method, params) =>
      new Promise((resolve) => {
        waits.set(id, resolve);
        input.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    client = await startRemote(["--config", file], { input, output });
    await request(100, "initialize", {
      remote: true,
      secrets: { "provider.main": "ephemeral-secret" },
    });
    const view = await request(101, "view.render", { view: "chat", locale: "zh" });
    assert.equal(view.result.blocks[0].config.profiles[0].hasApiKey, true);
    assert.ok(!JSON.stringify(view).includes("ephemeral-secret"));
    await request(102, "shutdown", {});
  } finally {
    client?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test("remote send deploys only the selected runtime and relays pending approvals", async () => {
  const data = new Map(),
    calls = [];
  let engine,
    request,
    sent = false;
  const host = {
    async call(method, params) {
      calls.push({ method, params: structuredClone(params) });
      if (method === "storage.get") return data.get(params.key) ?? null;
      if (method === "storage.set") {
        data.set(params.key, structuredClone(params.value));
        return null;
      }
      if (method === "secrets.get") return "api-secret";
      if (method === "runners.deploy") return { deployed: true };
      if (method === "runners.start") return { runnerId: "runner" };
      if (method === "runners.send") {
        if (params.message.method === "command.run") request = params.message;
        return true;
      }
      if (method === "events.publish") {
        if (params.payload.type === "approval")
          setImmediate(() => {
            void engine.command("ai.approve", {
              requestId: params.payload.approval.id,
              decision: "allow",
            });
          });
        return true;
      }
      if (method === "runners.poll") {
        assert.equal(sent, false);
        sent = true;
        return {
          events: [
            {
              seq: 1,
              message: {
                type: "response",
                message: {
                  id: request.id,
                  result: {
                    block: {
                      activeSessionId: "remote-session",
                      run: { id: request.params.input.runId },
                      messages: [],
                      tasks: [],
                    },
                  },
                },
              },
            },
            {
              seq: 2,
              message: {
                type: "approval",
                approvalId: "native-approval",
                method: "files.local.writeText",
                params: { path: "/work/a" },
              },
            },
            {
              seq: 3,
              message: {
                type: "event",
                event: "chat",
                payload: { type: "delta", messageId: "a", delta: "remote answer" },
              },
            },
            {
              seq: 4,
              message: { type: "event", event: "chat", payload: { type: "done", status: "done" } },
            },
          ],
          pendingApprovals: [],
        };
      }
      throw new Error(`Unexpected ${method}`);
    },
  };
  engine = new AiPlugin(host);
  await engine.command("ai.configure", {
    config: {
      profiles: [
        {
          id: "main",
          protocol: "openai-chat",
          model: "model",
          remote: {
            sessionId: "ssh",
            platform: "posix",
            directory: "/opt/agent",
            runnerPath: "/local/native-runner",
            executable: "/opt/node/bin/node",
          },
        },
      ],
      scope: { sessionIds: ["ssh"], remoteRoots: [{ sessionId: "ssh", path: "/work" }] },
    },
  });
  await preparedRuntime(engine);
  await engine.command("ai.send", { message: "hello" });
  await [...engine.runs.values()][0].done;
  assert.equal(engine.block().run.status, "done");
  assert.equal(
    calls.find((item) => item.method === "runners.deploy").params.executable,
    "/opt/node/bin/node",
  );
  const started = calls.find((item) => item.method === "runners.start");
  assert.equal(started.params.config.pluginId, PLUGIN_ID);
  assert.deepEqual(started.params.config.profilePolicy, PROFILE_POLICY);
  assert.deepEqual(started.params.config.config.scope.localRoots, ["/work"]);
  assert.equal(started.params.config.config.profiles[0].remote, undefined);
  assert.equal(started.params.secrets["provider.main"], "api-secret");
  assert.ok(!JSON.stringify([...data]).includes("api-secret"));
  assert.ok(
    calls.some(
      (item) =>
        item.method === "runners.send" &&
        item.params.message.type === "approval" &&
        item.params.message.approved,
    ),
  );
  await engine.shutdown();
});

test("lost send acknowledgement resumes from the journal without resending the operation", async () => {
  const data = new Map(), calls = [];
  let request, stage = "send";
  const host = {
    async call(method, params) {
      calls.push({ method, params: structuredClone(params) });
      if (method === "storage.get") return data.get(params.key) ?? null;
      if (method === "storage.set") {
        data.set(params.key, structuredClone(params.value));
        return null;
      }
      if (method === "runners.send") {
        request = structuredClone(params.message);
        const persisted = data.get("ai.sessions").sessions.find((s) => s.remote?.runnerId === "runner");
        assert.equal(persisted.remote.requestId, request.id);
        assert.equal(persisted.remote.runId, "run-original");
        throw new Error("SSH response lost after enqueue");
      }
      if (method === "runners.poll") {
        assert.equal(stage, "recover");
        return { events: [
          { seq: 1, message: { type: "response", message: { id: request.id, result: { block: {
            activeSessionId: "remote-session", run: { id: "run-original" }, messages: [], tasks: [],
          } } } } },
          { seq: 2, message: { type: "event", event: "chat", payload: {
            runId: "older-run", type: "done", status: "done",
          } } },
          { seq: 3, message: { type: "event", event: "chat", payload: {
            runId: "run-original", type: "done", status: "done",
          } } },
        ] };
      }
      throw new Error(`Unexpected ${method}`);
    },
  };
  const engine = new AiPlugin(host);
  const profile = { id: "main", name: "Main", remote: { sessionId: "ssh" } };
  const config = { scope: { sessionIds: ["ssh"], remoteRoots: [{ sessionId: "ssh", path: "/work" }] } };
  const session = engine.newSession();
  session.remote = { pluginId: PLUGIN_ID, profilePolicy: structuredClone(PROFILE_POLICY),
    sessionId: "ssh", runnerId: "runner", profileId: "main", revision: engine.configRevision,
    afterSeq: 0, runId: "previous-run" };
  session.run = { id: "run-original" };
  await assert.rejects(engine.executeRemote(profile, config, session, "hello", new AbortController().signal, false), /response lost/);
  assert.equal(session.remote.acknowledged, false);
  stage = "recover";
  const restarted = new AiPlugin(host);
  await restarted.initialize();
  const restored = restarted.session(session.id);
  await restarted.executeRemote(profile, config, restored, "ignored", new AbortController().signal, true);
  assert.equal(restored.remote.afterSeq, 3);
  assert.equal(restored.remote.acknowledged, true);
  assert.equal(calls.filter((item) => item.method === "runners.send").length, 1);
});

for (const failure of ["busy", "notFound"]) {
  test(`reconnecting with ${failure} preserves the original runner binding`, async () => {
    const calls = [];
    const host = { async call(method, params) {
      calls.push(method);
      assert.equal(method, "runners.status");
      assert.deepEqual(params, { sessionId: "new-ssh", runnerId: "runner" });
      if (failure === "busy") throw new Error("plugin.runners.busy");
      return { status: "notFound" };
    } };
    const engine = new AiPlugin(host);
    let time = 0;
    engine.observeRunner = createRunnerObserver(host, { now: () => time, wait: async ms => { time += ms; } });
    const session = engine.newSession();
    session.remote = { pluginId: PLUGIN_ID, profilePolicy: structuredClone(PROFILE_POLICY),
      sessionId: "old-ssh", runnerId: "runner", profileId: "main", revision: engine.configRevision,
      afterSeq: 11, runId: "run-original", requestId: 42, acknowledged: true };
    session.run = { id: "run-original" };
    const before = structuredClone(session.remote);
    const profile = { id: "main", remote: { sessionId: "new-ssh" } };
    const config = { scope: { sessionIds: ["new-ssh"], remoteRoots: [{ sessionId: "new-ssh", path: "/work" }] } };
    await assert.rejects(engine.executeRemote(profile, config, session, "ignored", new AbortController().signal, true),
      error => error.name === "RemoteRunnerInterrupted");
    assert.deepEqual(session.remote, before);
    assert.equal(calls.length, failure === "busy" ? 8 : 1);
  });
}

test("failed request identity persistence never sends a remote operation", async () => {
  const calls = [];
  const host = { async call(method) {
    calls.push(method);
    if (method === "storage.set") throw new Error("storage unavailable");
    throw new Error(`Unexpected ${method}`);
  } };
  const engine = new AiPlugin(host);
  const session = engine.newSession();
  session.run = { id: "run-new" };
  session.remote = { pluginId: PLUGIN_ID, profilePolicy: structuredClone(PROFILE_POLICY), sessionId: "ssh",
    runnerId: "runner", profileId: "main", revision: engine.configRevision, afterSeq: 0, runId: null };
  const profile = { id: "main", name: "Main", remote: { sessionId: "ssh" } };
  const config = { scope: { sessionIds: ["ssh"], remoteRoots: [{ sessionId: "ssh", path: "/work" }] } };
  await assert.rejects(engine.executeRemote(profile, config, session, "hello", new AbortController().signal, false), /storage unavailable/);
  assert.deepEqual(calls, ["storage.set"]);
});

for (const failurePoint of ["send", "poll", "busy", "notFound", "transient-busy", "notFound-done"]) {
  test(`remote ${failurePoint} preserves the request without resending`, async () => {
    const data = new Map();
    let request, disconnected = true, sends = 0, polls = 0;
    const host = { async call(method, params) {
      if (method === "storage.get") return data.get(params.key) ?? null;
      if (method === "storage.set") { data.set(params.key, structuredClone(params.value)); return null; }
      if (method === "events.publish") return true;
      if (method === "secrets.get") return "fixture";
      if (method === "runners.deploy") return true;
      if (method === "runners.start") return { runnerId: "runner" };
      if (method === "runners.send") {
        sends++;
        request = structuredClone(params.message);
        if (disconnected && failurePoint === "send") throw new Error("connection lost");
        return true;
      }
      if (method === "runners.poll") {
        polls++;
        assert.equal(params.afterSeq, 0);
        if (disconnected && failurePoint === "poll") throw new Error("connection lost");
        if ((disconnected && failurePoint === "busy") || (failurePoint === "transient-busy" && polls < 3))
          throw new Error("plugin.runners.busy");
        if (disconnected && failurePoint === "notFound") return { events: [], state: { status: "notFound" } };
        return { state: { status: failurePoint === "notFound-done" ? "notFound" : "running" }, events: [
          { seq: 1, message: { type: "response", message: { id: request.id, result: { block: {
            activeSessionId: "remote", run: { id: request.params.input.runId }, messages: [], tasks: [],
          } } } } },
          { seq: 2, message: { type: "event", event: "chat", payload: { runId: request.params.input.runId, type: "done" } } },
        ] };
      }
      throw new Error(`Unexpected ${method}`);
    } };
    const engine = new AiPlugin(host);
    let time = 0;
    engine.observeRunner = createRunnerObserver(host, { now: () => time, wait: async ms => { time += ms; } });
    await engine.command("ai.configure", { config: {
      profiles: [{ id: "main", protocol: "openai-chat", model: "model", helperBinary: "/runner",
        remote: { sessionId: "ssh", platform: "posix", directory: "/runner", executable: "/node" } }],
      scope: { sessionIds: ["ssh"], remoteRoots: [{ sessionId: "ssh", path: "/work" }] },
    } });
    await preparedRuntime(engine);
    await engine.command("ai.send", { message: "hello" });
    await [...engine.runs.values()][0].done;
    if (["transient-busy", "notFound-done"].includes(failurePoint)) {
      assert.equal(engine.block().run.status, "done");
      assert.equal(polls, failurePoint === "transient-busy" ? 3 : 1);
      assert.equal(sends, 1);
      await engine.shutdown();
      return;
    }
    assert.equal(engine.block().run.status, "interrupted");
    assert.ok(engine.block().tasks.some((task) => task.recoverable && task.status === "interrupted"));
    assert.equal(data.get("ai.sessions").sessions[0].run.status, "interrupted");
    assert.equal(polls, failurePoint === "send" ? 0 : failurePoint === "busy" ? 8 : 1);
    disconnected = false;
    await engine.command("ai.recover", { action: "resume" });
    await [...engine.runs.values()][0].done;
    assert.equal(engine.block().run.status, "done");
    assert.equal(sends, 1);
    await engine.shutdown();
  });
}

test("starting another message clears the preceding remote run before persisting", async () => {
  const data = new Map();
  const host = { async call(method, params) {
    if (method === "storage.get") return data.get(params.key) ?? null;
    if (method === "storage.set") { data.set(params.key, structuredClone(params.value)); return null; }
    if (method === "events.publish") return true;
    throw new Error(`Unexpected ${method}`);
  } };
  const engine = new AiPlugin(host);
  await engine.command("ai.configure", { config: {
    profiles: [{ id: "main", protocol: "openai-chat", model: "model", helperBinary: "/runner",
      remote: { sessionId: "ssh", platform: "posix", directory: "/runner", executable: "/node" } }],
    scope: { sessionIds: ["ssh"], remoteRoots: [{ sessionId: "ssh", path: "/work" }] },
  } });
  const session = engine.newSession();
  session.remote = { pluginId: PLUGIN_ID, profilePolicy: structuredClone(PROFILE_POLICY), sessionId: "ssh",
    runnerId: "runner", profileId: "main", revision: engine.configRevision, afterSeq: 9,
    runId: "previous-run", requestId: 42, acknowledged: true };
  session.run = { id: "previous-run", status: "done", profileId: "main", mode: "ask" };
  await preparedRuntime(engine);
  engine.execute = async () => {
    const saved = data.get("ai.sessions").sessions.find((item) => item.id === session.id);
    assert.equal(saved.remote.runId, null);
    assert.equal(saved.remote.requestId, null);
    assert.equal(saved.remote.acknowledged, false);
  };
  await engine.send({ sessionId: session.id, message: "another message" });
  await engine.runs.get(session.id)?.done;
});

test("native runner and real plugin protocol recover a lost enqueue acknowledgement", {
  skip: !process.env.TUNNELDE_TEST_RUNNER,
  timeout: 30000,
}, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tunnelde-runner-integration-"));
  const runner = process.env.TUNNELDE_TEST_RUNNER;
  const id = "recovery-test";
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    req.resume();
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end('data: {"choices":[{"delta":{"content":"recovered answer"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const callRunner = (operation, extra = [], input = null) => new Promise((resolve, reject) => {
    const child = spawn(runner, [operation, "--directory", directory, "--id", id, ...extra], { stdio: "pipe" });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      child.stdout.destroy();
      child.stderr.destroy();
      if (code !== 0) reject(new Error(`runner ${operation} failed: ${stderr}`));
      else {
        try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
      }
    });
    child.stdin.end(input == null ? "" : JSON.stringify(input) + "\n");
  });
  let started = false;
  try {
    const profile = { id: "main", name: "Main", protocol: "openai-chat", model: "test", baseUrl: `http://127.0.0.1:${server.address().port}/v1` };
    const config = { profiles: [profile], activeProfileId: "main", mode: "ask", scope: { localRoots: [directory], sessionIds: [], remoteRoots: [] } };
    const configPath = path.join(directory, "config.json");
    await writeFile(configPath, JSON.stringify({ version: 1, pluginId: PLUGIN_ID, profilePolicy: PROFILE_POLICY, config }));
    await callRunner("start", ["--config", configPath, "--executable", process.execPath, "--entry", path.resolve("plugins/tunnelde-ai/remote-entry.mjs")], { secrets: { "provider.main": "fixture" } });
    started = true;
    const data = new Map();
    let sends = 0, polls = 0;
    const host = { async call(method, params) {
      if (method === "storage.get") return data.get(params.key) ?? null;
      if (method === "storage.set") { data.set(params.key, structuredClone(params.value)); return null; }
      if (method === "events.publish") return true;
      if (method === "runners.send") {
        sends++;
        assert.ok(Number.isSafeInteger(params.message.id));
        await callRunner("send", [], params.message);
        throw new Error("simulated lost acknowledgement");
      }
      if (method === "runners.poll") {
        if (++polls <= 2) throw new Error("plugin.runners.busy");
        return callRunner("poll", ["--after", String(params.afterSeq)]);
      }
      throw new Error(`Unexpected ${method}`);
    } };
    const engine = new AiPlugin(host);
    const session = engine.newSession();
    session.remote = { pluginId: PLUGIN_ID, profilePolicy: structuredClone(PROFILE_POLICY), sessionId: "ssh", runnerId: id,
      profileId: "main", revision: engine.configRevision, afterSeq: 0, runId: null };
    session.run = { id: "run-original", status: "running", seq: 0 };
    const outerProfile = { ...profile, remote: { sessionId: "ssh" } };
    const outerConfig = { scope: { sessionIds: ["ssh"], remoteRoots: [{ sessionId: "ssh", path: directory }] } };
    await assert.rejects(engine.executeRemote(outerProfile, outerConfig, session, "hello", new AbortController().signal, false), /lost acknowledgement/);
    const restarted = new AiPlugin(host);
    await restarted.initialize();
    const restored = restarted.session(session.id);
    await restarted.executeRemote(outerProfile, outerConfig, restored, "ignored", new AbortController().signal, true);
    assert.equal(sends, 1);
    assert.equal(requests, 1);
    assert.ok(polls >= 3);
    assert.ok(restored.history.some((item) => item.content?.includes("recovered answer")));
  } finally {
    if (started) {
      await callRunner("stop").catch(() => {});
      for (let i = 0; i < 50; i++) {
        const status = await callRunner("status").catch(() => null);
        if (["stopped", "failed"].includes(status?.status)) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
