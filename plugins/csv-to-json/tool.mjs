export function calculate(source, { delimiter = "comma" }, zh) {
  const d = new Map([
    ["comma", ","],
    ["tab", "\t"],
    ["semicolon", ";"],
  ]).get(delimiter);
  if (!d)
    return { error: true, text: zh ? "请选择有效的分隔符。" : "Select a supported delimiter." };
  const rows = [];
  let row = [],
    field = "",
    quoted = false,
    closed = false,
    line = 1,
    cells = 0;
  const err = () => ({
    error: true,
    text: zh
      ? `第 ${line} 行的引号不匹配。字段中的双引号请写成两个双引号。`
      : `Invalid quoting at line ${line}. Double quotes inside quoted fields must be doubled.`,
  });
  const push = () => {
    row.push(field);
    field = "";
    closed = false;
    cells++;
  };
  const s = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (cells >= 16384)
      return {
        error: true,
        text: zh ? "请将输入限制在 16384 个单元格内。" : "Use at most 16384 cells per conversion.",
      };
    if (c === '"') {
      if (quoted && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted) {
        quoted = false;
        closed = true;
      } else if (!closed && !field) {
        quoted = true;
      } else return err();
    } else if (!quoted && c === d) push();
    else if (c === "\r" || c === "\n") {
      const nl = c === "\r" && s[i + 1] === "\n" ? (i++, "\r\n") : c;
      line++;
      if (quoted) field += nl;
      else {
        push();
        rows.push(row);
        row = [];
      }
    } else if (closed) return err();
    else field += c;
  }
  if (quoted) return err();
  if (field || closed || row.length) {
    push();
    rows.push(row);
  }
  if (cells > 16384)
    return {
      error: true,
      text: zh ? "请将输入限制在 16384 个单元格内。" : "Use at most 16384 cells per conversion.",
    };
  return {
    title: zh ? `${rows.length} 行数据` : `Rows: ${rows.length}`,
    text: JSON.stringify(rows, null, 2),
  };
}
