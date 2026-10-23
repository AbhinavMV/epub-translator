import { posix } from "node:path";

export function decodeHref(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

export function splitFragment(href: string): { path: string; fragment: string | null } {
  const hash = href.indexOf("#");
  if (hash === -1) return { path: href, fragment: null };
  return { path: href.slice(0, hash), fragment: href.slice(hash + 1) };
}

/** Resolves `href` against the directory of `fromFile`; both sides are package-relative, decoded, fragment-free. */
export function resolveHref(fromFile: string, href: string): string {
  const { path } = splitFragment(href);
  return posix.normalize(posix.join(posix.dirname(fromFile), decodeHref(path)));
}

export function relativeHref(fromFile: string, toFile: string): string {
  return posix.relative(posix.dirname(fromFile), toFile);
}
