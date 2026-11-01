import { randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPlugin } from "./lib/tunnelde-plugin.mjs";
import { createMcpServer, createToken, tokenHash } from "./server.mjs";
import { reviewAction } from "./reviewer.mjs";

const MODES = ["ask", "approve", "full", "readOnly"];
const STATE_KEY = "mcp.state.v1";
const REVIEW_KEY = "mcp.reviewer.apiKey";
const blank = () => ({
  version: 1,
  port: 47691,
  clients: [],
  reviewer: { baseURL: "", model: "" },
});
const text = (value, max = 500) => (typeof value === "string" ? value.trim().slice(0, max) : "");
function validScope(scope) {
  return (
    scope &&
    typeof scope === "object" &&
    ["sessionIds", "hostIds", "localRoots"].every(
      (key) =>
        Array.isArray(scope[key]) &&
        scope[key].length <= 64 &&
        scope[key].every(
          (value) => typeof value === "string" && value.length > 0 && value.length <= 32768,
        ),
    ) &&
    Array.isArray(scope.remoteRoots) &&
    scope.remoteRoots.length <= 64 &&
    scope.remoteRoots.every(
      (root) =>
        typeof root?.sessionId === "string" &&
        typeof root?.path === "string" &&
        root.path.startsWith("/") &&
        !root.path.split("/").includes(".."),
    )
  );
}
function validateState(value) {
  if (
    !value ||
    value.version !== 1 ||
    !Number.isInteger(value.port) ||
    value.port < 1024 ||
    value.port > 65535 ||
    !Array.isArray(value.clients) ||
    value.clients.length > 32 ||
    !value.reviewer ||
    typeof value.reviewer.baseURL !== "string" ||
    typeof value.reviewer.model !== "string"
  )
    throw new Error("Stored MCP settings are invalid. Reset settings from the plugin view.");
  const ids = new Set();
  for (const client of value.clients) {
    if (
      !client ||
      typeof client.id !== "string" ||
      ids.has(client.id) ||
      typeof client.name !== "string" ||
      !MODES.includes(client.mode) ||
      !/^[a-f0-9]{64}$/.test(client.tokenHash) ||
      !validScope(client.scope)
    )
      throw new Error(
        "Stored MCP client settings are invalid. Reset settings from the plugin view.",
      );
    ids.add(client.id);
  }
  return value;
}
export function createController(host) {
  let state = blank();
  let server = null;
  let loadError = null;
  let queue = Promise.resolve();
  const serial = (action) => {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  };
  const persist = async (next) => {
    await host.call("storage.set", { key: STATE_KEY, value: next });
    state = next;
  };
  const publish = () =>
    host
      .call("events.publish", {
        event: "mcp.status",
        payload: {
          running: !!server?.url,
          url: server?.url ?? null,
          clients: state.clients.length,
        },
      })
      .catch(() => {});
  async function initialize() {
    const description = await host.call("api.describe");
    for (const name of [
      "tools.invoke",
      "tools.cancel",
      "tools.revokeClient",
      "secrets.get",
      "secrets.set",
    ]) {
      if (!description?.methods?.some((method) => method.name === name))
        throw new Error(
          "This plugin requires a Tunnelde version with the scoped tools and secrets host APIs.",
        );
    }
    const saved = await host.call("storage.get", { key: STATE_KEY });
    if (saved !== null && saved !== undefined) {
      try {
        state = validateState(saved);
      } catch (error) {
        loadError = error.message;
      }
    }
    return { ok: true, listening: false };
  }
  async function stop() {
    const active = server;
    server = null;
    if (active) await active.stop();
    await publish();
  }
  function scopeFrom(input) {
    const sessionId = text(input.sessionId, 128);
    const hostId = text(input.hostId, 128);
    const localRoot = text(input.localRoot, 32768);
    const remoteRoot = text(input.remoteRoot, 32768);
    if (localRoot && !isAbsolute(localRoot))
      throw new Error("The local root must be an absolute folder path.");
    if (
      remoteRoot &&
      (!sessionId || !remoteRoot.startsWith("/") || remoteRoot.split("/").includes(".."))
    )
      throw new Error("Choose a session and an absolute remote root without '..'.");
    return {
      sessionIds: sessionId ? [sessionId] : [],
      hostIds: hostId ? [hostId] : [],
      localRoots: localRoot ? [localRoot] : [],
      remoteRoots: remoteRoot ? [{ sessionId, path: remoteRoot }] : [],
    };
  }
  async function run(command, input = {}) {
    return serial(async () => {
      const zh = String(input._locale ?? "").startsWith("zh");
      const done = (en, cn = en) => ({ text: zh ? cn : en });
      if (command === "reset") {
        if (
          !(await host.call("ui.confirm", {
            message: zh
              ? "停止 MCP 并撤销所有客户端？此操作无法撤销。"
              : "Stop MCP and revoke every client? This cannot be undone.",
          }))
        )
          return done("Cancelled.", "已取消。");
        await stop();
        await persist(blank());
        await host.call("secrets.delete", { key: REVIEW_KEY });
        loadError = null;
        return done(
          "MCP settings reset. All old client tokens are invalid.",
          "MCP 设置已重置，旧客户端密钥均已失效。",
        );
      }
      if (loadError) throw new Error(loadError);
      if (command === "start") {
        if (server?.url) return done(`Listening: ${server.url}`, `正在监听：${server.url}`);
        if (state.clients.length === 0)
          throw new Error(
            zh
              ? "请先创建并限制一个客户端。"
              : "Create a scoped client before starting the listener.",
          );
        const port = Number(input.port ?? state.port);
        if (!Number.isInteger(port) || port < 1024 || port > 65535)
          throw new Error("Port must be between 1024 and 65535.");
        await persist({ ...state, port });
        const instance = createMcpServer({
          clients: () => state.clients,
          invoke: (params, signal) =>
            host.call("tools.invoke", params, { signal, timeoutMs: 120000 }),
          cancel: (requestId) => host.call("tools.cancel", { requestId }),
          revoke: (clientId) => host.call("tools.revokeClient", { clientId }),
          reviewer: async (action, signal) => {
            try {
              return await reviewAction(
                state.reviewer,
                await host.call("secrets.get", { key: REVIEW_KEY }),
                action,
                signal,
              );
            } catch {
              return {
                approved: false,
                reason: "Reviewer credentials are unavailable; ask the user.",
              };
            }
          },
          onSessionConnected: (clientId, session) =>
            serial(async () => {
              const client = state.clients.find((item) => item.id === clientId);
              if (!client || !client.scope.hostIds.includes(session.hostId)) return;
              const next = structuredClone(state);
              const scope = next.clients.find((item) => item.id === clientId).scope;
              if (!scope.sessionIds.includes(session.id)) scope.sessionIds.push(session.id);
              await persist(next);
            }),
        });
        try {
          await instance.start(port);
          server = instance;
        } catch (error) {
          await instance.stop();
          throw error;
        }
        await publish();
        return done(
          `Listening: ${server.url}\nKeep Tunnelde open. Add this URL and a client bearer token to your MCP client.`,
          `正在监听：${server.url}\n请保持 Tunnelde 运行，并将此地址和客户端密钥添加至 MCP 客户端。`,
        );
      }
      if (command === "stop") {
        await stop();
        return done(
          "Listener stopped; active calls, owned tasks and transfers were cancelled.",
          "监听已停止，活动调用、所属任务及传输已取消。",
        );
      }
      if (command === "client.create" || command === "client.update") {
        const mode = text(input.mode, 32);
        if (!MODES.includes(mode)) throw new Error("Choose an approval mode.");
        const name = text(input.name, 80);
        if (!name) throw new Error("A client name is required.");
        const scope = scopeFrom(input);
        if (
          mode === "full" &&
          !(await host.call("ui.confirm", {
            message: `${name}: ${zh ? "允许在所选范围内自动执行，包括删除文件与运行任意命令？" : "Allow automatic execution within the selected scope, including file deletion and arbitrary commands?"}\n${JSON.stringify(scope, null, 2)}`,
          }))
        )
          return done("Cancelled.", "已取消。");
        if (command === "client.update") {
          const id = text(input.clientId, 128);
          const existing = state.clients.find((client) => client.id === id);
          if (!existing) throw new Error("Client no longer exists. Refresh the plugin view.");
          if (server) await server.revokeClient(id);
          else await host.call("tools.revokeClient", { clientId: id });
          await persist({
            ...state,
            clients: state.clients.map((client) =>
              client.id === id ? { ...client, name, mode, scope } : client,
            ),
          });
          server?.resumeClient(id);
          return done(
            "Client scope updated. Existing sessions were ended; reconnect the MCP client.",
            "客户端范围已更新，原会话已关闭，请重新连接 MCP 客户端。",
          );
        }
        if (state.clients.length >= 32) throw new Error("At most 32 MCP clients are supported.");
        const token = createToken();
        const client = {
          id: randomUUID(),
          name,
          mode,
          scope,
          tokenHash: tokenHash(token),
          createdAt: new Date().toISOString(),
        };
        await persist({ ...state, clients: [...state.clients, client] });
        await publish();
        return done(
          `Client created: ${name}\nToken (shown once): ${token}\nURL: ${server?.url ?? `http://127.0.0.1:${state.port}/mcp`}\nStore the token in your MCP client's protected environment settings. Refresh this view to manage the client.`,
          `客户端已创建：${name}\n密钥（仅显示一次）：${token}\n地址：${server?.url ?? `http://127.0.0.1:${state.port}/mcp`}\n请将密钥保存在 MCP 客户端受保护的环境设置中。刷新此页面可管理客户端。`,
        );
      }
      if (command === "client.revoke") {
        const id = text(input.clientId, 128);
        const client = state.clients.find((item) => item.id === id);
        if (!client) return done("Client was already revoked.", "客户端已被撤销。");
        // Immediately stop accepting its token while persistent revocation and cleanup run.
        const previous = state;
        if (server) await server.revokeClient(id);
        else await host.call("tools.revokeClient", { clientId: id });
        state = { ...state, clients: state.clients.filter((item) => item.id !== id) };
        try {
          await persist(state);
        } catch (error) {
          await stop();
          state = previous;
          throw error;
        }
        await publish();
        return done(
          "Client revoked. Its token and MCP sessions are invalid; active work was cancelled.",
          "客户端已撤销，其密钥和 MCP 会话均已失效，活动工作已取消。",
        );
      }
      if (command === "reviewer.save") {
        const baseURL = text(input.baseURL, 2000),
          model = text(input.model, 200),
          apiKey = text(input.apiKey, 16000);
        if (baseURL || model || apiKey) {
          const parsed = new URL(baseURL);
          if (
            (parsed.protocol !== "https:" &&
              !(
                parsed.protocol === "http:" &&
                ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
              )) ||
            parsed.username ||
            parsed.password ||
            parsed.search ||
            parsed.hash ||
            !model
          )
            throw new Error(
              "Use an HTTPS (or loopback HTTP) OpenAI-compatible base URL and model.",
            );
          if (apiKey) await host.call("secrets.set", { key: REVIEW_KEY, value: apiKey });
        } else await host.call("secrets.delete", { key: REVIEW_KEY });
        await persist({ ...state, reviewer: { baseURL, model } });
        return done(
          "Reviewer saved. Blank key retains the existing key. Clearing URL/model disables review; uncertainty always asks the user.",
          "审核器已保存。密钥留空保留原密钥；清空地址和模型可禁用。未通过明确审核的操作均转人工确认。",
        );
      }
      throw new Error("Unknown MCP plugin command");
    });
  }
  async function render(view, locale = "en") {
    if (view !== "main") throw new Error("Unknown MCP view");
    const zh = locale.startsWith("zh");
    const label = (en, cn) => (zh ? cn : en);
    const field = (id, title, value = "", type = "text", options) => ({
      id,
      label: title,
      value,
      type,
      ...(options ? { options } : {}),
    });
    const action = (command, title) => ({ id: command, command, label: title });
    const form = (id, fields, actions) => ({ type: "form", id, fields, actions });
    const blocks = [
      { type: "heading", text: label("MCP access", "MCP 访问") },
      {
        type: "text",
        text: label(
          "Local automation for approved SSH sessions, files and background tasks. Start the listener explicitly; restricted mode or stopping the plugin terminates it. Client tokens grant only the scope you select. Restart the listener after restarting Tunnelde.",
          "为授权的 SSH 会话、文件和后台任务提供本地自动化。需手动开启监听；受限模式或停止插件会终止监听。客户端密钥仅能访问所选范围。Tunnelde 重启后需重新开启监听。",
        ),
      },
      {
        type: "kv",
        items: [
          { label: label("Listener", "监听"), value: server?.url ?? label("Stopped", "已停止") },
          { label: label("Clients", "客户端"), value: String(state.clients.length) },
        ],
      },
    ];
    if (loadError)
      return {
        title: "Tunnelde MCP",
        blocks: [
          ...blocks,
          { type: "text", text: loadError },
          form("reset", [], [action("reset", label("Reset invalid settings", "重置无效设置"))]),
        ],
      };
    blocks.push(
      form(
        "listener",
        [field("port", label("Loopback port", "本地端口"), String(state.port))],
        [
          action("start", label("Start listener", "开启监听")),
          action("stop", label("Stop and cancel active work", "停止并取消活动工作")),
        ],
      ),
    );
    const [sessions, snapshot] = await Promise.all([
      host.call("sessions.list").catch(() => []),
      host.call("hosts.snapshot").catch(() => ({ hosts: [] })),
    ]);
    const sessionsOptions = [
      { value: "", label: label("No SSH session access", "不允许访问 SSH 会话") },
      ...sessions.map((item) => ({
        value: item.id,
        label: `${item.title ?? item.address ?? item.hostId} (${item.id.slice(0, 8)})`,
      })),
    ];
    const hostsOptions = [
      { value: "", label: label("No new SSH connections", "不允许创建 SSH 连接") },
      ...(snapshot.hosts ?? []).map((item) => ({
        value: item.id,
        label: `${item.name} (${item.username}@${item.host})`,
      })),
    ];
    const modeOptions = [
      { value: "ask", label: label("Ask for approval", "更改前询问") },
      {
        value: "approve",
        label: label("Approve for me", "独立 AI 审核，否则询问"),
      },
      { value: "full", label: label("Full Access", "范围内完全自动") },
      { value: "readOnly", label: label("ReadOnly", "只读，禁止执行命令") },
    ];
    const clientFields = (client) => [
      ...(client
        ? [
            field("clientId", label("Client", "客户端"), client.id, "select", [
              { value: client.id, label: client.name },
            ]),
          ]
        : []),
      field("name", label("Client name", "客户端名称"), client?.name ?? ""),
      field(
        "mode",
        label("Approval mode", "审批模式"),
        client?.mode ?? "ask",
        "select",
        modeOptions,
      ),
      field(
        "sessionId",
        label("Existing SSH session", "现有 SSH 会话"),
        client?.scope.sessionIds[0] ?? "",
        "select",
        sessionsOptions,
      ),
      field(
        "hostId",
        label("Saved host allowed to connect", "允许连接的已保存主机"),
        client?.scope.hostIds[0] ?? "",
        "select",
        hostsOptions,
      ),
      field(
        "localRoot",
        label(
          "Local folder (absolute path; blank denies local files)",
          "本地目录（绝对路径，留空禁止访问本地文件）",
        ),
        client?.scope.localRoots[0] ?? "",
      ),
      field(
        "remoteRoot",
        label(
          "Remote folder for selected session (absolute path)",
          "所选会话的远程目录（绝对路径）",
        ),
        client?.scope.remoteRoots[0]?.path ?? "",
      ),
    ];
    blocks.push(
      { type: "heading", text: label("Create a client", "创建客户端") },
      form("new-client", clientFields(), [
        action("client.create", label("Create scoped token", "创建受限密钥")),
      ]),
    );
    for (const client of state.clients)
      blocks.push(
        { type: "heading", text: client.name },
        form(`client-${client.id}`, clientFields(client), [
          action("client.update", label("Save scope and reconnect", "保存范围并重新连接")),
          action("client.revoke", label("Revoke client and cancel work", "撤销客户端并取消工作")),
        ]),
      );
    blocks.push(
      { type: "heading", text: label("Independent reviewer", "独立审核器") },
      {
        type: "text",
        text: label(
          "Optional. Sends exact tool arguments and approved scope to your chosen model service. Never use the requesting client's own approval. Keep keys in the OS keyring. Missing or failed review falls back to an in-app confirmation.",
          "可选。将完整工具参数和授权范围发送至您指定的模型服务，不使用请求客户端自报的批准结果。密钥保存在系统密钥库中。未配置、失败或不明确的审核均回退至应用内确认。",
        ),
      },
      form(
        "reviewer",
        [
          field("baseURL", "OpenAI-compatible base URL", state.reviewer.baseURL),
          field("model", label("Model", "模型"), state.reviewer.model),
          field(
            "apiKey",
            label("API key (blank keeps existing)", "API 密钥（留空保留原密钥）"),
            "",
            "password",
          ),
        ],
        [action("reviewer.save", label("Save reviewer", "保存审核器"))],
      ),
    );
    return { title: "Tunnelde MCP", blocks };
  }
  return Object.freeze({ initialize, run, render, stop });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let controller;
  createPlugin({
    initialize: async (_, host) => {
      controller = createController(host);
      return controller.initialize();
    },
    run: (command, input) => {
      if (!controller) throw new Error("Initialize the plugin first");
      return controller.run(command, input);
    },
    render: (view, locale) => {
      if (!controller) throw new Error("Initialize the plugin first");
      return controller.render(view, locale);
    },
    shutdown: () => controller?.stop(),
  });
  process.stdin.on("end", () => {
    void (controller?.stop() ?? Promise.resolve()).finally(() => process.exit(0));
  });
}
