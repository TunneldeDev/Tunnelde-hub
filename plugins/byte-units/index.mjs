import { serve } from "./runtime.mjs";
import { calculate } from "./tool.mjs";
export function renderView(locale) {
  const zh = String(locale).startsWith("zh");
  return {
    title: zh ? "容量换算" : "Byte Units",
    blocks: [
      {
        type: "text",
        text: zh
          ? "在字节、十进制和二进制单位间精确换算，支持小数输入。"
          : "Convert an integer or decimal quantity to bytes and common decimal and binary units, without floating-point rounding.",
      },
      {
        type: "form",
        id: "main",
        fields: [
          { id: "source", type: "text", label: zh ? "数值" : "Amount", placeholder: "1.5" },
          {
            id: "unit",
            type: "select",
            label: zh ? "输入单位" : "Input unit",
            value: "MiB",
            options: ["MiB", "B", "kB", "MB", "GB", "TB", "KiB", "GiB", "TiB"].map((value) => ({
              value,
              label: value,
            })),
          },
        ],
        actions: [{ id: "convert", command: "convert", label: zh ? "换算容量" : "Convert size" }],
      },
    ],
  };
}
export function runCommand(command, input) {
  if (command !== "convert") throw Error("Unknown command");
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
