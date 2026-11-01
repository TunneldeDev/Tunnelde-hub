import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPlugin } from "../lib/sdk.mjs";
import { startRemote } from "../remote-entry.mjs";
import { AiPlugin } from "../lib/engine.mjs";
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
                      run: { id: "remote-run" },
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
