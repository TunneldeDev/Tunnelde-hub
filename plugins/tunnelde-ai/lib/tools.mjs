import { boundedString } from "./config.mjs";
import { randomUUID } from "node:crypto";
import { resolvePath, workspaceContext } from "./targets.mjs";

const schema = (properties, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const string = { type: "string" },
  boolean = { type: "boolean" };
const location = { path: string, sessionId: string };
export const TOOLS = Object.freeze([
  {
    name: "workspace_context",
    description:
      "Read the actual selected execution target, working directory and authorized roots. Use this instead of guessing paths or session IDs.",
    parameters: schema({}),
  },
  {
    name: "list_sessions",
    description:
      "List currently connected SSH sessions within the selected authorization scope.",
    parameters: schema({}),
  },
  {
    name: "list_hosts",
    description:
      "List saved host metadata in the selected scope, without credentials.",
    parameters: schema({}),
  },
  {
    name: "list_directory",
    description:
      "List a directory inside the explicitly authorized local or SSH scope.",
    parameters: schema(location, ["path"]),
  },
  {
    name: "read_file",
    description: "Read a bounded UTF-8 text file inside the authorized scope.",
    parameters: schema(location, ["path"]),
  },
  {
    name: "write_file",
    description:
      "Replace an existing UTF-8 text file. Read it first and include its sha256 as expectedHash to protect concurrent edits.",
    parameters: schema({ ...location, content: string, expectedHash: string }, [
      "path",
      "content",
    ]),
  },
  {
    name: "create_file",
    description: "Create an empty file without overwriting an existing target.",
    parameters: schema(location, ["path"]),
  },
  {
    name: "create_directory",
    description: "Create a directory in the authorized scope.",
    parameters: schema(location, ["path"]),
  },
  {
    name: "rename_file",
    description: "Rename a file or directory; overwrite defaults to false.",
    parameters: schema(
      { from: string, to: string, sessionId: string, overwrite: boolean },
      ["from", "to"],
    ),
  },
  {
    name: "delete_file",
    description:
      "Delete a file or directory. This is destructive and subject to the selected approval policy.",
    parameters: schema({ ...location, isDir: boolean }, ["path"]),
  },
  {
    name: "run_command",
    description:
      "Run a bounded command. SSH uses command plus sessionId; local execution requires executable, args and an authorized cwd. ReadOnly never permits commands.",
    parameters: schema({
      command: string,
      sessionId: string,
      executable: string,
      args: { type: "array", items: string },
      cwd: string,
      timeoutMs: { type: "integer", minimum: 100, maximum: 60000 },
    }),
  },
]);

const READ_TOOLS = new Set([
  "workspace_context",
  "list_sessions",
  "list_hosts",
  "list_directory",
  "read_file",
]);
export function availableTools(mode) {
  return mode === "readOnly"
    ? TOOLS.filter((tool) => READ_TOOLS.has(tool.name))
    : [...TOOLS];
}

export function toolInvocation(name, input = {}, execution) {
  if (!TOOLS.some((tool) => tool.name === name))
    throw new Error(`Unsupported tool: ${name}`);
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Tool input must be an object");
  input = { ...input };
  if (
    execution &&
    !["workspace_context", "list_sessions", "list_hosts"].includes(name)
  ) {
    if (input.sessionId && input.sessionId !== execution.sessionId)
      throw new Error(
        "The requested SSH session is outside the selected execution target",
      );
    if (execution.kind === "remote") input.sessionId = execution.sessionId;
    for (const key of name === "rename_file"
      ? ["from", "to"]
      : name === "run_command"
        ? ["cwd"]
        : ["path"]) {
      if (!input[key] && key !== "cwd" && name !== "list_directory")
        throw new Error(`Missing ${key}`);
      input[key] = resolvePath(
        input[key] || (key === "cwd" || name === "list_directory" ? "." : ""),
        execution,
      );
    }
    if (
      name === "run_command" &&
      !input.sessionId &&
      !input.executable &&
      input.command
    ) {
      input.executable =
        execution.platform === "windows"
          ? process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe"
          : "/bin/sh";
      input.args =
        execution.platform === "windows"
          ? ["/d", "/s", "/c", input.command]
          : ["-c", input.command];
    }
  }
  if (name === "workspace_context")
    return { method: "workspace_context", params: {} };
  if (name === "list_sessions") return { method: "sessions.list", params: {} };
  if (name === "list_hosts") return { method: "hosts.snapshot", params: {} };
  const sessionId = input.sessionId
    ? boundedString(input.sessionId, "SSH session ID", 128)
    : undefined;
  const remote = !!sessionId;
  const prefix = remote ? "files.sftp." : "files.local.";
  const params = sessionId ? { sessionId } : {};
  if (name === "run_command") {
    const timeoutMs = input.timeoutMs ?? 20_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000)
      throw new Error("Invalid command timeout");
    if (remote)
      return {
        method: "sessions.exec",
        params: {
          sessionId,
          command:
            execution && input.cwd
              ? execution.platform === "windows"
                ? `Set-Location -LiteralPath '${input.cwd.replaceAll("'", "''")}'; ${boundedString(input.command, "shell command", 64 * 1024)}`
                : `cd '${input.cwd.replaceAll("'", "'\"'\"'")}' && ${boundedString(input.command, "shell command", 64 * 1024)}`
              : boundedString(input.command, "shell command", 64 * 1024),
          timeoutMs,
        },
      };
    if (!Array.isArray(input.args ?? []) || (input.args ?? []).length > 128)
      throw new Error("Invalid process arguments");
    return {
      method: "tasks.start",
      params: {
        executable: boundedString(input.executable, "executable"),
        args: (input.args ?? []).map((arg) =>
          boundedString(arg, "argument", 16384, false),
        ),
        cwd: boundedString(input.cwd, "working directory"),
        timeoutMs,
      },
    };
  }
  if (name === "rename_file")
    return {
      method: `${prefix}rename`,
      params: {
        ...params,
        from: boundedString(input.from, "source path"),
        to: boundedString(input.to, "target path"),
        overwrite: input.overwrite === true,
      },
    };
  params.path = boundedString(input.path, "file path");
  const methods = {
    list_directory: "list",
    read_file: "readText",
    write_file: "writeText",
    create_file: "createFile",
    create_directory: "mkdir",
    delete_file: "delete",
  };
  if (name === "write_file") {
    params.content = boundedString(
      input.content,
      "file content",
      96 * 1024,
      false,
    );
    if (input.expectedHash != null) {
      if (!/^[a-f0-9]{64}$/i.test(input.expectedHash))
        throw new Error("Invalid expected file hash");
      params.expectedHash = input.expectedHash;
    }
  }
  if (name === "delete_file") params.isDir = input.isDir === true;
  return { method: `${prefix}${methods[name]}`, params };
}

export const isReadTool = (name) => READ_TOOLS.has(name);

/** Stop the native approval/action as well as the local RPC wait. */
export async function hostToolCall(host, params, signal) {
  signal?.throwIfAborted();
  const requestId = randomUUID();
  const cancel = () => {
    void host.call("tools.cancel", { requestId }).catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    return await host.call(
      "tools.invoke",
      { ...params, requestId },
      { signal, timeoutMs: 120000 },
    );
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

/** All model-selected actions go through the host's independent scope gate. */
export async function invokeTool(host, config, tool, review, signal) {
  if (config.mode === "readOnly" && !isReadTool(tool.name))
    throw new Error("ReadOnly mode forbids shell commands and mutations");
  const invocation = toolInvocation(
    tool.name,
    tool.arguments,
    config.execution,
  );
  if (invocation.method === "workspace_context")
    return workspaceContext(config);
  const result = await hostToolCall(
    host,
    {
      ...invocation,
      mode: config.mode,
      scope: config.scope,
      ...(review ? { review } : {}),
    },
    signal,
  );
  if (invocation.method !== "tasks.start") return result;
  const taskId = typeof result === "string" ? result : result?.taskId;
  if (!taskId) throw new Error("Host did not return a command task ID");
  let afterSeq = 0,
    output = "",
    terminalObserved = false;
  try {
    while (true) {
      signal?.throwIfAborted();
      const batch = await host.call(
        "tasks.readOutput",
        { taskId, afterSeq },
        { signal },
      );
      if (batch?.truncated)
        throw new Error("Command output exceeded the recoverable task buffer");
      let processed = 0;
      for (const event of batch?.events ?? []) {
        if ((event.seq ?? 0) <= afterSeq) continue;
        processed++;
        afterSeq = Math.max(afterSeq, event.seq ?? 0);
        output += event.data ?? "";
        if (Buffer.byteLength(output) > 64 * 1024)
          throw new Error("Command output exceeds 64 KiB");
      }
      // New hosts capture status and output under the same lock. Older hosts
      // require one extra read after observing exit to avoid losing its tail.
      const atomicStatus = typeof batch?.status === "string";
      const status = atomicStatus ? batch : await host.call("tasks.status", { taskId }, { signal });
      if (!status?.status) throw new Error("Command task is no longer available");
      if (!["running", "starting"].includes(status.status)) {
        if (!processed && (atomicStatus || terminalObserved)) {
          const final = atomicStatus ? await host.call("tasks.status", { taskId }, { signal }) : status;
          if (!final?.status) throw new Error("Command task is no longer available");
          return { ...final, output };
        }
        terminalObserved = true;
        continue;
      }
      await delay(100, signal);
    }
  } catch (error) {
    await host.call("tasks.cancel", { taskId }).catch(() => {});
    throw error;
  }
}

export function delay(ms, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal.reason ?? new Error("Cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
