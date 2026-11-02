import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { delay } from "./tools.mjs";
import { PLUGIN_ID, PLUGIN_TITLE } from "./identity.mjs";

export function insideRoot(
  value,
  root,
  windows = process.platform === "win32",
) {
  const paths = windows ? path.win32 : path.posix;
  const relative = paths.relative(paths.resolve(root), paths.resolve(value));
  return (
    relative === "" ||
    (!relative.startsWith(`..${paths.sep}`) &&
      relative !== ".." &&
      !paths.isAbsolute(relative))
  );
}
export function assertCliScope(profile, scope) {
  if (!profile.executable || !profile.cwd)
    throw new Error(
      "Choose an explicit CLI executable and working directory before starting",
    );
  const remote = !!profile.sessionId;
  const roots = remote
    ? scope.remoteRoots
        .filter((root) => root.sessionId === profile.sessionId)
        .map((root) => root.path)
    : scope.localRoots;
  if (remote && !scope.sessionIds.includes(profile.sessionId))
    throw new Error("The SSH session is outside this agent's scope");
  if (
    !roots.some((root) =>
      insideRoot(
        profile.cwd,
        root,
        remote ? profile.platform === "windows" : process.platform === "win32",
      ),
    )
  )
    throw new Error(
      "The CLI working directory must be inside an explicitly authorized root",
    );
}

export function cliArguments(profile, mode, resume = {}) {
  if (profile.protocol === "codex") return ["app-server"];
  if (profile.protocol === "claude-code") {
    const args = [
      "--print",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--permission-prompt-tool",
      "stdio",
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--disable-slash-commands",
    ];
    if (profile.model) args.push("--model", profile.model);
    if (resume.sessionId) args.push("--resume", resume.sessionId);
    if (mode === "readOnly")
      args.push(
        "--permission-mode",
        "plan",
        "--tools",
        "Read,Glob,Grep",
        "--allowedTools",
        "Read,Glob,Grep",
      );
    else if (mode === "full")
      args.push(
        "--permission-mode",
        "bypassPermissions",
        "--dangerously-skip-permissions",
      );
    else
      args.push(
        "--permission-mode",
        "default",
        "--settings",
        JSON.stringify({
          permissions: {
            allow: [],
            ask: [
              "Read",
              "Glob",
              "Grep",
              "Bash",
              "Edit",
              "Write",
              "NotebookEdit",
              "WebFetch",
              "WebSearch",
              "Agent",
              "Task",
            ],
            deny: [],
          },
        }),
      );
    return args;
  }
  if (profile.protocol === "pi") {
    const args = [
      "--mode",
      "rpc",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--extension",
      profile.permissionExtension ||
        fileURLToPath(new URL("./pi-permissions.mjs", import.meta.url)),
      "--tools",
      mode === "readOnly"
        ? "read,grep,find,ls"
        : "read,bash,edit,write,grep,find,ls",
    ];
    if (profile.model) args.push("--model", profile.model);
    if (profile.provider) args.push("--provider", profile.provider);
    if (resume.sessionPath) args.push("--session", resume.sessionPath);
    return args;
  }
  throw new Error("Unsupported CLI adapter");
}

export function codexPolicy(mode, cwd) {
  return mode === "full"
    ? {
        approvalPolicy: "never",
        sandbox: "dangerFullAccess",
        sandboxPolicy: { type: "dangerFullAccess" },
      }
    : {
        approvalPolicy: mode === "readOnly" ? "never" : "unlessTrusted",
        sandbox: "readOnly",
        sandboxPolicy: {
          type: "readOnly",
          access: {
            type: "restricted",
            includePlatformDefaults: false,
            readableRoots: [cwd],
          },
        },
      };
}

export class TaskConnection {
  constructor(host, taskId, { signal, onRecord, onCheckpoint, afterSeq = 0 }) {
    this.host = host;
    this.taskId = taskId;
    this.signal = signal;
    this.onRecord = onRecord;
    this.onCheckpoint = onCheckpoint;
    this.afterSeq = afterSeq;
    this.buffer = "";
    this.stderr = "";
    this.sequence = 0;
    this.pending = new Map();
    this.closed = false;
    this.error = null;
    this.onFailure = null;
    this.done = this.pump().catch((error) => {
      this.error = error;
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.onFailure?.(error);
    });
  }
  async write(record) {
    this.signal?.throwIfAborted();
    if (this.error) throw this.error;
    if (this.closed) throw new Error("CLI task is closed");
    const data = JSON.stringify(record) + "\n";
    if (Buffer.byteLength(data) > 192 * 1024)
      throw new Error("CLI request exceeds the supported host transport size");
    await this.host.call(
      "tasks.write",
      { taskId: this.taskId, data },
      { signal: this.signal },
    );
  }
  async rpc(method, params = {}) {
    const id = ++this.sequence;
    let timer;
    const response = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CLI request timed out: ${method}`));
      }, 60_000);
      this.pending.set(id, { resolve, reject });
    });
    void response.catch(() => {});
    try {
      await this.write({ jsonrpc: "2.0", id, method, params });
      return await response;
    } finally {
      clearTimeout(timer);
      this.pending.delete(id);
    }
  }
  async pump() {
    while (!this.closed) {
      this.signal?.throwIfAborted();
      const batch = await this.host.call(
        "tasks.readOutput",
        { taskId: this.taskId, afterSeq: this.afterSeq },
        { signal: this.signal },
      );
      if (batch?.truncated)
        throw new Error(
          "CLI output was truncated; resume the saved CLI session in a new task",
        );
      for (const event of batch?.events ?? []) {
        if ((event.seq ?? 0) <= this.afterSeq) continue;
        this.afterSeq = Math.max(this.afterSeq, event.seq);
        if (event.stream === "stderr" && event.data)
          this.stderr = (this.stderr + event.data).slice(-8000);
        if (event.stream === "stdout" && event.data) {
          this.buffer += event.data;
          if (Buffer.byteLength(this.buffer) > 1024 * 1024)
            throw new Error("CLI protocol line exceeds 1 MiB");
          let end;
          while ((end = this.buffer.indexOf("\n")) >= 0) {
            const line = this.buffer.slice(0, end).trim();
            this.buffer = this.buffer.slice(end + 1);
            if (!line) continue;
            let record;
            try {
              record = JSON.parse(line);
            } catch {
              throw new Error(
                "CLI emitted non-JSON output; select a CLI version supporting its structured protocol",
              );
            }
            const pending = !record.method && this.pending.get(record.id);
            if (pending) {
              this.pending.delete(record.id);
              record.error
                ? pending.reject(
                    new Error(record.error.message ?? "CLI request failed"),
                  )
                : pending.resolve(record.result);
            } else await this.onRecord(record, this);
          }
        }
      }
      this.onCheckpoint?.({ taskId: this.taskId, afterSeq: this.afterSeq });
      const status = await this.host.call(
        "tasks.status",
        { taskId: this.taskId },
        { signal: this.signal },
      );
      if (!status) throw new Error("CLI task is no longer available");
      if (!["running", "starting"].includes(status.status) && !this.closed)
        throw new Error(
          `Agent process ended (${status.status}, exit ${status.exitCode ?? "unknown"}). ${status.error || this.stderr || "Check the selected executable, login and protocol support on this machine."}`,
        );
      if (!this.closed) await delay(100, this.signal);
    }
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values())
      pending.reject(new Error("CLI task closed"));
    this.pending.clear();
    await this.host
      .call("tasks.cancel", { taskId: this.taskId })
      .catch(() => {});
  }
}

export async function runCli({
  host,
  profile,
  config,
  session,
  message,
  signal,
  onDelta,
  onActivity = () => {},
  approve,
  checkpoint,
  onTask,
  recover = false,
}) {
  assertCliScope(profile, config.scope);
  if (config.mode === "readOnly" && profile.protocol !== "codex")
    throw new Error(
      "ReadOnly CLI execution requires Codex's restricted read sandbox. Claude Code and Pi do not provide a verifiable OS read sandbox; choose an API profile for scoped read-only work",
    );
  if (
    profile.sessionId &&
    profile.protocol === "pi" &&
    !profile.permissionExtension
  )
    throw new Error(
      "Remote Pi requires its approved permission extension on the selected server",
    );
  const saved = session.cli ?? {};
  let taskId;
  if (recover && saved.taskId) {
    const task = await host.call("tasks.status", { taskId: saved.taskId });
    if (task && ["running", "starting"].includes(task.status))
      taskId = saved.taskId;
  }
  const reattached = !!taskId;
  if (!taskId) {
    const started = await host.call(
      "tasks.start",
      {
        executable: profile.executable,
        args: cliArguments(profile, config.mode, saved),
        cwd: profile.cwd,
        ...(profile.sessionId
          ? {
              sessionId: profile.sessionId,
              platform: profile.platform ?? "posix",
            }
          : {}),
        timeoutMs: 24 * 60 * 60 * 1000,
      },
      { signal },
    );
    taskId = typeof started === "string" ? started : started?.taskId;
    if (!taskId) throw new Error("Host did not return a CLI task ID");
    session.cli = { ...saved, taskId, afterSeq: 0, protocol: profile.protocol };
  }
  onTask?.({
    id: taskId,
    title: `${profile.name} CLI`,
    status: "running",
    recoverable: true,
  });
  let finish,
    fail,
    text = "",
    complete = false;
  const initializationId = randomUUID();
  let claudeMessage = 0;
  const streamedThinking = new Set();
  const printable = (value) =>
    typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);
  let initialized;
  const initialization = new Promise((resolve) => {
    initialized = resolve;
  });
  const turn = new Promise((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  void turn.catch(() => {});
  const append = (delta) => {
    if (typeof delta === "string" && delta) {
      if (text.length + delta.length > 64000)
        throw new Error("CLI output exceeds 64000 characters");
      text += delta;
      onDelta(delta);
    }
  };
  const authorize = async (request) => {
    if (config.mode === "readOnly") {
      if (profile.protocol !== "pi") return false;
      try {
        const data = JSON.parse(request.input);
        return ["read", "grep", "find", "ls"].includes(data.tool);
      } catch {
        return false;
      }
    }
    return approve({
      tool: request.tool ?? profile.protocol,
      title: request.title ?? "CLI tool request",
      detail: JSON.stringify(request.input ?? request.params ?? request).slice(
        0,
        16000,
      ),
      command: request.command,
    });
  };
  const connection = new TaskConnection(host, taskId, {
    signal,
    afterSeq: reattached ? (saved.afterSeq ?? 0) : 0,
    onCheckpoint: (value) => {
      Object.assign(session.cli, value);
      checkpoint?.();
    },
    onRecord: async (record, channel) => {
      if (profile.protocol === "codex") {
        const params = record.params ?? {};
        if (record.id != null && record.method) {
          if (
            [
              "item/commandExecution/requestApproval",
              "item/fileChange/requestApproval",
            ].includes(record.method)
          ) {
            const allowed = await authorize({
              tool: record.method,
              params,
              command: params.command,
            });
            await channel.write({
              jsonrpc: "2.0",
              id: record.id,
              result: { decision: allowed ? "accept" : "decline" },
            });
          } else
            await channel.write({
              jsonrpc: "2.0",
              id: record.id,
              error: {
                code: -32601,
                message: "Unsupported server request; access denied",
              },
            });
          return;
        }
        if (record.method === "item/agentMessage/delta") append(params.delta);
        if (
          [
            "item/reasoning/summaryTextDelta",
            "item/reasoning/textDelta",
          ].includes(record.method)
        )
          onActivity({
            id: `${params.itemId}:${record.method}`,
            kind: "reasoning",
            title: "",
            delta: params.delta,
            status: "running",
          });
        if (["item/started", "item/completed"].includes(record.method)) {
          const item = params.item ?? {};
          if (
            [
              "commandExecution",
              "fileChange",
              "mcpToolCall",
              "dynamicToolCall",
              "webSearch",
            ].includes(item.type)
          )
            onActivity({
              id: item.id,
              kind: "tool",
              title: item.command || item.tool || item.type,
              content: printable(
                item.aggregatedOutput ??
                  item.output ??
                  item.result ??
                  item.changes ??
                  item.arguments ??
                  "",
              ),
              status:
                item.status ??
                (record.method === "item/completed" ? "done" : "running"),
            });
        }
        if (
          [
            "item/commandExecution/outputDelta",
            "item/fileChange/outputDelta",
          ].includes(record.method)
        )
          onActivity({
            id: params.itemId,
            kind: "tool",
            delta: params.delta,
            status: "running",
          });
        if (record.method === "turn/started") {
          session.cli.turnId = params.turn?.id;
          checkpoint?.();
        }
        if (record.method === "turn/completed") {
          complete = true;
          params.turn?.status === "completed"
            ? finish()
            : fail(
                new Error(
                  params.turn?.error?.message ??
                    `Codex turn ${params.turn?.status ?? "failed"}`,
                ),
              );
        }
        if (record.method === "error")
          fail(
            new Error(
              params.error?.message ?? "Codex app-server reported an error",
            ),
          );
      } else if (profile.protocol === "claude-code") {
        const event = record.event ?? {};
        if (record.type === "stream_event") {
          if (event.type === "message_start") claudeMessage++;
          const key = `claude:${claudeMessage}:${event.index ?? 0}`;
          if (
            event.type === "content_block_start" &&
            event.content_block?.type === "tool_use"
          )
            onActivity({
              id: event.content_block.id,
              kind: "tool",
              title: event.content_block.name,
              content: printable(event.content_block.input),
              status: "running",
            });
          if (
            event.type === "content_block_delta" &&
            event.delta?.type === "thinking_delta"
          ) {
            streamedThinking.add(claudeMessage);
            onActivity({
              id: key,
              kind: "reasoning",
              title: "",
              delta: event.delta.thinking,
              status: "running",
            });
          }
        }
        if (record.type === "assistant")
          for (const part of record.message?.content ?? []) {
            if (part.type === "tool_use")
              onActivity({
                id: part.id,
                kind: "tool",
                title: part.name,
                content: printable(part.input),
                status: "running",
              });
            if (
              part.type === "thinking" &&
              !streamedThinking.has(claudeMessage)
            )
              onActivity({
                id: `claude:${claudeMessage}:thinking`,
                kind: "reasoning",
                title: "",
                content: part.thinking,
                status: "done",
              });
          }
        if (record.type === "user")
          for (const part of record.message?.content ?? []) {
            if (part.type === "tool_result")
              onActivity({
                id: part.tool_use_id,
                kind: "tool",
                content: printable(part.content),
                status: part.is_error ? "error" : "done",
              });
          }
        if (
          record.type === "control_response" &&
          record.response?.request_id === initializationId
        ) {
          if (record.response.subtype === "error")
            fail(
              new Error(
                record.response.error || "Claude Code initialization failed",
              ),
            );
          else initialized();
        }
        if (record.type === "system" && record.session_id) {
          session.cli.sessionId = record.session_id;
          checkpoint?.();
        }
        if (
          record.type === "stream_event" &&
          record.event?.type === "content_block_delta" &&
          record.event.delta?.type === "text_delta"
        )
          append(record.event.delta.text);
        if (record.type === "assistant" && !text)
          append(
            (record.message?.content ?? [])
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join(""),
          );
        if (record.type === "control_request") {
          const request = record.request ?? {};
          if (request.subtype !== "can_use_tool") {
            await channel.write({
              type: "control_response",
              response: {
                subtype: "error",
                request_id: record.request_id,
                error: "Unsupported control request",
              },
            });
          } else {
            const allowed = await authorize({
              tool: request.tool_name,
              input: request.input,
            });
            await channel.write({
              type: "control_response",
              response: {
                subtype: "success",
                request_id: record.request_id,
                response: allowed
                  ? { behavior: "allow", updatedInput: request.input }
                  : {
                      behavior: "deny",
                      message: "Tunnelde denied this action",
                    },
              },
            });
          }
        }
        if (record.type === "result") {
          complete = true;
          if (!text) append(record.result);
          if (
            record.is_error ||
            (record.subtype && record.subtype !== "success")
          )
            fail(
              new Error(
                (record.errors ?? []).join("\n") ||
                  `Claude Code ${record.subtype}`,
              ),
            );
          else finish();
        }
      } else {
        if (
          record.type === "message_update" &&
          record.assistantMessageEvent?.type === "thinking_delta"
        )
          onActivity({
            id: `pi:thinking:${record.assistantMessageEvent.contentIndex ?? 0}`,
            kind: "reasoning",
            title: "",
            delta: record.assistantMessageEvent.delta,
            status: "running",
          });
        if (record.type === "tool_execution_start")
          onActivity({
            id: record.toolCallId,
            kind: "tool",
            title: record.toolName,
            content: printable(record.args),
            status: "running",
          });
        if (
          ["tool_execution_update", "tool_execution_end"].includes(record.type)
        )
          onActivity({
            id: record.toolCallId,
            kind: "tool",
            content: printable(record.result ?? record.partialResult),
            status:
              record.type === "tool_execution_end"
                ? record.isError
                  ? "error"
                  : "done"
                : "running",
          });
        if (
          record.type === "message_update" &&
          record.assistantMessageEvent?.type === "text_delta"
        )
          append(record.assistantMessageEvent.delta);
        if (record.type === "extension_ui_request") {
          const allowed =
            record.method === "confirm" &&
            (await authorize({
              tool: "pi.tool",
              input: record.message,
              title: record.title,
            }));
          await channel.write({
            type: "extension_ui_response",
            id: record.id,
            confirmed: !!allowed,
          });
        }
        if (record.type === "response" && !record.success)
          fail(new Error(record.error ?? "Pi command failed"));
        if (
          record.type === "response" &&
          record.command === "prompt" &&
          record.success &&
          record.data?.disposition === "handled"
        ) {
          complete = true;
          finish();
        }
        if (record.type === "response" && record.command === "get_state") {
          session.cli.sessionPath =
            record.data?.sessionFile ??
            record.data?.sessionPath ??
            session.cli.sessionPath;
          checkpoint?.();
        }
        if (record.type === "agent_settled") {
          complete = true;
          finish();
        }
      }
    },
  });
  connection.onFailure = fail;
  if (connection.error) fail(connection.error);
  const abort = () => fail(signal.reason ?? new Error("Cancelled"));
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (!reattached) {
      if (profile.protocol === "codex") {
        await connection.rpc("initialize", {
          clientInfo: {
            name: PLUGIN_ID.replaceAll("-", "_"),
            title: PLUGIN_TITLE,
            version: "1.3.0",
          },
        });
        await connection.write({
          jsonrpc: "2.0",
          method: "initialized",
          params: {},
        });
        const policy = codexPolicy(config.mode, profile.cwd);
        const thread = await connection.rpc(
          saved.threadId ? "thread/resume" : "thread/start",
          {
            ...(saved.threadId ? { threadId: saved.threadId } : {}),
            cwd: profile.cwd,
            ...(profile.model ? { model: profile.model } : {}),
            approvalPolicy: policy.approvalPolicy,
            sandbox: policy.sandbox,
          },
        );
        session.cli.threadId = thread?.thread?.id;
        if (!session.cli.threadId)
          throw new Error("Codex did not return a thread ID");
        checkpoint?.();
        const result = await connection.rpc("turn/start", {
          threadId: session.cli.threadId,
          input: [{ type: "text", text: message }],
          cwd: profile.cwd,
          approvalPolicy: policy.approvalPolicy,
          sandboxPolicy: policy.sandboxPolicy,
        });
        session.cli.turnId = result?.turn?.id;
      } else if (profile.protocol === "claude-code") {
        const timer = setTimeout(
          () =>
            fail(
              new Error(
                "Claude Code did not complete its stream-json initialization. Check the selected executable and CLI version.",
              ),
            ),
          30000,
        );
        try {
          await connection.write({
            type: "control_request",
            request_id: initializationId,
            request: { subtype: "initialize", hooks: {} },
          });
          await Promise.race([initialization, turn]);
        } finally {
          clearTimeout(timer);
        }
        await connection.write({
          type: "user",
          message: { role: "user", content: message },
          parent_tool_use_id: null,
          session_id: session.cli.sessionId ?? "",
        });
      } else {
        await connection.write({ id: randomUUID(), type: "get_state" });
        await connection.write({ id: randomUUID(), type: "prompt", message });
      }
    }
    await turn;
    onTask?.({
      id: taskId,
      title: `${profile.name} CLI`,
      status: "done",
      recoverable: false,
    });
    return { text, taskId, session: session.cli };
  } finally {
    signal?.removeEventListener("abort", abort);
    if (
      !complete &&
      signal?.aborted &&
      profile.protocol === "codex" &&
      session.cli.threadId &&
      session.cli.turnId
    )
      await connection
        .write({
          jsonrpc: "2.0",
          id: ++connection.sequence,
          method: "turn/interrupt",
          params: {
            threadId: session.cli.threadId,
            turnId: session.cli.turnId,
          },
        })
        .catch(() => {});
    await connection.close();
  }
}
