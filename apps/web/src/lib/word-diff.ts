export type DiffPart = { kind: "same" | "removed" | "added"; text: string };

const TOKEN = /\s+|[\p{L}\p{N}'’-]+|[^\s\p{L}\p{N}]|./gu;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const MAX_CELLS = 400_000;

function tokens(text: string): string[] {
  const out: string[] = [];
  for (const t of text.match(TOKEN) ?? []) {
    if (CJK.test(t)) out.push(...t);
    else out.push(t);
  }
  return out;
}

function push(parts: DiffPart[], kind: DiffPart["kind"], text: string) {
  const last = parts[parts.length - 1];
  if (last && last.kind === kind) last.text += text;
  else parts.push({ kind, text });
}

/** Word-level diff (character-level for CJK) by longest common subsequence. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  if (a.length * b.length > MAX_CELLS) {
    return [
      { kind: "removed", text: before },
      { kind: "added", text: after },
    ];
  }
  const rows = a.length + 1;
  const cols = b.length + 1;
  const lcs = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * cols + j] =
        a[i] === b[j]
          ? (lcs[(i + 1) * cols + j + 1] ?? 0) + 1
          : Math.max(lcs[(i + 1) * cols + j] ?? 0, lcs[i * cols + j + 1] ?? 0);
    }
  }
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(parts, "same", a[i] as string);
      i++;
      j++;
    } else if ((lcs[(i + 1) * cols + j] ?? 0) >= (lcs[i * cols + j + 1] ?? 0)) {
      push(parts, "removed", a[i++] as string);
    } else {
      push(parts, "added", b[j++] as string);
    }
  }
  while (i < a.length) push(parts, "removed", a[i++] as string);
  while (j < b.length) push(parts, "added", b[j++] as string);
  return parts;
}
