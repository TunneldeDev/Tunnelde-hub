import { realpath } from "node:fs/promises";
import path from "node:path";

export async function canonicalWithin(value, root, { allowMissing = false } = {}) {
  const base = await realpath(root);
  const target = path.resolve(base, value || ".");
  let resolved;
  try {
    resolved = await realpath(target);
  } catch (error) {
    if (!allowMissing || error.code !== "ENOENT") return false;
    try {
      resolved = path.join(await realpath(path.dirname(target)), path.basename(target));
    } catch {
      return false;
    }
  }
  const relative = path.relative(base, resolved);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

/** Pi RPC extension: return every built-in tool decision to Tunnelde's controller. */
export default function tunneldePermissions(pi) {
  pi.on("tool_call", async (event, context) => {
    if (["read", "write", "edit", "grep", "find", "ls"].includes(event.toolName)) {
      if (
        !(await canonicalWithin(event.input?.path ?? ".", context.cwd, {
          allowMissing: event.toolName === "write",
        }))
      )
        return { block: true, reason: "Tool path is outside the canonical working directory" };
    }
    const allowed = await context.ui.confirm(
      "Tunnelde tool approval",
      JSON.stringify({ tool: event.toolName, input: event.input }),
    );
    return allowed ? undefined : { block: true, reason: "Tunnelde denied this tool request" };
  });
}
