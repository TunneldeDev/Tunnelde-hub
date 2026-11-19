import { serve } from "./runtime.mjs";
import { calculate } from "./tool.mjs";
export function renderView(locale) {
  const zh = String(locale).startsWith("zh");
  return {
    title: zh ? "文本校验和" : "Text Checksum",
    blocks: [
      {
        type: "text",
        text: zh
          ? "按原样计算所输入 UTF-8 文本的 SHA-256 或 SHA-512，包括换行。"
          : "Calculate SHA-256 or SHA-512 of exactly the UTF-8 text entered, including line endings.",
      },
      {
        type: "form",
        id: "main",
        fields: [
          {
            id: "source",
            type: "textarea",
            label: zh ? "UTF-8 文本" : "UTF-8 text",
            placeholder: "Hello",
          },
          {
            id: "algorithm",
            type: "select",
            label: zh ? "算法" : "Algorithm",
            value: "SHA-256",
            options: ["SHA-256", "SHA-512"].map((value) => ({ value, label: value })),
          },
        ],
        actions: [{ id: "digest", command: "digest", label: zh ? "计算摘要" : "Calculate digest" }],
      },
    ],
  };
}
export function runCommand(command, input) {
  if (command !== "digest") throw Error("Unknown command");
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
