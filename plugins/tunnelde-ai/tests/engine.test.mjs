import test from "node:test";
import assert from "node:assert/strict";
import { AiPlugin } from "../lib/engine.mjs";
import { validateConfig } from "../lib/config.mjs";
import { availableTools, invokeTool } from "../lib/tools.mjs";
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
      if (method === "storage.get") return structuredClone(data.get(params.key) ?? null);
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
      if (method === "tools.invoke") return { content: "file", sha256: "a".repeat(64) };
      throw new Error(`Unexpected host method ${method}`);
    },
  };
}
async function prepared(options, Plugin = AiPlugin) {
  const host = hostFixture(),
    engine = new Plugin(host, options);
  if (Plugin === AiPlugin) await engine.command("ai.configure", { config: base });
  return { host, engine };
}
test("configuration never serializes credentials and blank keys preserve", async () => {
  const { host, engine } = await prepared();
  await engine.command("ai.configure", {
    config: { ...base, profiles: [{ ...base.profiles[0], apiKey: "super-secret-key" }] },
  });
  await engine.command("ai.configure", {
    config: { ...base, profiles: [{ ...base.profiles[0], apiKey: "" }] },
  });
  assert.equal(host.secrets.get("provider.main"), "super-secret-key");
  assert.ok(!JSON.stringify([...host.data]).includes("super-secret-key"));
  assert.ok(!JSON.stringify(engine.block()).includes("super-secret-key"));
  assert.equal(engine.block().config.profiles[0].hasApiKey, true);
  await engine.command("ai.configure", {
    config: { ...base, profiles: [{ ...base.profiles[0], baseUrl: "https://other.example/v1" }] },
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
  const result = await engine.command("ai.send", { message: "hello", runId: "client-run" });
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
            ? [{ id: "read", name: "read_file", arguments: { path: "/work/a" } }]
            : turn === 2
              ? [
                  {
                    id: "write",
                    name: "write_file",
                    arguments: { path: "/work/a", content: " keep whitespace \n" },
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
    ["list_directory", "read_file"],
  );
  const host = hostFixture();
  await assert.rejects(
    invokeTool(host, { ...base, mode: "readOnly" }, { name: "run_command", arguments: {} }),
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
            ? [{ id: "write", name: "create_file", arguments: { path: "/work/a" } }]
            : [],
      };
    },
  });
  await engine.command("ai.configure", {
    config: {
      ...base,
      mode: "approve",
      approverProfileId: "reviewer",
      profiles: [...base.profiles, { ...base.profiles[0], id: "reviewer", model: "review-model" }],
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
        assert.equal(await approve({ tool: "write", title: "Write", detail: "file" }), false);
      },
    },
    PiPlugin,
  );
  await engine.command("ai.configure", {
    config: {
      ...base,
      profiles: [{ id: "main", protocol: "pi", executable: "/bin/pi", cwd: "/work" }],
    },
  });
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
  assert.equal(engine.block().tasks[0].recoverable, true);
  await engine.command("ai.recover", { action: "inspect" });
  assert.ok(!host.calls.some((item) => /tools.invoke|tasks.start/.test(item.method)));
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
    () => validateConfig({ ...base, profiles: [...base.profiles, ...base.profiles] }),
    /unique/,
  );
  assert.throws(
    () => validatePiConfig({ ...base, profiles: [{ id: "main", protocol: "pi" }] }),
    /executable/,
  );
});
