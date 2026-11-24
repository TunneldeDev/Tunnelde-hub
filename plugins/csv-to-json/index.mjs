import { serve } from "./runtime.mjs";
import { calculate } from "./tool.mjs";
export function renderView(locale) {
  const zh = String(locale).startsWith("zh");
  return {
    title: zh ? "CSV 转 JSON" : "CSV to JSON",
    blocks: [
      {
        type: "text",
        text: zh
          ? "将分隔文本预览为 JSON 数组；保留表头、重复列名和前导零，所有单元格均为字符串。"
          : "Preview delimited records as JSON arrays. All cells stay strings, including headers, leading zeros and duplicate names.",
      },
      {
        type: "form",
        id: "main",
        fields: [
          {
            id: "source",
            type: "textarea",
            label: zh ? "分隔文本" : "Delimited text",
            placeholder: "name,size\narchive,001",
          },
          {
            id: "delimiter",
            type: "select",
            label: zh ? "分隔符" : "Delimiter",
            value: "comma",
            options: ["comma", "tab", "semicolon"].map((value) => ({
              value,
              label: (zh
                ? { comma: "逗号 (,)", tab: "制表符", semicolon: "分号 (;)" }
                : { comma: "Comma (,)", tab: "Tab", semicolon: "Semicolon (;)" })[value],
            })),
          },
        ],
        actions: [
          { id: "convert", command: "convert", label: zh ? "转换记录" : "Convert records" },
        ],
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
