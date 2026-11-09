/** A dependency-free, bidirectional client for Tunnelde's bounded stdio protocol. */
export function createPlugin(
  { initialize, run, render, shutdown } = {},
  { input = process.stdin, output = process.stdout, timeout = 30000 } = {},
) {
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120000)
    throw new RangeError("timeout must be an integer between 1 and 120000 ms");
  let sequence = 0;
  let disposed = false;
  const pending = new Map();
  let frame = Buffer.alloc(0);
  let frameBytes = 0;
  function send(message) {
    if (disposed) throw new Error("Plugin transport is closed");
    const line = JSON.stringify(message)
      .replaceAll("\u2028", "\\u2028")
      .replaceAll("\u2029", "\\u2029");
    if (Buffer.byteLength(line, "utf8") > 1024 * 1024)
      throw new Error("Plugin message exceeds 1 MiB");
    output.write(line + "\n");
  }
  function call(method, params = {}, { signal, timeoutMs = timeout } = {}) {
    if (disposed)
      return Promise.reject(new Error("Plugin transport is closed"));
    if (signal?.aborted)
      return Promise.reject(signal.reason ?? new Error("Aborted"));
    if (pending.size >= 32)
      return Promise.reject(new Error("Too many outstanding host calls"));
    try {
      if (typeof method !== "string" || !method || method.length > 128)
        throw new TypeError("Invalid host method");
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000)
        throw new RangeError(
          "timeoutMs must be an integer between 1 and 120000 ms",
        );
      if (!params || typeof params !== "object" || Array.isArray(params))
        throw new TypeError("Host params must be an object");
      if (Buffer.byteLength(JSON.stringify(params), "utf8") > 256 * 1024)
        throw new RangeError("Host params exceed 256 KiB");
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const finish = (error, value) => {
        if (!pending.delete(id)) return;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        error ? reject(error) : resolve(value);
      };
      const abort = () => finish(signal.reason ?? new Error("Aborted"));
      const timer = setTimeout(
        () => finish(new Error(`Host call timed out: ${method}`)),
        timeoutMs,
      );
      pending.set(id, { finish });
      signal?.addEventListener("abort", abort, { once: true });
      try {
        send({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        finish(error);
      }
    });
  }
  const host = Object.freeze({
    call,
    tabBar: Object.freeze({
      set: (item) => call("tabBar.set", item),
      remove: (id) => call("tabBar.remove", { id }),
    }),
    statusBar: Object.freeze({
      set: (item) => call("statusBar.set", item),
      remove: (id) => call("statusBar.remove", { id }),
    }),
    describe: () => call("api.describe"),
    log: (message, options = "info") =>
      call("log", typeof options === "string" ? { message, level: options } : { ...options, message }),
  });
  function close() {
    if (disposed) return;
    disposed = true;
    for (const request of [...pending.values()])
      request.finish(new Error("Plugin transport closed"));
    input.removeListener("data", readChunk);
    input.removeListener("end", close);
    input.removeListener("close", close);
    input.removeListener("error", close);
    output.removeListener("error", close);
    frame = Buffer.alloc(0);
    frameBytes = 0;
  }
  async function receive(line) {
    if (Buffer.byteLength(line, "utf8") > 1024 * 1024) return close();
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (
      !message ||
      message.jsonrpc !== "2.0" ||
      !Number.isSafeInteger(message.id)
    )
      return;
    if (typeof message.method !== "string") {
      const request = pending.get(message.id);
      if (!request) return;
      const error = message.error
        ? Object.assign(
            new Error(message.error.message ?? "Host rejected the request"),
            { code: message.error.code, data: message.error.data },
          )
        : null;
      request.finish(error, message.result ?? null);
      return;
    }
    const params = message.params ?? {};
    let result;
    try {
      switch (message.method) {
        case "initialize":
          result = initialize ? await initialize(params, host) : { ok: true };
          break;
        case "command.run":
          if (!run) throw new Error("No command handler registered");
          result = await run(params.command, params.input ?? {}, host);
          break;
        case "view.render":
          if (!render) throw new Error("No view handler registered");
          result = await render(params.view, params.locale, host);
          break;
        case "shutdown":
          result = shutdown ? await shutdown(host) : null;
          break;
        default:
          throw new Error(`Unknown host method: ${message.method}`);
      }
      send({ jsonrpc: "2.0", id: message.id, result: result ?? null });
    } catch (error) {
      if (!disposed) {
        try {
          send({
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code: -32000,
              message: String(error?.message ?? error).slice(0, 4096),
            },
          });
        } catch {
          close();
        }
      }
    }
  }
  // JSONL uses LF, not Unicode line/paragraph separators inside JSON strings.
  // Bound incomplete frames too and decode only after split UTF-8 bytes rejoin.
  function readChunk(chunk) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let start = 0;
    while (start < bytes.length && !disposed) {
      const end = bytes.indexOf(10, start);
      const part = bytes.subarray(start, end < 0 ? bytes.length : end);
      const required = frameBytes + part.length;
      if (required > 1024 * 1024) return close();
      if (required > frame.length) {
        const expanded = Buffer.allocUnsafe(Math.max(required, Math.min(1024 * 1024, Math.max(1024, frame.length * 2))));
        frame.copy(expanded, 0, 0, frameBytes);
        frame = expanded;
      }
      part.copy(frame, frameBytes);
      frameBytes = required;
      if (end < 0) break;
      const line = frame.toString("utf8", 0, frameBytes);
      frameBytes = 0;
      void receive(line);
      start = end + 1;
    }
  }
  input.on("data", readChunk);
  input.on("end", close);
  input.on("close", close);
  input.on("error", close);
  output.on("error", close);
  return Object.freeze({ host, close });
}
