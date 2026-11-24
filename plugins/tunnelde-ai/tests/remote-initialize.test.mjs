import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { startRemote } from "../remote-entry.mjs";
import { initializedConfiguration } from "../lib/remote-bootstrap.mjs";
import { PLUGIN_ID, PROFILE_POLICY } from "../lib/identity.mjs";
import { AiPlugin } from "../lib/engine.mjs";

const document = () => ({ version: 1, pluginId: PLUGIN_ID, profilePolicy: structuredClone(PROFILE_POLICY),
  config: { profiles: [{ id: "main", protocol: "openai-chat", model: "model", baseUrl: "https://example.com/v1" }],
    activeProfileId: "main", scope: { localRoots: [process.cwd()] } } });
const initial = () => ({ remote: true, configurationTransport: "initialize-v1", configuration: document(),
  secrets: { "provider.main": "private-initialized-secret" } });

test("initialized child rejects incompatible identity, recursive scope and invalid credentials", () => {
  assert.equal(initializedConfiguration(initial()).config.profiles[0].id, "main");
  const cases = [
    { ...initial(), configurationTransport: "file" },
    { ...initial(), secrets: { token: true } },
    { ...initial(), secrets: { token: "x".repeat(256 * 1024) } },
  ];
  for (const mutate of [
    value => { value.configuration.pluginId = "other-plugin"; },
    value => { value.configuration.profilePolicy.defaultProtocol = "other"; },
    value => { value.configuration.secretEnv = { main: "HOME" }; },
    value => { value.configuration.config.profiles[0].sessionId = "unexpected-ssh"; },
    value => { value.configuration.large = "x".repeat(200 * 1024); },
  ]) { const value = initial(); mutate(value); cases.push(value); }
  for (const value of cases) assert.throws(() => initializedConfiguration(value), error => {
    assert(!error.message.includes("private-initialized-secret")); return true;
  });
});

test("initialized remote entry waits for configuration and uses ephemeral secrets without a file", async () => {
  const input = new PassThrough(), output = new PassThrough(), pending = new Map(), calls = [];
  let sequence = 100, buffer = "";
  output.on("data", chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      if (message.method) {
        calls.push(message);
        input.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: null }) + "\n");
      } else { pending.get(message.id)?.(message); pending.delete(message.id); }
    }
  });
  const request = (method, params) => new Promise(resolve => {
    const id = ++sequence; pending.set(id, resolve);
    input.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  const client = await startRemote(["--initialize-config"], { input, output });
  try {
    assert.equal(calls.length, 0);
    const early = await request("view.render", { view: "chat", locale: "en" });
    assert.match(early.error.message, /not been initialized/);
    assert.equal(calls.length, 0);
    const initialized = await request("initialize", initial());
    assert.equal(initialized.error, undefined);
    const view = await request("view.render", { view: "chat", locale: "en" });
    assert.equal(view.result.blocks[0].config.profiles[0].hasApiKey, true);
    assert(!JSON.stringify(view).includes("private-initialized-secret"));
    const repeated = await request("initialize", initial());
    assert.match(repeated.error.message, /already initialized/);
    assert(!calls.some(call => call.method === "storage.set" && call.params.key === "ai.config"));
    await request("shutdown", {});
  } finally { client.close(); input.destroy(); output.destroy(); }
});

test("initialized child cannot silently select the file transport", async () => {
  await assert.rejects(startRemote(["--initialize-config", "--config", "/private/config.json"]), /does not accept/);
});

test("unsupported hosts fail before remote deployment and never use runners.start", async () => {
  const calls = [], engine = new AiPlugin({ async call(method) {
    calls.push(method);
    if (method === "api.describe") return { methods: [{ name: "runners.start" }] };
    throw new Error(`Unexpected ${method}`);
  } });
  const profile = { id: "main", remote: { sessionId: "ssh" } };
  const config = { scope: { sessionIds: ["ssh"], remoteRoots: [{ sessionId: "ssh", path: "/work" }] } };
  await assert.rejects(engine.executeRemote(profile, config, {}, "hello", new AbortController().signal, false), /Update Tunnelde/);
  assert.deepEqual(calls, ["api.describe"]);
});

for (const stage of ["api.describe", "runners.deploy", "secrets.get", "runners.startInitialized", "persist", "request-persist"])
  test(`cancelling during ${stage} never sends a message and stops an acknowledged new runner`, async () => {
    const controller = new AbortController(), calls = [];
    const host = { async call(method) {
      calls.push(method);
      if (method === stage) controller.abort(new Error(`Cancelled during ${stage}`));
      if (method === "api.describe") return { methods: [{ name: "runners.startInitialized" }] };
      if (method === "runners.deploy") return { deployed: true };
      if (method === "secrets.get") return "private-initialized-secret";
      if (method === "runners.startInitialized") return { runnerId: "runner", status: "starting" };
      if (method === "runners.stop") return { stopRequested: true };
      throw new Error(`Unexpected ${method}`);
    } };
    const engine = new AiPlugin(host);
    let saves = 0;
    engine.persist = async () => {
      saves++;
      if ((stage === "persist" && saves === 1) || (stage === "request-persist" && saves === 2))
        controller.abort(new Error(`Cancelled during ${stage}`));
    };
    const profile = { id: "main", protocol: "openai-chat", model: "model", remote: { sessionId: "ssh", directory: "/runner" } };
    const config = { profiles: [profile], scope: { sessionIds: ["ssh"], remoteRoots: [{ sessionId: "ssh", path: "/work" }] } };
    const session = { run: { id: "run" }, tasks: [] };
    await assert.rejects(engine.executeRemote(profile, config, session, "hello", controller.signal, false), /Cancelled during/);
    assert(!calls.includes("runners.send"));
    assert.equal(calls.filter(method => method === "runners.stop").length,
      ["runners.startInitialized", "persist", "request-persist"].includes(stage) ? 1 : 0);
    if (stage === "api.describe") assert.deepEqual(calls, ["api.describe"]);
  });
