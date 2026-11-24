import { expect, type Page, test } from "@playwright/test";

const PAGES = [
  { name: "library", path: "/?hosted=1" },
  { name: "editor", path: "/books/angel-1?chapter=c1&hosted=1" },
  { name: "reader", path: "/books/angel-1/read/c1?hosted=1" },
];

async function heights(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({
        name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName,
        height: Math.round(el.getBoundingClientRect().height),
      })),
  );
}

const CONTROLS = "header a, header button";
const MENU_ITEMS = '[data-slot="dropdown-menu-content"] [role^="menuitem"]';

test.describe("touch screens", () => {
  test.use({ hasTouch: true, isMobile: true });

  for (const width of [375, 820]) {
    for (const { name, path } of PAGES) {
      test(`${name} header and Settings menu are 44 px at ${width} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
        const settings = page.getByRole("button", { name: "Settings", exact: true });
        await expect(settings).toBeVisible();

        const small = (await heights(page, CONTROLS)).filter((c) => c.height < 44);
        expect(small).toEqual([]);

        await settings.click();
        await expect(page.locator(MENU_ITEMS).first()).toBeVisible();
        const smallItems = (await heights(page, MENU_ITEMS)).filter((c) => c.height < 44);
        expect(smallItems).toEqual([]);
      });
    }
  }

  test("a sheet's Close button is 44 px and clear of its title", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/books/angel-1/read/c1?hosted=1");
    await page.getByRole("button", { name: "Reader settings" }).click();
    const sheet = page.getByRole("dialog", { name: "Reader settings" });
    const close = sheet.getByRole("button", { name: "Close" });
    const title = sheet.getByRole("heading", { name: "Reader settings" });
    await expect(close).toBeVisible();
    const [c, t] = [await close.boundingBox(), await title.boundingBox()];
    expect(c?.height).toBeGreaterThanOrEqual(44);
    expect(c?.width).toBeGreaterThanOrEqual(44);
    expect((t?.x ?? 0) + (t?.width ?? 0)).toBeLessThanOrEqual(c?.x ?? 0);
  });
});

test("controls are 36 px with a mouse", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/books/angel-1?chapter=c1");
  expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches)).toBe(true);
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  const sizes = await heights(page, CONTROLS);
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.filter((c) => c.height !== 36)).toEqual([]);
});
