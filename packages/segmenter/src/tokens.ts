export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;
export const CDATA_NODE = 4;

const BLOCK_NAMES = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "dt",
  "dd",
  "td",
  "th",
  "caption",
  "figcaption",
  "blockquote",
  "div",
]);

const ATOMIC_NAMES = new Set([
  "br",
  "img",
  "svg",
  "math",
  "code",
  "kbd",
  "var",
  "sup",
  "sub",
  "wbr",
]);

const RUBY_ANNOTATION_NAMES = new Set(["rt", "rp", "rtc"]);

export function nameOf(el: Element): string {
  return (el.localName ?? el.tagName).toLowerCase();
}

export function isBlockElement(el: Element): boolean {
  return BLOCK_NAMES.has(nameOf(el));
}

export function isRubyAnnotation(el: Element): boolean {
  return RUBY_ANNOTATION_NAMES.has(nameOf(el));
}

export function isAtomicElement(el: Element): boolean {
  return ATOMIC_NAMES.has(nameOf(el)) || el.childNodes.length === 0;
}

export function escapeText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function unescapeText(text: string): string {
  return text.replace(/&(amp|lt|gt);/g, (_, name: string) =>
    name === "amp" ? "&" : name === "lt" ? "<" : ">",
  );
}

export type Token =
  | { kind: "text"; value: string }
  | { kind: "open"; n: number }
  | { kind: "close"; n: number }
  | { kind: "atomic"; n: number };

export function tokenize(encoded: string): Token[] {
  const tokens: Token[] = [];
  const re = /<(\/?)(\d+)>|<x(\d+)\/>/g;
  let last = 0;
  for (let m = re.exec(encoded); m !== null; m = re.exec(encoded)) {
    if (m.index > last)
      tokens.push({ kind: "text", value: unescapeText(encoded.slice(last, m.index)) });
    if (m[3] !== undefined) tokens.push({ kind: "atomic", n: Number(m[3]) });
    else tokens.push({ kind: m[1] === "/" ? "close" : "open", n: Number(m[2]) });
    last = m.index + m[0].length;
  }
  if (last < encoded.length)
    tokens.push({ kind: "text", value: unescapeText(encoded.slice(last)) });
  return tokens;
}

export function stripTokens(encoded: string): string {
  return tokenize(encoded)
    .map((t) => (t.kind === "text" ? t.value : ""))
    .join("");
}
