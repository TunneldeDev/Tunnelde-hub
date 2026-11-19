import { serve } from "./runtime.mjs";
import { calculate } from "./tool.mjs";
export function renderView(locale) {
  const zh = String(locale).startsWith("zh");
  return {
    title: zh ? "Unix 权限解读" : "Unix Permissions",
    blocks: [
      {
        type: "text",
        text: zh
          ? "在八进制和符号表示之间转换 Unix 权限位，支持特殊位，不修改文件。"
          : "Translate Unix permission bits between octal and symbolic notation, including special bits. No files are changed.",
      },
      {
        type: "form",
        id: "main",
        fields: [
          {
            id: "source",
            type: "text",
            label: zh ? "八进制或符号权限" : "Octal or symbolic mode",
            placeholder: "0755",
          },
        ],
        actions: [
          { id: "inspect", command: "inspect", label: zh ? "解读权限" : "Inspect permissions" },
        ],
      },
    ],
  };
}
export function runCommand(command, input) {
  if (command !== "inspect") throw Error("Unknown command");
  const zh = String(input._locale).startsWith("zh");
  if (
    typeof (input.source ?? "") !== "string" ||
    Buffer.byteLength(input.source ?? "") > 128 * 1024
  )
    return {
      error: true,
      text: zh ? "请输入不超过 128 KiB 的文本。" : "Enter at most 128 KiB of text.",
    };
  return calculate(input.source ?? "", input, zh);
}
serve(renderView, runCommand);
