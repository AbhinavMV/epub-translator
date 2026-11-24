import { expect, test } from "@playwright/test";
import { formatVerdict, judge, type Theme } from "./width-sweep/expectations";
import { EXPECTED_FAILURES } from "./width-sweep/expected-failures";
import { SCREENS, WIDTHS } from "./width-sweep/screens";
import { prepare, settle, sweepScreen, urlFor } from "./width-sweep/sweep";

const THEMES: readonly Theme[] = ["light", "dark"];
const ignoreExpected = process.env.SWEEP_IGNORE_EXPECTED === "1";

for (const screen of SCREENS) {
  for (const theme of THEMES) {
    test(`${screen.name} (${theme})`, async ({ page }) => {
      await prepare(page, theme, screen.prefs);
      await page.setViewportSize({ width: WIDTHS[0], height: 800 });
      await page.goto(urlFor(screen));
      await expect(screen.ready(page)).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
      await settle(page);

      const observations = await sweepScreen(page, screen, WIDTHS);
      expect(observations.length, "no width reached this screen").toBeGreaterThan(0);
      const verdict = judge(
        screen.name,
        theme,
        observations,
        ignoreExpected ? [] : EXPECTED_FAILURES,
      );
      expect(verdict.ok, formatVerdict(verdict)).toBe(true);
    });
  }
}
