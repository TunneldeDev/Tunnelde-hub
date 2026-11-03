import readline from "node:readline";
import { pathToFileURL } from "node:url";
export const renderView = () => ({
  title: "SSHFS",
  blocks: [{ type: "mounts" }],
});
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  readline.createInterface({ input: process.stdin }).on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.id === undefined) return;
    const { id, method } = message;
    const write = (payload) =>
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, ...payload })}\n`,
      );
    if (method === "initialize") write({ result: { ok: true } });
    else if (method === "view.render" && message.params?.view === "main")
      write({ result: renderView() });
    else if (method === "shutdown") {
      write({ result: null });
      process.exit(0);
    } else write({ error: { code: -32601, message: "Unknown method" } });
  });
}
