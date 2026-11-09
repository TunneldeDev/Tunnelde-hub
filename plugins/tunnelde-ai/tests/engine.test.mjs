import test from "node:test";
import assert from "node:assert/strict";
import { AiPlugin } from "../lib/engine.mjs";
import { validateConfig } from "../lib/config.mjs";
import { availableTools, invokeTool, hostToolCall } from "../lib/tools.mjs";
import { preparedRuntime } from "./prepared-fixture.mjs";
import { AiPlugin as PiPlugin } from "../../tunnelde-pi/lib/engine.mjs";
import { validateConfig as validatePiConfig } from "../../tunnelde-pi/lib/config.mjs";

const base = {
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
  mode: "ask",
  scope: { localRoots: ["/work"], sessionIds: [], remoteRoots: [] },
};
function hostFixture() {
  const data = new Map(),
    secrets = new Map(),
    calls = [];
  return {
    data,
    secrets,
    calls,
    async call(method, params) {
      calls.push({ method, params: structuredClone(params) });
      if (method === "storage.get")
        return structuredClone(data.get(params.key) ?? null);
      if (method === "storage.set") {
        data.set(params.key, structuredClone(params.value));
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
      if (method === "events.publish") return true;
      if (method === "files.local.home") return "/work";
      if (method === "sessions.list") return [];
      if (method === "tools.invoke")
        return { content: "file", sha256: "a".repeat(64) };
      throw new Error(`Unexpected host method ${method}`);
    },
  };
}
async function prepared(options, Plugin = AiPlugin) {
  const host = hostFixture(),
    engine = new Plugin(host, options);
  if (Plugin === AiPlugin)
    await engine.command("ai.configure", { config: base });
  return { host, engine };
}

test("history actions rename and delete nonactive sessions without switching the running conversation", async () => {
  const { host, engine } = await prepared();
  const other = engine.newSession();
  const active = engine.newSession();
  active.run = { id: "active-run", status: "running", seq: 0 };
  engine.runs.set(active.id, {});
  const renamed = await engine.command("ai.session", {
    action: "rename", sessionId: other.id, title: "  Project notes  ",
  });
  assert.equal(renamed.block.activeSessionId, active.id);
  assert.equal(other.title, "Project notes");
  assert.equal(other.untitled, false);
  assert.equal(renamed.block.sessions.find((item) => item.id === active.id).running, true);
  await assert.rejects(engine.command("ai.session", {
    action: "delete", sessionId: active.id,
  }), /Stop this agent/);
  await engine.command("ai.session", { action: "delete", sessionId: other.id });
  assert.equal(engine.activeSessionId, active.id);
  assert.equal(engine.session(other.id), null);
  assert.equal(host.data.get("ai.sessions").activeSessionId, active.id);
  engine.runs.clear();
  await engine.shutdown();
});

test("untitled metadata survives saving, while explicitly named placeholders remain custom titles", async () => {
  const { host, engine } = await prepared({
    completion: async () => ({ text: "Ready", calls: [] }),
  });
  const session = engine.newSession();
  assert.equal(session.title, "");
  assert.equal(engine.block().sessions[0].untitled, true);
  await engine.command("ai.session", { action: "rename", sessionId: session.id, title: "New conversation" });
  const result = await engine.command("ai.send", { sessionId: session.id, message: "Keep my title" });
  await engine.runs.get(result.block.activeSessionId).done;
  assert.equal(session.title, "New conversation");
  await engine.shutdown();
  const restored = new AiPlugin(host);
  await restored.initialize();
  assert.equal(restored.session().title, "New conversation");
  assert.equal(restored.session().untitled, false);
  await restored.shutdown();
});

test("legacy placeholders are localized only for conversations without user messages", async () => {
  const { host, engine } = await prepared();
  const placeholder = engine.newSession();
  const named = engine.newSession();
  placeholder.title = named.title = "New conversation";
  delete placeholder.untitled;
  delete named.untitled;
  named.history = [{ id: "user-one", role: "user", content: "New conversation" }];
  await engine.persist();
  const restored = new AiPlugin(host);
  await restored.initialize();
  assert.equal(restored.session(placeholder.id).untitled, true);
  assert.equal(restored.session(named.id).untitled, false);
  const titleBefore = restored.session(named.id).title;
  await assert.rejects(restored.command("ai.session", { action: "rename", sessionId: named.id, title: "  " }), /Invalid conversation title/);
  assert.equal(restored.session(named.id).title, titleBefore);
  await engine.shutdown();
  await restored.shutdown();
});
test("configuration never serializes credentials and blank keys preserve", async () => {
  const { host, engine } = await prepared();
  await engine.command("ai.configure", {
    config: {
      ...base,
      profiles: [{ ...base.profiles[0], apiKey: "super-secret-key" }],
    },
  });
  await engine.command("ai.configure", {
    config: { ...base, profiles: [{ ...base.profiles[0], apiKey: "" }] },
  });
  assert.equal(host.secrets.get("provider.main"), "super-secret-key");
  assert.ok(!JSON.stringify([...host.data]).includes("super-secret-key"));
  assert.ok(!JSON.stringify(engine.block()).includes("super-secret-key"));
  assert.equal(engine.block().config.profiles[0].hasApiKey, true);
  await engine.command("ai.configure", {
    config: {
      ...base,
      profiles: [{ ...base.profiles[0], baseUrl: "https://other.example/v1" }],
    },
  });
  assert.equal(host.secrets.has("provider.main"), false);
});
test("render/import/configuration never launches a process", async () => {
  const { host, engine } = await prepared();
  await import("../index.mjs");
  await engine.render();
  assert.equal(
    host.calls.some((item) => /tasks.start|runners.start/.test(item.method)),
    false,
  );
});

test("reasoning is separate from the reply, bounded, streamed and persisted", async () => {
  const { host, engine } = await prepared({
    completion: async ({ onReasoning, onDelta }) => {
      onReasoning("Checking the selected machine");
      onDelta("Final answer");
      return { text: "Final answer", calls: [] };
    },
  });
  const result = await engine.command("ai.send", { message: "inspect" });
  await engine.runs.get(result.block.activeSessionId).done;
  const reply = engine
    .block()
    .messages.find((item) => item.role === "assistant");
  assert.equal(reply.content, "Final answer");
  assert.equal(reply.activity[0].kind, "reasoning");
  assert.equal(reply.activity[0].status, "done");
  assert.ok(
    host.calls.some(
      (item) =>
        item.method === "events.publish" &&
        item.params.payload.type === "activity",
    ),
  );
  await engine.shutdown();
});

test("aborting a tool cancels the host approval with the same request ID", async () => {
  const controller = new AbortController();
  const calls = [];
  const host = {
    call(method, params, options) {
      calls.push({ method, params });
      if (method === "tools.invoke")
        return new Promise((_, reject) =>
          options.signal.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true },
          ),
        );
      return Promise.resolve(true);
    },
  };
  const operation = hostToolCall(
    host,
    { method: "files.local.readText", params: { path: "/work/a" } },
    controller.signal,
  );
  controller.abort();
  await assert.rejects(operation, /cancelled/);
  const requestId = calls.find((item) => item.method === "tools.invoke").params
    .requestId;
  assert.ok(
    calls.some(
      (item) =>
        item.method === "tools.cancel" && item.params.requestId === requestId,
    ),
  );
});
test("send returns immediately, honors run IDs, streams and persists final result", async () => {
  let resolve;
  const { host, engine } = await prepared({
    completion: async ({ onDelta }) => {
      await new Promise((done) => {
        resolve = done;
      });
      onDelta("你好");
      return { text: "你好", calls: [] };
    },
  });
  const result = await engine.command("ai.send", {
    message: "hello",
    runId: "client-run",
  });
  assert.equal(result.runId, "client-run");
  assert.equal(result.block.run.status, "running");
  const done = engine.runs.get(result.block.activeSessionId).done;
  while (!resolve) await new Promise((r) => setImmediate(r));
  resolve();
  await done;
  assert.equal(engine.block().run.status, "done");
  assert.ok(
    host.calls.some(
      (item) =>
        item.method === "events.publish" &&
        item.params.payload.type === "delta" &&
        item.params.payload.runId === "client-run",
    ),
  );
  await engine.shutdown();
});
test("tool loop keeps gate mode and includes read hash for concurrent write protection", async () => {
  let turn = 0;
  const { host, engine } = await prepared({
    completion: async () => {
      turn++;
      return {
        text: "",
        calls:
          turn === 1
            ? [
                {
                  id: "read",
                  name: "read_file",
                  arguments: { path: "/work/a" },
                },
              ]
            : turn === 2
              ? [
                  {
                    id: "write",
                    name: "write_file",
                    arguments: {
                      path: "/work/a",
                      content: " keep whitespace \n",
                    },
                  },
                ]
              : [],
      };
    },
  });
  await engine.command("ai.send", { message: "edit" });
  await [...engine.runs.values()][0].done;
  const actions = host.calls.filter((item) => item.method === "tools.invoke");
  assert.equal(actions.length, 2);
  assert.equal(actions[1].params.mode, "ask");
  assert.equal(actions[1].params.params.expectedHash, "a".repeat(64));
  assert.equal(actions[1].params.params.content, " keep whitespace \n");
  await engine.shutdown();
});
test("readOnly model cannot invoke write or shell even if it fabricates calls", async () => {
  assert.deepEqual(
    availableTools("readOnly").map((item) => item.name),
    [
      "workspace_context",
      "list_sessions",
      "list_hosts",
      "list_directory",
      "read_file",
    ],
  );
  const host = hostFixture();
  await assert.rejects(
    invokeTool(
      host,
      { ...base, mode: "readOnly" },
      { name: "run_command", arguments: {} },
    ),
    /ReadOnly/,
  );
  assert.equal(host.calls.length, 0);
});
test("failed independent review passes false to host for human fallback", async () => {
  let turn = 0;
  const { host, engine } = await prepared({
    completion: async ({ profile }) => {
      if (profile.id === "reviewer") throw new Error("offline");
      return {
        text: "",
        calls:
          ++turn === 1
            ? [
                {
                  id: "write",
                  name: "create_file",
                  arguments: { path: "/work/a" },
                },
              ]
            : [],
      };
    },
  });
  await engine.command("ai.configure", {
    config: {
      ...base,
      mode: "approve",
      approverProfileId: "reviewer",
      profiles: [
        ...base.profiles,
        { ...base.profiles[0], id: "reviewer", model: "review-model" },
      ],
    },
  });
  await engine.command("ai.send", { message: "create" });
  await [...engine.runs.values()][0].done;
  const action = host.calls.find((item) => item.method === "tools.invoke");
  assert.equal(action.params.mode, "approve");
  assert.equal(action.params.review.approved, false);
  await engine.shutdown();
});
test("stopping cancels a pending inline approval without executing", async () => {
  const { engine } = await prepared(
    {
      cli: async ({ approve }) => {
        assert.equal(
          await approve({ tool: "write", title: "Write", detail: "file" }),
          false,
        );
      },
    },
    PiPlugin,
  );
  await engine.command("ai.configure", {
    config: {
      ...base,
      profiles: [
        { id: "main", protocol: "pi", executable: "/bin/pi", cwd: "/work" },
      ],
    },
  });
  await preparedRuntime(engine);
  await engine.command("ai.send", { message: "hello" });
  while (!engine.approvals.size) await new Promise((r) => setImmediate(r));
  await engine.command("ai.stop", {});
  assert.equal(engine.approvals.size, 0);
  assert.equal(engine.block().run.status, "cancelled");
  await engine.shutdown();
});
test("saved running sessions become interrupted and inspect never replays tools", async () => {
  const host = hostFixture();
  host.data.set("ai.sessions", {
    version: 1,
    activeSessionId: "s",
    sessions: [
      {
        id: "s",
        title: "Saved",
        history: [],
        tasks: [{ id: "old", status: "running" }],
        run: { id: "r", status: "running" },
      },
    ],
  });
  const engine = new AiPlugin(host);
  await engine.initialize();
  assert.equal(engine.block().run.status, "interrupted");
  assert.equal(engine.block().tasks[0].recoverable, false);
  await engine.command("ai.recover", { action: "inspect" });
  assert.ok(
    !host.calls.some((item) => /tools.invoke|tasks.start/.test(item.method)),
  );
});
test("recovering an API conversation without a durable run preserves history and does not replay", async () => {
  const { host, engine } = await prepared();
  const session = engine.newSession();
  session.history = [{ id: "user", role: "user", content: "Original request" }];
  session.run = { id: "old", status: "interrupted", profileId: "main", mode: "ask" };
  const before = structuredClone(session);
  await assert.rejects(engine.command("ai.recover", { action: "resume", sessionId: session.id }), /cannot be reconnected/);
  assert.deepEqual(session, before);
  assert.ok(!host.calls.some((item) => /tasks.start|runners.send|runners.deploy/.test(item.method)));
  await engine.shutdown();
});

test("historical CLI task recovery cannot inspect or resume a later process", async () => {
  const { host, engine } = await prepared(undefined, PiPlugin);
  await engine.initialize();
  const session = engine.newSession();
  session.run = { id: "new-run", status: "failed", profileId: "default", mode: "ask" };
  session.cli = { taskId: "new-process", protocol: "pi" };
  session.tasks = [
    { id: "old-process", status: "failed", recoverable: true, runId: "old-run" },
    { id: "new-process", status: "failed", recoverable: true, runId: "new-run" },
  ];
  const before = structuredClone(session);
  const calls = host.calls.length;
  for (const action of ["inspect", "resume"])
    await assert.rejects(engine.command("ai.recover", {
      action, sessionId: session.id, taskId: "old-process", taskRunId: "old-run", runId: "new-run",
    }), /no longer.*recover|different.*run/i);
  assert.deepEqual(session, before);
  assert.equal(host.calls.length, calls);
  assert.equal(engine.block().tasks[0].recoverable, false);
  assert.equal(engine.block().tasks[1].recoverable, true);
  await engine.shutdown();
});

test("task recovery rejects stale conversation and runner generations before host access", async () => {
  const { host, engine } = await prepared();
  const session = engine.newSession();
  engine.config.profiles[0].remote = { sessionId: "ssh", platform: "posix" };
  session.remote = { runnerId: "same-runner", profileId: "main", sessionId: "ssh", runId: "new-run" };
  session.run = { id: "new-run", status: "interrupted", profileId: "main", mode: "ask" };
  session.tasks = [{ id: "same-runner", runId: "new-run", status: "interrupted", recoverable: true }];
  const before = structuredClone(session), calls = host.calls.length;
  for (const action of ["inspect", "resume"]) {
    for (const identity of [{ runId: "old-run" }, { runId: "new-run", taskRunId: "old-run" }])
      await assert.rejects(engine.command("ai.recover", {
        action, sessionId: session.id, taskId: "same-runner", ...identity,
      }), /different.*run|no longer.*recover/i);
  }
  assert.deepEqual(session, before);
  assert.equal(host.calls.length, calls);
  await engine.shutdown();
});

test("inspecting the current interrupted task uses its original process without sending", async () => {
  const { host, engine } = await prepared(undefined, PiPlugin);
  await engine.initialize();
  const session = engine.newSession();
  session.run = { id: "run", status: "interrupted", profileId: "default", mode: "ask" };
  session.cli = { taskId: "original-process", protocol: "pi" };
  session.tasks = [{ id: "original-process", status: "interrupted", recoverable: true, output: "Saved agent output" }];
  const call = host.call.bind(host);
  host.call = async (method, params) => {
    if (method === "tasks.status") {
      assert.equal(params.taskId, "original-process");
      return { status: "completed", exitCode: 0 };
    }
    return call(method, params);
  };
  const result = await engine.command("ai.recover", {
    action: "inspect", sessionId: session.id, taskId: "original-process", runId: "run",
  });
  assert.equal(result.status.status, "completed");
  assert.equal(result.saved.taskId, "original-process");
  assert.equal(result.block.tasks[0].recoverable, true);
  assert.match(result.block.tasks[0].inspection, /Status: completed\nExit code: 0/);
  assert.equal(result.block.tasks[0].output, "Saved agent output");
  assert.ok(!host.calls.some(item => /tasks.start|tasks.write|runners.send/.test(item.method)));
  host.call = async (method, params) => {
    if (method === "tasks.status") throw new Error("plugin.permissionDenied");
    return call(method, params);
  };
  const inspection = result.block.tasks[0].inspection;
  await assert.rejects(engine.command("ai.recover", {
    action: "inspect", sessionId: session.id, taskId: "original-process", runId: "run",
  }), /plugin.permissionDenied/);
  assert.equal(session.tasks[0].inspection, inspection);
  await engine.shutdown();
});

test("remote recovery without the original run never deploys or sends", async () => {
  const { host, engine } = await prepared();
  const session = engine.newSession();
  session.remote = { runnerId: "runner", runId: null };
  await assert.rejects(engine.executeRemote({ remote: {} }, {}, session, "ignored", new AbortController().signal, true), /cannot be identified/);
  assert.ok(!host.calls.some((item) => /runners.send|runners.deploy|runners.start/.test(item.method)));
  await engine.shutdown();
});
test("config rejects insecure endpoints, duplicate profile IDs and implicit CLI executable", () => {
  assert.throws(
    () =>
      validateConfig({
        ...base,
        profiles: [{ ...base.profiles[0], baseUrl: "http://remote.example" }],
      }),
    /Plain HTTP/,
  );
  assert.throws(
    () =>
      validateConfig({
        ...base,
        profiles: [...base.profiles, ...base.profiles],
      }),
    /unique/,
  );
  assert.throws(
    () =>
      validatePiConfig({ ...base, profiles: [{ id: "main", protocol: "pi" }] }),
    /executable/,
  );
});
