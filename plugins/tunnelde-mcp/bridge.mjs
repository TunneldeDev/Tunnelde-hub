import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const MAX_BYTES = 1024 * 1024;
function endpoint(value) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/mcp" ||
    url.search ||
    url.hash
  )
    throw new Error("TUNNELDE_MCP_URL must be an HTTP loopback /mcp endpoint");
  return url;
}
async function boundedJSON(response) {
  if (Number(response.headers.get("content-length")) > MAX_BYTES)
    throw new Error("MCP response exceeds 1 MiB");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BYTES) throw new Error("MCP response exceeds 1 MiB");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** This bridge starts no SSH connections itself; Tunnelde must already run the approved plugin. */
export async function runBridge({
  url = process.env.TUNNELDE_MCP_URL,
  token = process.env.TUNNELDE_MCP_TOKEN,
  input = process.stdin,
  output = process.stdout,
  error = process.stderr,
  fetchImpl = fetch,
} = {}) {
  const target = endpoint(url);
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new Error("TUNNELDE_MCP_TOKEN must be a client token created in Tunnelde");
  let session = null;
  let version = null;
  let initializing = null;
  let readying = null;
  let closed = false;
  const controllers = new Set();
  const pending = new Set();
  const ids = new Set();
  const emit = (value) => {
    if (!closed) output.write(JSON.stringify(value) + "\n");
  };
  const fail = (id, message, code = -32000) =>
    emit({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  async function post(message) {
    const controller = new AbortController();
    controllers.add(controller);
    try {
      const response = await fetchImpl(target, {
        method: "POST",
        redirect: "error",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          ...(session ? { "mcp-session-id": session } : {}),
          ...(version ? { "mcp-protocol-version": version } : {}),
        },
        body: JSON.stringify(message),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(145000)]),
      });
      if (response.status === 202) return;
      if (response.status === 401)
        throw new Error("MCP client authorization was revoked or the token is invalid");
      if (response.status === 404)
        throw new Error("MCP session expired; restart this bridge to initialize again");
      if (!String(response.headers.get("content-type") ?? "").includes("application/json"))
        throw new Error(`Unexpected MCP response (HTTP ${response.status})`);
      const value = await boundedJSON(response);
      if (!response.ok && !value.error) throw new Error(`MCP HTTP ${response.status}`);
      if (
        !value ||
        value.jsonrpc !== "2.0" ||
        value.id !== message.id ||
        (!Object.hasOwn(value, "result") && !Object.hasOwn(value, "error"))
      )
        throw new Error("Invalid MCP response");
      if (message.method === "initialize" && value.result) {
        const assigned = response.headers.get("mcp-session-id");
        if (
          !assigned ||
          !/^[\x21-\x7e]{1,256}$/.test(assigned) ||
          typeof value.result.protocolVersion !== "string"
        )
          throw new Error("Server did not return a valid initialized session");
        session = assigned;
        version = value.result.protocolVersion;
      }
      if (Object.hasOwn(message, "id")) emit(value);
    } finally {
      controllers.delete(controller);
    }
  }
  async function handle(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return fail(null, "Invalid JSON", -32700);
    }
    if (
      !message ||
      typeof message !== "object" ||
      Array.isArray(message) ||
      message.jsonrpc !== "2.0" ||
      typeof message.method !== "string" ||
      (Object.hasOwn(message, "id") &&
        !(typeof message.id === "string" || Number.isSafeInteger(message.id)))
    )
      return fail(null, "Invalid MCP request", -32600);
    const id = Object.hasOwn(message, "id") ? JSON.stringify(message.id) : null;
    if (id !== null && ids.has(id))
      return fail(message.id, "Duplicate in-flight request ID", -32600);
    if (id !== null) ids.add(id);
    try {
      if (message.method === "initialize") {
        if (session || initializing) throw new Error("Bridge is already initialized");
        initializing = post(message);
        await initializing;
      } else {
        if (initializing) await initializing;
        if (!session) throw new Error("Initialize this bridge first");
        if (message.method === "notifications/initialized") {
          readying = post(message);
          await readying;
        } else {
          if (readying) await readying;
          await post(message);
        }
      }
    } catch (cause) {
      if (id !== null)
        fail(message.id, String(cause?.message ?? "MCP bridge failed").slice(0, 1000));
      else error.write("Tunnelde MCP notification could not be delivered.\n");
    } finally {
      if (id !== null) ids.delete(id);
    }
  }
  const brokenOutput = () => {
    closed = true;
    for (const controller of controllers) controller.abort();
    input.destroy();
  };
  output.on("error", brokenOutput);
  let buffer = Buffer.alloc(0);
  try {
    for await (const chunk of input) {
      buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      let end;
      while ((end = buffer.indexOf(10)) >= 0) {
        if (end > 256 * 1024) throw new Error("MCP input line exceeds 256 KiB");
        const line = buffer.subarray(0, end).toString("utf8").trim();
        buffer = buffer.subarray(end + 1);
        if (!line) continue;
        if (pending.size >= 32) throw new Error("Too many outstanding bridge messages");
        const task = handle(line);
        pending.add(task);
        void task.finally(() => pending.delete(task));
      }
      if (buffer.length > 256 * 1024) throw new Error("MCP input line exceeds 256 KiB");
    }
    if (buffer.length && buffer.toString("utf8").trim()) await handle(buffer.toString("utf8"));
    await Promise.allSettled(pending);
  } finally {
    for (const controller of controllers) controller.abort();
    if (session) {
      await fetchImpl(target, {
        method: "DELETE",
        redirect: "error",
        headers: {
          authorization: `Bearer ${token}`,
          "mcp-session-id": session,
          "mcp-protocol-version": version,
        },
        signal: AbortSignal.timeout(2000),
      }).catch(() => {});
    }
    closed = true;
    output.removeListener("error", brokenOutput);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runBridge().catch(() => {
    process.stderr.write(
      "Tunnelde MCP bridge failed. Check that the app plugin is listening and URL/token environment variables are configured.\n",
    );
    process.exitCode = 1;
  });
}
