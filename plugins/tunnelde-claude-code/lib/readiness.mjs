import path from "node:path";
import { TaskConnection, cliArguments } from "./cli.mjs";
import { CLI_PROTOCOLS } from "./config.mjs";
import { delay } from "./tools.mjs";
import { deployFiles, runtimeFiles } from "./deployment.mjs";
import { PLUGIN_ID } from "./identity.mjs";

export function preparationKey(profile, execution, revision) {
  return JSON.stringify({ profile, execution, revision });
}
export const executionKey = (execution) => JSON.stringify([
  execution?.kind || "local", execution?.sessionId || "", execution?.hostId || "",
  execution?.cwd || "", execution?.runtime || "", execution?.executable || "",
]);

function preparationTimeout(executable, execution, timeoutMs) {
  const target = execution.kind === "remote" ? "the selected remote host" : "this computer";
  return Object.assign(new Error(`${executable} did not respond within ${Math.ceil(timeoutMs / 1000)} seconds on ${target}. Check the executable, connection and host load, then retry.`), { code: "agent.prepare.timeout" });
}

/** Finite checks run only from an explicit preparation action, never on render. */
export async function checkedTask(host, execution, executable, args, timeoutMs = 30000, signal) {
  signal?.throwIfAborted();
  const started = await host.call("tasks.start", {
    executable, args, cwd: execution.cwd,
    ...(execution.kind === "remote" ? { sessionId: execution.sessionId, platform: execution.platform } : {}),
    timeoutMs,
  }, { signal });
  const taskId = typeof started === "string" ? started : started?.taskId;
  if (!taskId) throw new Error("Initialization did not return a process ID");
  let afterSeq = 0, stdout = "", stderr = "";
  const end = Date.now() + timeoutMs;
  try {
    while (Date.now() < end) {
      signal?.throwIfAborted();
      const output = await host.call("tasks.readOutput", { taskId, afterSeq }, { signal });
      if (output?.truncated) throw new Error("Initialization output exceeded its limit");
      for (const event of output?.events ?? []) {
        afterSeq = Math.max(afterSeq, event.seq ?? 0);
        if (event.stream === "stdout") stdout += event.data || "";
        if (event.stream === "stderr") stderr += event.data || "";
      }
      if (stdout.length + stderr.length > 64000) throw new Error("Initialization output exceeded its limit");
      const status = await host.call("tasks.status", { taskId }, { signal });
      if (!status) throw new Error("Initialization process disappeared");
      if (!["starting", "running"].includes(status.status)) {
        // Drain output once more: the process can exit between the first read and status.
        const tail = await host.call("tasks.readOutput", { taskId, afterSeq }, { signal });
        if (tail?.truncated) throw new Error("Initialization output exceeded its limit");
        for (const event of tail?.events ?? []) {
          if ((event.seq ?? 0) <= afterSeq) continue;
          afterSeq = Math.max(afterSeq, event.seq);
          if (event.stream === "stdout") stdout += event.data || "";
          if (event.stream === "stderr") stderr += event.data || "";
        }
        if (stdout.length + stderr.length > 64000) throw new Error("Initialization output exceeded its limit");
        if (status.status === "timedOut") throw preparationTimeout(executable, execution, timeoutMs);
        if (status.status === "cancelled")
          throw Object.assign(new Error("Initialization was cancelled or access was revoked."), { code: "agent.prepare.cancelled" });
        if (status.status !== "completed" || status.exitCode !== 0)
          throw new Error(`${executable} could not initialize (exit ${status.exitCode ?? "unknown"}). ${status.error || stderr.slice(-2000) || "Install or select this executable on the chosen machine."}`);
        return stdout;
      }
      await delay(75, signal);
    }
    throw preparationTimeout(executable, execution, timeoutMs);
  } finally {
    await host.call("tasks.cancel", { taskId }).catch(() => {});
  }
}

export async function probeNode(host, execution, signal) {
  const runtime = execution.runtime;
  if (!runtime) throw new Error("Select or install a Node 22+ runtime before initializing this remote assistant.");
  const output = await checkedTask(host, execution, runtime, ["--eval", 'process.stdout.write(JSON.stringify({version:process.versions.node,path:process.execPath}))'], 30000, signal);
  let result;
  try { result = JSON.parse(output); } catch { throw new Error("The selected executable did not identify itself as Node.js"); }
  if (!/^\d+\.\d+\.\d+$/.test(result.version) || Number(result.version.split(".")[0]) < 22 || typeof result.path !== "string")
    throw new Error("This assistant requires Node.js 22 or newer on its execution machine");
  execution.runtime = result.path;
  return result.version;
}

/** Exercise the agent's real structured protocol without sending a user prompt. */
export async function probeCli(host, profile, execution, signal) {
  const args = cliArguments(profile, "ask");
  if (profile.protocol === "pi") {
    // No prompts run in preflight; the permission extension is deployed only for
    // actual runs. Its local plugin path must never be sent to a remote machine.
    const extension = args.indexOf("--extension");
    if (extension >= 0) args.splice(extension, 2);
  }
  const started = await host.call("tasks.start", {
    executable: profile.executable, args, cwd: execution.cwd,
    ...(execution.kind === "remote" ? { sessionId: execution.sessionId, platform: execution.platform } : {}),
    timeoutMs: 30000,
  }, { signal });
  const taskId = typeof started === "string" ? started : started?.taskId;
  if (!taskId) throw new Error("Agent initialization did not return a process ID");
  let settle, fail;
  const response = new Promise((resolve, reject) => { settle = resolve; fail = reject; });
  void response.catch(() => {});
  const requestId = "tunnelde-initialize";
  let piState;
  const connection = new TaskConnection(host, taskId, {
    signal,
    onRecord: async (record, channel) => {
      if (profile.protocol === "claude-code" && record.type === "control_response" && record.response?.request_id === requestId) {
        if (record.response.subtype === "error") fail(new Error(record.response.error || "Claude initialization failed"));
        else settle();
      }
      if (profile.protocol === "pi" && record.type === "response" && record.id === requestId) {
        if (record.success !== true) fail(new Error(record.error || "Pi RPC initialization failed"));
        else {
          piState = record.data;
          await channel.write({ id: "tunnelde-models", type: "get_available_models" });
        }
      }
      if (profile.protocol === "pi" && record.type === "response" && record.id === "tunnelde-models") {
        const models = record.data?.models;
        const selected = piState?.model;
        if (record.success !== true || !Array.isArray(models) || !selected ||
          !models.some((model) => model.id === selected.id && model.provider === selected.provider))
          fail(new Error(`Pi's selected model is unavailable on ${execution.title}. Run ${profile.executable}, use /login and select an available model, then Initialize again.`));
        else settle();
      }
      // Preparation never authorizes tools, prompts or extension interactions.
      if (record.id != null && record.method)
        await channel.write({ jsonrpc: "2.0", id: record.id, error: { code: -32601, message: "No tools during initialization" } });
    },
  });
  connection.onFailure = fail;
  if (connection.error) fail(connection.error);
  const timer = setTimeout(() => fail(new Error("Agent protocol initialization timed out")), 25000);
  try {
    if (profile.protocol === "codex") {
      await Promise.race([connection.rpc("initialize", { clientInfo: { name: "tunnelde", title: "Tunnelde", version: "1.0.0" } }), response]);
      await connection.write({ jsonrpc: "2.0", method: "initialized", params: {} });
      const auth = await Promise.race([connection.rpc("account/read", { refreshToken: false }), response]);
      if (auth?.requiresOpenaiAuth !== false && !auth?.account)
        throw new Error(`Codex is not signed in on ${execution.title}. Run ${profile.executable} login, then Initialize again.`);
    } else if (profile.protocol === "claude-code") {
      await connection.write({ type: "control_request", request_id: requestId, request: { subtype: "initialize", hooks: {} } });
      await response;
    } else {
      await connection.write({ id: requestId, type: "get_state" });
      await response;
    }
  } finally {
    clearTimeout(timer);
    await connection.close();
  }
}

export async function prepareAgent(host, profile, execution, session, signal, { approved = false, checkpoint } = {}) {
  const cli = CLI_PROTOCOLS.has(profile.protocol);
  if (execution.kind === "local" && !cli) return { detail: "API provider configured" };
  const allowed = approved || await host.call("ui.confirm", {
    message: `Initialize ${profile.name} on ${execution.title}?\n\n${cli ? `Start ${profile.executable} and check its structured agent protocol` : `Run ${execution.runtime || "a selected Node runtime"} to verify Node.js 22+ and initialize a remote worker. Uploading plugin source into a new private directory requires separate approval`}. No chat prompt will be sent. Existing Node runtimes may be used only after this approval. Installation requires a separate approval.`,
  }, { signal, timeoutMs: 120000 });
  if (allowed !== true) throw new Error("Initialization was cancelled");
  if (cli) {
    await checkedTask(host, execution, profile.executable, ["--version"], 30000, signal);
    if (profile.protocol === "claude-code") {
      let output;
      try { output = await checkedTask(host, execution, profile.executable, ["auth", "status"], 30000, signal); }
      catch (error) {
        signal?.throwIfAborted();
        if (error?.code === "agent.prepare.timeout" || error?.code === "agent.prepare.cancelled") throw error;
        throw new Error(`Claude Code sign-in status could not be verified on ${execution.title}. Check the executable and connection; if needed, run ${profile.executable} auth login, then Initialize again. ${error.message}`);
      }
      let auth;
      try { auth = JSON.parse(output); } catch { throw new Error("Claude Code did not return authentication status. Update Claude Code and run claude auth login on this machine."); }
      if (auth.loggedIn !== true) throw new Error(`Claude Code is not signed in on ${execution.title}. Run ${profile.executable} auth login, then Initialize again.`);
    }
    await probeCli(host, profile, execution, signal);
    return { detail: `${profile.protocol} protocol initialized` };
  }
  const version = await probeNode(host, execution, signal);
  session.remoteStdio = await deployFiles(host, execution, await runtimeFiles(), {
    label: PLUGIN_ID, saved: session.remoteStdio, signal,
    onCheckpoint: async (record) => { session.remoteStdio = record; await checkpoint?.(); },
  });
  const paths = execution.platform === "windows" ? path.win32 : path.posix;
  const started = await host.call("tasks.start", {
    executable: execution.runtime, args: [paths.join(session.remoteStdio.directory, "stdio-entry.mjs")],
    cwd: execution.cwd, sessionId: execution.sessionId, platform: execution.platform, timeoutMs: 30000,
  }, { signal });
  const taskId = typeof started === "string" ? started : started?.taskId;
  if (!taskId) throw new Error("Worker initialization did not return a process ID");
  const connection = new TaskConnection(host, taskId, {
    signal,
    onRecord: async (record, channel) => {
      if (record.id == null || typeof record.method !== "string") throw new Error("Invalid worker initialization record");
      // No secrets, configuration or user tools are given to the preparation worker.
      if (record.method === "storage.get") await channel.write({ jsonrpc: "2.0", id: record.id, result: null });
      else await channel.write({ jsonrpc: "2.0", id: record.id, error: { code: -32601, message: "Unavailable during initialization" } });
    },
  });
  try {
    const result = await connection.rpc("initialize", { execution });
    if (result?.ok !== true) throw new Error("Remote worker did not acknowledge initialization");
  } finally { await connection.close(); }
  return { detail: `Node.js ${version}; remote worker protocol initialized` };
}
