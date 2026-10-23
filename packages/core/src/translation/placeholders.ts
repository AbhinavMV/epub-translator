const TOKEN = /<(\/?)(\d+)>|<x(\d+)\/>/g;

interface Token {
  raw: string;
  kind: "open" | "close" | "atom";
  n: string;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(TOKEN)) {
    if (m[3] !== undefined) tokens.push({ raw: m[0], kind: "atom", n: m[3] });
    else tokens.push({ raw: m[0], kind: m[1] ? "close" : "open", n: m[2] ?? "" });
  }
  return tokens;
}

function count(tokens: Token[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t.raw, (counts.get(t.raw) ?? 0) + 1);
  return counts;
}

function nestingProblem(tokens: Token[]): string | null {
  const stack: string[] = [];
  for (const t of tokens) {
    if (t.kind === "open") stack.push(t.n);
    else if (t.kind === "close") {
      if (stack.pop() !== t.n) return `badly nested tokens around ${t.raw}`;
    }
  }
  return stack.length > 0
    ? `badly nested tokens: <${stack[stack.length - 1]}> is never closed`
    : null;
}

export function validateTokens(source: string, translated: string): string | null {
  const expected = count(tokenize(source));
  const tokens = tokenize(translated);
  const actual = count(tokens);

  const missing = [...expected.keys()].filter((k) => !actual.has(k));
  if (missing.length > 0) return `missing tokens: ${missing.join(" ")}`;

  const extra = [...actual.keys()].filter((k) => !expected.has(k));
  if (extra.length > 0) return `extra tokens not in the source: ${extra.join(" ")}`;

  const duplicated = [...actual].filter(([k, n]) => n > (expected.get(k) ?? 0)).map(([k]) => k);
  if (duplicated.length > 0) return `duplicated tokens: ${duplicated.join(" ")}`;

  const lost = [...expected].filter(([k, n]) => (actual.get(k) ?? 0) < n).map(([k]) => k);
  if (lost.length > 0) return `missing tokens: ${lost.join(" ")}`;

  return nestingProblem(tokens);
}

export function stripTokens(text: string): string {
  return text.replace(TOKEN, "");
}
