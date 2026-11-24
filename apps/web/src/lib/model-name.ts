const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export function modelName(id: string): string {
  const words = id.split("-").filter((w) => !/^\d{8}$/.test(w));
  const [family, ...rest] = words;
  if (!family) return id;
  if (family === "gpt") {
    const [version, ...suffix] = rest;
    return [`GPT-${version ?? ""}`, ...suffix].join(" ");
  }
  const parts: string[] = [capitalize(family)];
  for (const word of rest) {
    const prev = parts[parts.length - 1] ?? "";
    if (/^\d+$/.test(word) && /\d$/.test(prev) && family === "claude") {
      parts[parts.length - 1] = `${prev}.${word}`;
    } else {
      parts.push(capitalize(word));
    }
  }
  return parts.join(" ");
}
