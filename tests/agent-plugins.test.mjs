import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";
import {
  AGENT_PACKAGES,
  syncAgentPlugins,
} from "../scripts/sync-agent-plugins.mjs";
import { buildPluginArchive } from "../scripts/plugins/package.mjs";

const root = path.resolve(import.meta.dirname, "..");
const apis = ["openai-chat", "openai-responses", "anthropic", "gemini"];
const stores = () => ({ storage: new Map(), secrets: new Map(), calls: [] });
function fixture(pluginId, state = stores()) {
  return {
    state,
    async call(method, params) {
      state.calls.push({ pluginId, method, params: structuredClone(params) });
      const key = `${pluginId}:${params.key}`;
      if (method === "storage.get")
        return structuredClone(state.storage.get(key) ?? null);
      if (method === "storage.set") {
        state.storage.set(key, structuredClone(params.value));
        return null;
      }
      if (method === "secrets.get") return state.secrets.get(key) ?? null;
      if (method === "secrets.set") {
        state.secrets.set(key, params.value);
        return null;
      }
      if (method === "secrets.delete") {
        state.secrets.delete(key);
        return null;
      }
      if (method === "events.publish") return null;
      throw new Error(`Unexpected host call: ${method}`);
    },
  };
}
const profile = (protocol) =>
  protocol === "codex" || protocol === "claude-code" || protocol === "pi"
    ? {
        id: "main",
        name: "Main",
        protocol,
        executable: "/explicit/vendor-cli",
        cwd: "/work",
      }
    : {
        id: "main",
        name: "Main",
        protocol,
        model: "model",
        baseUrl: "https://example.com/v1",
      };
const reviewer = {
  id: "reviewer",
  name: "Reviewer",
  protocol: "openai-chat",
  model: "review-model",
  baseUrl: "https://review.example/v1",
  apiKey: "explicit-review-secret",
};
const configFor = (agent) => ({
  profiles: [profile(agent.defaultProtocol), reviewer],
  activeProfileId: "main",
  approverProfileId: "reviewer",
  mode: "ask",
  scope: { localRoots: ["/work"], sessionIds: [], remoteRoots: [] },
});
const engineFor = async (agent) =>
  (
    await import(
      pathToFileURL(path.join(root, "plugins", agent.id, "lib/engine.mjs"))
    )
  ).AiPlugin;

test("independent package runtime sources remain synchronized", async () => {
  assert.deepEqual(await syncAgentPlugins(), []);
});

for (const agent of AGENT_PACKAGES) {
  test(`${agent.title}: fixed identity, primary protocol, reviewer isolation and no automatic process launch`, async () => {
    const Engine = await engineFor(agent),
      host = fixture(agent.id),
      engine = new Engine(host);
    const initial = await engine.render();
    assert.equal(initial.title, agent.title);
    assert.equal(initial.blocks[0].title, agent.title);
    assert.equal(
      initial.blocks[0].profilePolicy.defaultProtocol,
      agent.defaultProtocol,
    );
    await engine.configure({ config: configFor(agent) });
    const block = engine.block();
    assert.deepEqual(
      block.profilePolicy.primaryProtocols,
      agent.primaryProtocols,
    );
    assert.deepEqual(block.profilePolicy.reviewerProtocols, apis);
    assert.deepEqual(
      block.models.map((item) => item.id),
      agent.id === "tunnelde-ai" ? ["main", "reviewer"] : ["main"],
    );
    if (agent.id !== "tunnelde-ai") {
      await assert.rejects(
        engine.send({ message: "invalid", modelId: "reviewer" }),
        /only review/,
      );
      await assert.rejects(
        engine.configure({
          config: { ...configFor(agent), activeProfileId: "reviewer" },
        }),
        /primary profile/,
      );
    }
    const alien = agent.defaultProtocol === "codex" ? "pi" : "codex";
    await assert.rejects(
      engine.configure({
        config: { ...configFor(agent), profiles: [profile(alien)] },
      }),
      /Unsupported provider/,
    );
    const saved = host.state.storage.get(`${agent.id}:ai.config`);
    assert.equal(saved.pluginId, agent.id);
    assert.deepEqual(
      saved.profilePolicy.primaryProtocols,
      agent.primaryProtocols,
    );
    assert.ok(!JSON.stringify(saved).includes("explicit-review-secret"));
    assert.ok(
      !host.state.calls.some((call) => /tasks\.|runners\./.test(call.method)),
    );
    await engine.shutdown();
  });

  test(`${agent.title}: illegal persisted protocols and another package identity cannot be loaded or executed`, async () => {
    const Engine = await engineFor(agent),
      host = fixture(agent.id);
    const invalid =
      agent.id === "tunnelde-ai"
        ? "not-a-protocol"
        : agent.defaultProtocol === "codex"
          ? "pi"
          : "codex";
    host.state.storage.set(`${agent.id}:ai.config`, {
      config: { ...configFor(agent), profiles: [profile(invalid)] },
    });
    await assert.rejects(new Engine(host).initialize(), /Unsupported provider/);
    host.state.storage.set(`${agent.id}:ai.config`, {
      pluginId: "different-plugin",
      config: configFor(agent),
    });
    await assert.rejects(new Engine(host).initialize(), /different plugin/);
    host.state.storage.clear();
    const engine = new Engine(host);
    await engine.command("ai.configure", { config: configFor(agent) });
    engine.config.profiles[0].protocol = invalid;
    await assert.rejects(
      engine.send({ message: "tampered" }),
      /Unsupported provider/,
    );
    assert.ok(
      !host.state.calls.some((call) => /tasks\.|runners\./.test(call.method)),
    );
    await engine.shutdown();
  });
}

test("each assistant owns its configuration, secrets and conversations across shutdown/restart", async () => {
  const state = stores(),
    instances = [];
  for (const agent of AGENT_PACKAGES) {
    const Engine = await engineFor(agent),
      host = fixture(agent.id, state),
      engine = new Engine(host);
    await engine.command("ai.configure", { config: configFor(agent) });
    await engine.command("ai.session", { action: "new" });
    engine.session().title = `${agent.title} private conversation`;
    await engine.persist();
    instances.push({ agent, Engine, host, engine });
  }
  await instances[1].engine.shutdown();
  for (const item of instances) {
    const restored = new item.Engine(item.host);
    await restored.initialize();
    assert.equal(
      restored.block().sessions[0].title,
      `${item.agent.title} private conversation`,
    );
    assert.equal(
      restored.config.profiles[0].protocol,
      item.agent.defaultProtocol,
    );
    assert.equal(
      state.secrets.get(`${item.agent.id}:provider.reviewer`),
      "explicit-review-secret",
    );
    await restored.shutdown();
    if (item !== instances[1]) await item.engine.shutdown();
  }
  assert.equal(state.storage.size, AGENT_PACKAGES.length * 2);
});

test("API assistant preserves old CLI settings and conversations until an explicit save archives them", async () => {
  const agent = AGENT_PACKAGES[0],
    Engine = await engineFor(agent),
    host = fixture(agent.id);
  const legacy = {
    config: { ...configFor(agent), profiles: [profile("codex"), reviewer] },
    keyIds: ["reviewer"],
  };
  host.state.storage.set(`${agent.id}:ai.config`, structuredClone(legacy));
  host.state.storage.set(`${agent.id}:ai.sessions`, {
    version: 1,
    activeSessionId: "old",
    sessions: [{ id: "old", title: "Prior work", history: [], tasks: [] }],
  });
  host.state.secrets.set(`${agent.id}:provider.reviewer`, "old-credential");
  const engine = new Engine(host);
  await engine.initialize();
  assert.match(engine.block().notice, /separate Codex, Claude Code and Pi/);
  assert.deepEqual(
    engine.config.profiles.map((item) => item.protocol),
    ["openai-chat"],
  );
  assert.equal(engine.block().sessions[0].title, "Prior work");
  assert.deepEqual(host.state.storage.get(`${agent.id}:ai.config`), legacy);
  assert.equal(
    host.state.storage.has(`${agent.id}:ai.legacy-config.v1`),
    false,
  );
  await engine.configure({
    config: {
      ...configFor(agent),
      profiles: [profile("openai-chat")],
      approverProfileId: "",
    },
  });
  assert.deepEqual(
    host.state.storage.get(`${agent.id}:ai.legacy-config.v1`),
    legacy,
  );
  assert.ok(!host.state.secrets.has("tunnelde-codex:provider.reviewer"));
  assert.ok(
    !host.state.calls.some((call) => /tasks\.|runners\./.test(call.method)),
  );
  await engine.shutdown();
});

function unpack(bytes) {
  const files = new Map();
  for (let offset = 0; bytes.readUInt32LE(offset) === 0x04034b50;) {
    const size = bytes.readUInt32LE(offset + 18),
      length = bytes.readUInt16LE(offset + 26),
      extra = bytes.readUInt16LE(offset + 28);
    const name = bytes
        .subarray(offset + 30, offset + 30 + length)
        .toString("utf8"),
      start = offset + 30 + length + extra;
    files.set(name, inflateRawSync(bytes.subarray(start, start + size)));
    offset = start + size;
  }
  return files;
}

test("standalone archives contain complete runtimes and preserve identity without sibling plugin dependencies", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "tunnelde-independent-plugins-"),
  );
  try {
    for (const agent of AGENT_PACKAGES) {
      const files = unpack(
        await buildPluginArchive(path.join(root, "plugins", agent.id)),
      );
      const manifest = JSON.parse(files.get("tunnelde-plugin.json"));
      assert.equal(manifest.id, agent.id);
      assert.equal(manifest.name, agent.title);
      assert.equal(manifest.version, "1.3.0");
      assert.equal(manifest.engines.tunnelde, ">=0.25.0");
      assert.equal(manifest.views[0].title, agent.title);
      for (const required of [
        "README.md",
        "LICENSE",
        "index.mjs",
        "remote-entry.mjs",
        "stdio-entry.mjs",
        "lib/targets.mjs",
        "lib/remote-stdio.mjs",
        "lib/engine.mjs",
        "lib/config.mjs",
        "lib/identity.mjs",
        "lib/pi-permissions.mjs",
      ])
        assert.ok(files.has(required), `${agent.id}: ${required}`);
      const target = path.join(directory, agent.id);
      for (const [name, data] of files) {
        await mkdir(path.dirname(path.join(target, name)), { recursive: true });
        await writeFile(path.join(target, name), data);
      }
      const { AiPlugin } = await import(
        pathToFileURL(path.join(target, "lib/engine.mjs"))
      );
      await import(pathToFileURL(path.join(target, "index.mjs")));
      await import(pathToFileURL(path.join(target, "remote-entry.mjs")));
      const engine = new AiPlugin(fixture(agent.id));
      assert.equal((await engine.render()).blocks[0].title, agent.title);
      await engine.shutdown();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("remote entry refuses a different package identity or a broadened protocol policy before transport startup", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "tunnelde-agent-policy-"),
  );
  try {
    for (const agent of AGENT_PACKAGES) {
      const { startRemote } = await import(
        pathToFileURL(path.join(root, "plugins", agent.id, "remote-entry.mjs"))
      );
      const file = path.join(directory, "config.json");
      const document = {
        version: 1,
        pluginId: "different-plugin",
        profilePolicy: {
          primaryProtocols: agent.primaryProtocols,
          reviewerProtocols: apis,
          defaultProtocol: agent.defaultProtocol,
        },
        config: configFor(agent),
      };
      await writeFile(file, JSON.stringify(document));
      await assert.rejects(startRemote(["--config", file]), /different plugin/);
      document.pluginId = agent.id;
      document.profilePolicy.primaryProtocols = [
        ...agent.primaryProtocols,
        "unsupported-protocol",
      ];
      await writeFile(file, JSON.stringify(document));
      await assert.rejects(startRemote(["--config", file]), /profile policy/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
