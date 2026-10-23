import { useEffect, useMemo } from "react";
import { type ThemeName, usePrefs } from "./reader-settings-store";

export function resolveTheme(theme: ThemeName, prefersDark: boolean): "light" | "sepia" | "dark" {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

export function useApplyTheme(): "light" | "sepia" | "dark" {
  const [prefs] = usePrefs();
  const media = useMemo(
    () =>
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null,
    [],
  );
  const resolved = resolveTheme(prefs.theme, media?.matches ?? false);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  useEffect(() => {
    if (!media || prefs.theme !== "system") return;
    const onChange = () => {
      document.documentElement.dataset.theme = resolveTheme("system", media.matches);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [media, prefs.theme]);

  return resolved;
}
