const units = {
  B: 1n,
  kB: 1000n,
  MB: 1000n ** 2n,
  GB: 1000n ** 3n,
  TB: 1000n ** 4n,
  KiB: 1024n,
  MiB: 1024n ** 2n,
  GiB: 1024n ** 3n,
  TiB: 1024n ** 4n,
};
function decimal(n, d) {
  let value = String(n / d),
    r = n % d;
  if (r) value += ".";
  while (r) {
    r *= 10n;
    value += String(r / d);
    r %= d;
  }
  return value;
}
export function calculate(text, { unit = "MiB" }, zh) {
  const m = /^(\d{1,30})(?:\.(\d{1,12}))?$/.exec(text.trim());
  if (!m || !Object.hasOwn(units, unit))
    return {
      error: true,
      text: zh
        ? "请输入非负数（最多 30 位整数、12 位小数）并选择单位。"
        : "Enter a nonnegative decimal (up to 30 whole and 12 fractional digits) and choose a unit.",
    };
  const frac = m[2] ?? "",
    n = BigInt(m[1] + frac) * units[unit],
    d = 10n ** BigInt(frac.length);
  return {
    title: zh ? "精确换算" : "Exact equivalents",
    text: Object.entries(units)
      .map(([u, f]) => `${decimal(n, d * f)} ${u}`)
      .join("\n"),
  };
}
