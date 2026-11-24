import { useEffect, useSyncExternalStore } from "react";
import { prefsStore, type ThemeName, usePrefs } from "./reader-settings-store";

export type ResolvedTheme = "light" | "sepia" | "dark";

export function resolveTheme(theme: ThemeName, prefersDark: boolean): ResolvedTheme {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

function darkQuery(): MediaQueryList | null {
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
}

function subscribeDark(onChange: () => void) {
  const media = darkQuery();
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}

const prefersDark = () => darkQuery()?.matches ?? false;

export function useApplyTheme(store = prefsStore): ResolvedTheme {
  const [prefs] = usePrefs(store);
  const dark = useSyncExternalStore(subscribeDark, prefersDark);
  const resolved = resolveTheme(prefs.theme, dark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  return resolved;
}
