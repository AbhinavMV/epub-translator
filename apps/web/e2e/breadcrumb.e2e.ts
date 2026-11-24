import { expect, type Page, test } from "@playwright/test";

async function visibleCrumbs(page: Page, parent: RegExp) {
  const nav = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(nav.locator('[aria-current="page"]')).not.toHaveText("…");
  await expect(nav.getByRole("link", { name: parent })).toBeAttached();
  return nav.locator("a, [aria-current='page']").evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({
        text: el.textContent ?? "",
        clipped: el.scrollWidth > el.clientWidth + 1,
        width: el.getBoundingClientRect().width,
        nav: el.closest("nav")?.getBoundingClientRect().width ?? 0,
      })),
  );
}

test("the reader names Library, the project, the volume and the chapter", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/books/angel-2/read/c1");
  const nav = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(nav.getByRole("link", { name: "Library" })).toBeVisible();
  await expect(nav.getByRole("link", { name: /お隣の天使様/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Vol. 2" })).toHaveAttribute("href", "/books/angel-2");
  await expect(nav.locator('[aria-current="page"]')).not.toHaveText("Vol. 2");
});

for (const width of [280, 320, 375]) {
  test(`the reader keeps the volume crumb whole at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/books/angel-2/read/c1");
    const crumbs = await visibleCrumbs(page, /^Vol\. 2$/);
    const parents = crumbs.slice(0, -1);
    expect(parents.map((c) => c.text)).toEqual(["Vol. 2"]);
    expect(parents[0]?.clipped).toBe(false);
  });

  test(`the editor keeps the project crumb readable at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/books/long-1?chapter=c1");
    const crumbs = await visibleCrumbs(page, /^片田舎/);
    const parents = crumbs.slice(0, -1);
    expect(parents).toHaveLength(1);
    const [project] = parents;
    expect(project?.text).toMatch(/^片田舎/);
    expect(project?.width ?? 0).toBeGreaterThanOrEqual((project?.nav ?? 0) / 3);
  });
}
