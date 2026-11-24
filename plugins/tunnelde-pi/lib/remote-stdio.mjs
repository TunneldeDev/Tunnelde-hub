import path from "node:path";
import { TaskConnection } from "./cli.mjs";
import { hostToolCall } from "./tools.mjs";
import { deployFiles, runtimeFiles } from "./deployment.mjs";
import { PLUGIN_ID, PROFILE_POLICY } from "./identity.mjs";

export async function runRemoteAssistant({
  host,
  profile,
  config,
  session,
  message,
  signal,
  onEvent,
  checkpoint,
}) {
  const target = config.execution;
  if (!target.runtime)
    throw new Error(
      "Choose the remote Node runtime in Execution location before running Tunnelde AI remotely. No system Node is used automatically.",
    );
  session.remoteStdio = await deployFiles(host, target, await runtimeFiles(), {
    signal,
    label: PLUGIN_ID,
    saved: session.remoteStdio,
    onCheckpoint: async (record) => { session.remoteStdio = record; await checkpoint?.(); },
  });
  const paths = target.platform === "windows" ? path.win32 : path.posix;
  const started = await host.call(
    "tasks.start",
    {
      executable: target.runtime,
      args: [paths.join(session.remoteStdio.directory, "stdio-entry.mjs")],
      cwd: target.cwd,
      sessionId: target.sessionId,
      platform: target.platform,
      timeoutMs: 86_400_000,
    },
    { signal },
  );
  const taskId = typeof started === "string" ? started : started?.taskId;
  if (!taskId)
    throw new Error("Host did not return a remote assistant task ID");
  const remoteConfig = structuredClone(config);
  delete remoteConfig.execution;
  const permittedProfiles = new Set(
    [profile.id, config.approverProfileId].filter(Boolean),
  );
  remoteConfig.profiles = remoteConfig.profiles
    .filter((item) => permittedProfiles.has(item.id))
    .map((item) => {
      delete item.remote;
      delete item.sessionId;
      return item;
    });
  remoteConfig.activeProfileId = profile.id;
  remoteConfig.scope = {
    localRoots: [target.cwd],
    sessionIds: [],
    remoteRoots: [],
  };
  const previous = structuredClone(session);
  previous.history.pop(); // send() in the worker appends this user message once.
  previous.run = null;
  previous.execution = null;
  delete previous.remoteStdio;
  const memory = new Map([
    [
      "ai.config",
      {
        pluginId: PLUGIN_ID,
        profilePolicy: PROFILE_POLICY,
        config: remoteConfig,
      },
    ],
    [
      "ai.sessions",
      {
        version: 1,
        pluginId: PLUGIN_ID,
        profilePolicy: PROFILE_POLICY,
        activeSessionId: session.id,
        sessions: [previous],
      },
    ],
  ]);
  let finish, fail;
  const done = new Promise((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  void done.catch(() => {});
  const ownedTasks = new Set();
  const bridge = async (method, params = {}) => {
    if (method === "storage.get") return memory.get(params.key) ?? null;
    if (method === "storage.set") {
      if (Buffer.byteLength(JSON.stringify(params.value)) > 256 * 1024)
        throw new Error("Remote storage exceeds its limit");
      memory.set(params.key, params.value);
      return null;
    }
    if (method === "secrets.get") {
      if (![...permittedProfiles].some((id) => params.key === `provider.${id}`))
        throw new Error("Remote credential is outside this run");
      return host.call(method, params, { signal });
    }
    if (method === "files.local.home") return target.home;
    if (method === "tools.invoke") {
      const invocation = structuredClone(params);
      if (
        invocation.method.startsWith("files.local.") &&
        invocation.method !== "files.local.home"
      ) {
        invocation.method = invocation.method.replace(
          "files.local.",
          "files.sftp.",
        );
        invocation.params.sessionId = target.sessionId;
      }
      if (invocation.method === "tasks.start")
        Object.assign(invocation.params, {
          sessionId: target.sessionId,
          platform: target.platform,
        });
      invocation.scope = config.scope;
      invocation.mode = config.mode;
      const result = await hostToolCall(host, invocation, signal);
      if (invocation.method === "tasks.start") {
        const id = typeof result === "string" ? result : result?.taskId;
        if (id) ownedTasks.add(id);
      }
      return result;
    }
    if (["tasks.status", "tasks.readOutput", "tasks.cancel"].includes(method)) {
      if (!ownedTasks.has(params.taskId))
        throw new Error("Remote task is outside this run");
      return host.call(method, params, { signal });
    }
    if (method === "events.publish" && params.event === "chat") {
      const event = params.payload;
      if (event?.sessionId !== session.id || event?.runId !== session.run.id)
        throw new Error("Remote event does not belong to this run");
      const saved = memory
        .get("ai.sessions")
        ?.sessions?.find((item) => item.id === session.id);
      if (saved) {
        session.history = saved.history;
        session.tasks = saved.tasks;
      }
      await onEvent(event);
      if (
        event.type === "snapshot" &&
        ["done", "failed", "error", "cancelled", "interrupted"].includes(
          event.block?.run?.status,
        )
      ) {
        event.block.run.status === "done"
          ? finish()
          : fail(
              new Error(
                event.block.messages?.findLast((item) => item.role === "system")
                  ?.content || "Remote assistant stopped",
              ),
            );
      }
      return true;
    }
    if (method === "ui.confirm") return host.call(method, params, { signal });
    if (method === "log") return null;
    throw new Error(`Remote assistant cannot call ${method}`);
  };
  const connection = new TaskConnection(host, taskId, {
    signal,
    onRecord: async (record, channel) => {
      if (record.id == null || typeof record.method !== "string")
        throw new Error("Invalid remote assistant protocol record");
      try {
        const result = await bridge(record.method, record.params);
        await channel.write({ jsonrpc: "2.0", id: record.id, result });
      } catch (error) {
        await channel.write({
          jsonrpc: "2.0",
          id: record.id,
          error: {
            code: -32000,
            message: String(error.message).slice(0, 4096),
          },
        });
      }
    },
  });
  connection.onFailure = fail;
  if (connection.error) fail(connection.error);
  try {
    await connection.rpc("initialize", { execution: target });
    await connection.rpc("command.run", {
      command: "ai.send",
      input: {
        sessionId: session.id,
        runId: session.run.id,
        message,
        modelId: profile.id,
        mode: config.mode,
      },
    });
    await done;
  } finally {
    await connection.close();
    for (const id of ownedTasks)
      await host.call("tasks.cancel", { taskId: id }).catch(() => {});
  }
}
