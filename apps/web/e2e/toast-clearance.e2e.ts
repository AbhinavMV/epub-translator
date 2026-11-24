import { expect, type Locator, test } from "@playwright/test";

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("not laid out");
  return b;
}

for (const width of [375, 1280]) {
  test(`a toast never covers the glossary save bar at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/projects/project-angel?tab=glossary");
    await page.getByRole("button", { name: /Shiina Mahiru/ }).click();
    const bar = page.getByRole("region", { name: "Unsaved glossary changes" });
    const toast = page.locator("[data-sonner-toast]").first();
    await expect(bar).toBeVisible();
    await expect(toast).toBeVisible();
    await page.waitForTimeout(500);
    const [b, t] = [await box(bar), await box(toast)];
    const overlap =
      t.y < b.y + b.height && b.y < t.y + t.height && t.x < b.x + b.width && b.x < t.x + t.width;
    expect(overlap, `toast ${JSON.stringify(t)} bar ${JSON.stringify(b)}`).toBe(false);
  });
}
