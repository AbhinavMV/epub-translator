import { expect, test } from "@playwright/test";
import { measureOverflow } from "./width-sweep/measure";

const page = (body: string) => `<!doctype html>
<html><head><style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.4 sans-serif; overflow-x: hidden; }
  .card { width: 200px; border: 1px solid; }
</style></head><body>${body}</body></html>`;

test.describe("overflow detector", () => {
  test.beforeEach(async ({ page: p }) => {
    await p.setViewportSize({ width: 320, height: 600 });
  });

  test("reports nothing on a page that fits", async ({ page: p }) => {
    await p.setContent(page(`<main><div class="card">A short card</div></main>`));
    expect(await p.evaluate(measureOverflow, null)).toEqual([]);
  });

  test("reports an element wider than the viewport, and the page scroll it causes", async ({
    page: p,
  }) => {
    await p.setContent(page(`<main><div aria-label="Wide" style="width: 400px">x</div></main>`));
    const found = await p.evaluate(measureOverflow, null);
    expect(found).toContainEqual({
      kind: "page-scroll",
      path: "html",
      detail: "the page is 400px wide in a 320px viewport",
    });
    expect(found).toContainEqual({
      kind: "past-viewport",
      path: 'main > div[aria-label="Wide"] "x"',
      detail: "extends 80px past the right edge",
    });
  });

  test("reports a long unbroken word spilling out of its box", async ({ page: p }) => {
    await p.setContent(
      page(`<div class="card"><h3>TheExtraordinarilyLongUnbrokenSubtitle</h3></div>`),
    );
    const found = await p.evaluate(measureOverflow, null);
    expect(found.map((o) => `${o.kind}: ${o.path}`)).toContain(
      'overflows: div > h3 "TheExtraordinarilyLongUnbrokenSubtitle"',
    );
  });

  test("reports a container that scrolls sideways unless it is marked as a scroller", async ({
    page: p,
  }) => {
    const wide = `<div style="width: 600px">wide table</div>`;
    await p.setContent(
      page(`<section style="overflow-x: auto">${wide}</section>
        <section data-overflow="scroll" style="overflow-x: auto">${wide}</section>`),
    );
    const found = await p.evaluate(measureOverflow, null);
    expect(found).toEqual([
      {
        kind: "overflows",
        path: 'section "wide table"',
        detail: "content is 600px wide in a 320px box (overflow-x: auto)",
      },
    ]);
  });

  test("ignores text inputs scrolling their own text", async ({ page: p }) => {
    await p.setContent(
      page(`<input style="width: 100px" value="${"a very long value ".repeat(10)}">`),
    );
    expect(await p.evaluate(measureOverflow, null)).toEqual([]);
  });

  test("measures only the overlay when given a scope", async ({ page: p }) => {
    await p.setContent(
      page(`<div style="width: 500px">page behind</div>
        <div role="dialog" style="position: fixed; left: 10px; width: 400px">dialog</div>`),
    );
    const found = await p.evaluate(measureOverflow, '[role="dialog"]');
    expect(found).toEqual([
      {
        kind: "past-viewport",
        path: 'div[role="dialog"] "dialog"',
        detail: "extends 90px past the right edge",
      },
    ]);
  });
});
