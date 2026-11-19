import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
const guide = JSON.parse(readFileSync(new URL("./guide.json", import.meta.url), "utf8"));
export const renderView = (id = "main") => id === "guide" ? guide : ({
  title: "SSHFS",
  blocks: [{ type: "sharedMounts" }],
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
    if (!message || typeof message !== "object" || Array.isArray(message) || message.id === undefined) return;
    const { id, method } = message;
    const write = (payload) =>
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, ...payload })}\n`,
      );
    if (method === "initialize") write({ result: { ok: true } });
    else if (method === "view.render" && ["main", "guide"].includes(message.params?.view))
      write({ result: renderView(message.params.view) });
    else if (method === "shutdown") {
      write({ result: null });
      process.exit(0);
    } else write({ error: { code: -32601, message: "Unknown method" } });
  });
}
