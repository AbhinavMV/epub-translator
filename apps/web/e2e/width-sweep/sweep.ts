import type { Page } from "@playwright/test";
import type { Observation, Theme } from "./expectations";
import { measureOverflow } from "./measure";
import { HEIGHT, type Screen } from "./screens";

const STILL = `*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
}`;

export async function prepare(page: Page, theme: Theme, prefs: Record<string, unknown> = {}) {
  await page.addInitScript(
    ({ css, stored }) => {
      window.localStorage.setItem("et.prefs", JSON.stringify(stored));
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
      });
    },
    { css: STILL, stored: { ...prefs, theme } },
  );
}

export function urlFor(screen: Screen): string {
  const sep = screen.path.includes("?") ? "&" : "?";
  const query = screen.hosted ? `${sep}hosted=${screen.hosted}` : "";
  return `${screen.path}${query}${screen.hash ? `#${screen.hash}` : ""}`;
}

/** Waits until the DOM has been still for `quietMs`, so late mock data can't change what is measured. */
export const settle = (page: Page, quietMs = 300) =>
  page.evaluate(async (quiet) => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      let timer = setTimeout(done, quiet);
      const cap = setTimeout(done, 5_000);
      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(done, quiet);
      });
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      function done() {
        observer.disconnect();
        clearTimeout(timer);
        clearTimeout(cap);
        resolve();
      }
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, quietMs);

export async function sweepScreen(
  page: Page,
  screen: Screen,
  widths: readonly number[],
): Promise<Observation[]> {
  const observations: Observation[] = [];
  for (const width of widths) {
    if (screen.reachable && !screen.reachable(width)) continue;
    await page.setViewportSize({ width, height: HEIGHT });
    await settle(page, 100);
    if (screen.open && screen.opened) {
      if (!(await screen.opened(page).isVisible())) {
        await screen.open(page);
        await screen.opened(page).waitFor({ state: "visible" });
        await settle(page);
      }
    }
    const offenders = await page.evaluate(measureOverflow, screen.scope ?? null);
    observations.push({ width, offenders });
  }
  return observations;
}
