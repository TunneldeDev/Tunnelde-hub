// Distributed inside each standalone local tool ZIP by sync-local-tools.mjs.
import readline from "node:readline";
export function serve(render, run) {
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  const send = (id, body) =>
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, ...body }) + "\n");
  let closed = false;
  lines.on("line", (line) => {
    if (closed || !line.trim()) return;
    if (Buffer.byteLength(line) > 1024 * 1024)
      return send(null, { error: { code: -32600, message: "Request too large" } });
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      return send(null, { error: { code: -32700, message: "Invalid JSON" } });
    }
    if (!req || typeof req !== "object" || Array.isArray(req))
      return send(null, { error: { code: -32600, message: "Invalid request" } });
    if (req.id === undefined) return;
    try {
      const p = req.params ?? {};
      switch (req.method) {
        case "initialize":
          return send(req.id, { result: { ok: true } });
        case "view.render":
          if (p.view !== "main") throw Error("Unknown view");
          return send(req.id, { result: render(p.locale) });
        case "command.run":
          return send(req.id, { result: run(p.command, p.input ?? {}) });
        case "shutdown":
          closed = true;
          lines.close();
          process.stdin.pause();
          return send(req.id, { result: null });
        default:
          return send(req.id, { error: { code: -32601, message: "Unknown method" } });
      }
    } catch (e) {
      send(req.id, { error: { code: -32602, message: e.message } });
    }
  });
}
