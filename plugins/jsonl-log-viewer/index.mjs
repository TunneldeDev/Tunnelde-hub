const MAX_INPUT = 128 * 1024;
const MAX_OUTPUT = 256 * 1024;
const levels = new Map([[10, "TRACE"], [20, "DEBUG"], [30, "INFO"], [40, "WARN"], [50, "ERROR"], [60, "FATAL"]]);
// Log data cannot inject terminal escapes or imitate a second record header.
function safe(value) {
  return String(value).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`)
    .replaceAll("\r\n", "\n").replaceAll("\r", "\n").replaceAll("\n", "\n    ");
}
function valueText(value) {
  if (typeof value === "string") return safe(value);
  return safe(JSON.stringify(value));
}
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && !JSON.isRawJSON(value); }
function parse(line) {
  return JSON.parse(line, (_key, value, context) => typeof value === "number" && !Number.isSafeInteger(value)
    && context?.source ? JSON.rawJSON(context.source) : value);
}
export function formatJSONL(source) {
  if (typeof source !== "string" || Buffer.byteLength(source) > MAX_INPUT) throw new Error("JSONL input exceeds 128 KiB");
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  const output = [], invalidLines = [];
  let parsed = 0, bytes = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) continue;
    let formatted;
    try {
      const record = parse(line);
      if (!object(record)) throw new Error("Expected an object");
      const fields = object(record.fields) ? record.fields : {};
      const timestamp = record.timestamp ?? record.time ?? record["@timestamp"] ?? "—";
      const level = record.level ?? record.severity ?? "INFO";
      const target = record.target ?? record.logger ?? record.module;
      const message = fields.message ?? record.message ?? record.msg ?? "";
      const extras = [];
      const used = new Set(["timestamp", "time", "@timestamp", "level", "severity", "target", "logger", "module", "message", "msg", "fields"]);
      for (const [key, value] of Object.entries(record)) if (!used.has(key)) extras.push(`${safe(key)}=${valueText(value)}`);
      if (record.fields !== undefined && !object(record.fields)) extras.push(`fields=${valueText(record.fields)}`);
      for (const [key, value] of Object.entries(fields)) if (key !== "message") extras.push(`${safe(key)}=${valueText(value)}`);
      const numericLevel = typeof level === "number" ? level : typeof level === "string" && /^\d+$/.test(level) ? Number(level) : undefined;
      formatted = `${valueText(timestamp)} [${levels.get(numericLevel) ?? valueText(level).toUpperCase()}]${target ? ` ${valueText(target)}:` : ""} ${valueText(message)}${extras.length ? ` | ${extras.join(" ")}` : ""}`;
      parsed++;
    } catch {
      invalidLines.push(index + 1);
      formatted = `[INVALID JSONL: line ${index + 1}] ${safe(line)}`;
    }
    bytes += Buffer.byteLength(formatted) + 1;
    if (bytes > MAX_OUTPUT) throw new Error("Readable log exceeds 256 KiB; use a smaller document");
    output.push(formatted);
  }
  return { text: output.join("\n") + (source.endsWith("\n") && output.length ? "\n" : ""), parsed, invalidLines };
}
export function runCommand(command, input = {}) {
  if (command !== "to-log") throw new Error("Unknown command");
  const zh = String(input._locale ?? "").startsWith("zh");
  try {
    const result = formatJSONL(String(input.source ?? ""));
    if (result.invalidLines.length && input.document) return { error: true, text: zh
      ? `第 ${result.invalidLines.join(", ")} 行不是 JSON 对象，原文未修改。请先修复这些行，或在插件页面预览。`
      : `Lines ${result.invalidLines.join(", ")} are not JSON objects. The document was not changed. Fix them or preview in the plugin page.` };
    let text = result.text;
    if (input.document && String(input.source).includes("\r\n")) text = text.replaceAll("\n", "\r\n");
    return { text, title: zh ? `已解析 ${result.parsed} 条，异常 ${result.invalidLines.length} 行` : `${result.parsed} records, ${result.invalidLines.length} invalid lines` };
  } catch (error) { return { error: true, text: error.message }; }
}
export function renderView(locale = "en") {
  const zh = locale.startsWith("zh");
  return { title: "JSONL Log Viewer", blocks: [
    { type: "text", text: zh ? "直接在打开的 .jsonl 或 .ndjson 编辑器中使用格式化快捷键（Windows/Linux: Ctrl+Shift+F，macOS: Cmd+Shift+F），或在 F1 中选择 JSONL 命令。仅替换编辑缓冲区，可撤销，不自动保存；原始文件保持不变直到你保存。下方也可预览单独的日志片段。" : "In an open .jsonl or .ndjson editor, use Ctrl+Shift+F (Cmd+Shift+F on macOS), or choose the JSONL command in F1. Conversion updates the undoable buffer without saving. You can also preview a log excerpt below." },
    { type: "form", id: "log", fields: [{ id: "source", type: "textarea", label: zh ? "JSONL 日志片段" : "JSONL log excerpt" }], actions: [{ id: "to-log", command: "to-log", label: zh ? "预览易读日志" : "Preview readable log" }] }
  ] };
}

import process from "node:process";
import { realpathSync } from "node:fs";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

function start() {
  const write = (payload) => process.stdout.write(JSON.stringify(payload) + "\n");
  readline.createInterface({ input: process.stdin }).on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } });
      return;
    }
    if (typeof message !== "object" || message === null || Array.isArray(message)) {
      write({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } });
      return;
    }
    const { id, method, params = {} } = message;
    if (id === undefined) return;
    try {
      let result;
      if (method === "initialize") result = { ok: true };
      else if (method === "view.render") {
        if (params.view !== "main") throw new Error("Unknown view");
        result = renderView(params.locale);
      } else if (method === "command.run") result = runCommand(params.command, params.input ?? {});
      else if (method === "shutdown") {
        write({ jsonrpc: "2.0", id, result: null });
        process.exit(0);
      } else {
        write({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown method" } });
        return;
      }
      write({ jsonrpc: "2.0", id, result });
    } catch (error) {
      write({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: error instanceof Error ? error.message : String(error) },
      });
    }
  });
}
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
)
  start();
