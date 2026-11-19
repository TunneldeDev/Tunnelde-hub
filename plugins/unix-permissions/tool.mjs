const valid = /^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/;
export function calculate(text, _input, zh) {
  let mode = 0;
  const s = text.trim();
  if (/^[0-7]{3,4}$/.test(s)) mode = parseInt(s, 8);
  else if (valid.test(s))
    for (let i = 0; i < 9; i++) {
      if ("rwxts".includes(s[i])) mode |= 1 << (8 - i);
      if ("sStT".includes(s[i])) mode |= 1 << (11 - Math.floor(i / 3));
    }
  else
    return {
      error: true,
      text: zh
        ? "请输入 3–4 位八进制数或 9 个权限字符，例如 0644 或 rw-r--r--。"
        : "Use 3–4 octal digits or nine permission characters, e.g. 0644 or rw-r--r--.",
    };
  let symbols = "";
  for (let i = 0; i < 9; i++) {
    const on = (mode & (1 << (8 - i))) !== 0,
      sp = i % 3 === 2 && mode & (1 << (11 - Math.floor(i / 3)));
    symbols += sp ? (i === 8 ? (on ? "t" : "T") : on ? "s" : "S") : on ? "rwx"[i % 3] : "-";
  }
  return {
    title: zh ? "权限位" : "Permission bits",
    text:
      `${mode.toString(8).padStart(4, "0")}  ${symbols}\n` +
      (zh ? ["属主", "属组", "其他人"] : ["Owner", "Group", "Others"])
        .map((who, i) => `${who}: ${symbols.slice(i * 3, i * 3 + 3)}`)
        .join("\n"),
  };
}
