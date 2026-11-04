import assert from "node:assert/strict";

const symbols = new Set(["file", "code", "json", "text", "image", "audio", "video", "archive", "pdf", "spreadsheet", "terminal", "settings", "key", "database", "font", "binary", "markdown"]);
const validId = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
const text = (value, limit) => typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= limit && value.trim() === value && !/[\p{Cc}/\\:*?]/u.test(value);
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const only = (value, keys) => Object.keys(value).every((key) => keys.includes(key));

export function validateFileIconThemes(themes = []) {
  assert.ok(Array.isArray(themes) && themes.length <= 16, "Too many file icon themes");
  const ids = new Set();
  for (const theme of themes) {
    assert.ok(object(theme) && only(theme, ["id", "name", "icons", "extensions", "fileNames", "defaultIcon"]), "Invalid icon theme fields");
    assert.ok(validId(theme.id) && !ids.has(theme.id) && text(theme.name, 120), "Invalid icon theme identity");
    ids.add(theme.id);
    assert.ok(object(theme.icons) && Object.keys(theme.icons).length > 0 && Object.keys(theme.icons).length <= 256, "Invalid icon definitions");
    for (const [id, icon] of Object.entries(theme.icons)) {
      assert.ok(validId(id) && object(icon) && only(icon, ["symbol", "color", "label"]), "Invalid icon fields");
      assert.ok(symbols.has(icon.symbol), "Unknown icon symbol");
      assert.ok(icon.color === undefined || /^#[\da-f]{6}$/i.test(icon.color), "Invalid icon color");
      assert.ok(icon.label === undefined || /^[a-z0-9]{1,4}$/i.test(icon.label), "Invalid icon label");
    }
    for (const [field, limit, bytes] of [["extensions", 512, 64], ["fileNames", 128, 255]]) {
      const mapping = theme[field] ?? {};
      assert.ok(object(mapping) && Object.keys(mapping).length <= limit, "Invalid icon mapping");
      const seen = new Set();
      for (const [name, icon] of Object.entries(mapping)) {
        assert.ok(text(name, bytes) && !seen.has(name.toLowerCase()), "Invalid or duplicate icon mapping name");
        assert.ok(field !== "extensions" || (!name.startsWith(".") && !name.endsWith(".")), "Invalid extension");
        assert.ok(Object.hasOwn(theme.icons, icon), "Unknown icon reference");
        seen.add(name.toLowerCase());
      }
    }
    assert.ok(theme.defaultIcon === undefined || Object.hasOwn(theme.icons, theme.defaultIcon), "Unknown default icon");
  }
}

export function validateTags(tags = []) {
  assert.ok(Array.isArray(tags) && tags.length <= 24, "Too many tags");
  const seen = new Set();
  for (const tag of tags) {
    assert.ok(typeof tag === "string" && Buffer.byteLength(tag) <= 64 && /^[\p{L}\p{N}_.-]+$/u.test(tag) && !seen.has(tag.toLowerCase()), "Invalid or duplicate tag");
    seen.add(tag.toLowerCase());
  }
}
