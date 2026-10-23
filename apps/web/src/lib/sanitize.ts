import createDOMPurify from "dompurify";

const URL_ATTRS = ["src", "href", "xlink:href", "srcset", "poster", "action", "data", "background"];

function createSanitizer(win: Window & typeof globalThis) {
  const purify = createDOMPurify(win);
  purify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (URL_ATTRS.includes(data.attrName) && !data.attrValue.trim().startsWith("/api/")) {
      data.keepAttr = false;
    }
  });
  return (html: string): string =>
    purify.sanitize(html, {
      USE_PROFILES: { html: true, svg: true },
      FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input", "button"],
      FORBID_ATTR: ["style"],
    });
}

export const sanitize = createSanitizer(window);
