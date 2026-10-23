import { describe, expect, it } from "vitest";
import { sanitize } from "@/lib/sanitize";

describe("sanitize", () => {
  it("strips scripts, handlers and external urls", () => {
    const dirty = [
      '<p onclick="x()" style="color:red">hi</p>',
      "<script>alert(1)</script>",
      '<iframe src="/api/x"></iframe>',
      '<form action="/api/x"><input name="a"></form>',
      '<img src="https://evil.test/a.png" onerror="x()">',
      '<img src="/api/books/1/assets/a.png" alt="ok">',
      '<a href="https://evil.test">out</a>',
      '<a href="javascript:alert(1)">js</a>',
      '<svg viewBox="0 0 2 2"><circle cx="1" cy="1" r="1"/></svg>',
    ].join("");
    const out = sanitize(dirty);
    expect(out).not.toMatch(
      /<script|<iframe|<form|<input|onclick|onerror|style=|evil\.test|javascript:/,
    );
    expect(out).toContain("hi");
    expect(out).toContain('src="/api/books/1/assets/a.png"');
    expect(out).toContain("<svg");
  });

  it("drops srcset candidates that point outside the api", () => {
    const out = sanitize(
      '<img src="/api/a.png" srcset="/api/a.png 1x, https://evil.test/b.png 2x">',
    );
    expect(out).not.toContain("evil.test");
    expect(out).toContain('src="/api/a.png"');
  });
});
