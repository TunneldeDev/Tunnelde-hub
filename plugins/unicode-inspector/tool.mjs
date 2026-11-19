export function calculate(text, _input, zh) {
  // Keep segmentation cost and output bounded, especially on combining-mark runs.
  if (Array.from(text).length > 4096)
    return {
      error: true,
      text: zh
        ? "一次最多检查 4096 个码点，请选择较短片段。"
        : "Inspect up to 4096 code points at a time; choose a shorter excerpt.",
    };
  const codes = Array.from(text),
    count = Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
    ).length;
  const rows = codes.slice(0, 128).map((c, i) => {
    const cp = "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
    const glyph =
      c === " "
        ? "SPACE"
        : c === "\t"
          ? "TAB"
          : c === "\n"
            ? "LF"
            : c === "\r"
              ? "CR"
              : /[\p{C}\p{Z}]/u.test(c)
                ? "—"
                : c;
    return `${i + 1}\t${cp}\t${glyph}`;
  });
  if (codes.length > 128)
    rows.push(zh ? "仅显示前 128 个码点。" : "Showing the first 128 code points.");
  return {
    title: zh ? "字符统计" : "Character counts",
    text:
      (zh
        ? `字素：${count} · 码点：${codes.length} · UTF-8 字节：`
        : `Graphemes: ${count} · Code points: ${codes.length} · UTF-8 bytes: `) +
      Buffer.byteLength(text) +
      (rows.length ? "\n" + rows.join("\n") : ""),
  };
}
