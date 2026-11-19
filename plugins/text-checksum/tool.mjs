import { createHash } from "node:crypto";
export function calculate(text, { algorithm = "SHA-256" }, zh) {
  if (!["SHA-256", "SHA-512"].includes(algorithm))
    return {
      error: true,
      text: zh ? "请选择有效的摘要算法。" : "Choose a supported digest algorithm.",
    };
  const bytes = Buffer.from(text, "utf8");
  return {
    title: `${algorithm} · ${bytes.length} ${zh ? "字节" : "bytes"}`,
    text: createHash(algorithm.replace("-", "").toLowerCase()).update(bytes).digest("hex"),
  };
}
