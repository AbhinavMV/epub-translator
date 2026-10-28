const MASK = "[redacted]";
const KNOWN_KEY_SHAPES = [/sk-ant-[\w-]+/g, /sk-(?:proj-)?[\w-]{8,}/g, /AIza[\w-]{30,}/g];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function redactKey(text: string, key: string): string {
  let out = text;
  if (key) {
    for (const form of new Set([key, encodeURIComponent(key), JSON.stringify(key).slice(1, -1)])) {
      out = out.split(form).join(MASK);
    }
    if (key.length >= 8) {
      const last4 = escapeRegExp(key.slice(-4));
      out = out.replace(new RegExp(`[\\w-]*(?:…|\\.{3}|\\*{2,})${last4}`, "g"), MASK);
    }
  }
  for (const shape of KNOWN_KEY_SHAPES) out = out.replace(shape, MASK);
  return out;
}
