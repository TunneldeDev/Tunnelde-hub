import { serve } from "./runtime.mjs";
import { calculate } from "./tool.mjs";
export function renderView(locale) {
  const zh = String(locale).startsWith("zh");
  return {
    title: zh ? "Unicode 字符检查" : "Unicode Inspector",
    blocks: [
      {
        type: "text",
        text: zh
          ? "查看字素、码点和 UTF-8 字节数，标出空白与控制字符。"
          : "Inspect grapheme, code point and UTF-8 byte counts, with visible labels for whitespace and controls.",
      },
      {
        type: "form",
        id: "main",
        fields: [
          { id: "source", type: "textarea", label: zh ? "文本" : "Text", placeholder: "A中🙂" },
        ],
        actions: [{ id: "inspect", command: "inspect", label: zh ? "检查文本" : "Inspect text" }],
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
