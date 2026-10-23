export const OVERRIDE_CSS_NAME = "et-override.css";

export const OVERRIDE_CSS = `html,
body,
body * {
  writing-mode: horizontal-tb !important;
  -epub-writing-mode: horizontal-tb !important;
  -webkit-writing-mode: horizontal-tb !important;
  text-orientation: mixed !important;
  -epub-text-orientation: mixed !important;
  -webkit-text-orientation: mixed !important;
  text-combine-upright: none !important;
  -epub-text-combine: none !important;
  -webkit-text-combine: none !important;
}
`;

export const BILINGUAL_CSS = `
.et-translation {
  opacity: 0.8;
}
`;

export function overrideCss(layout: "translation" | "bilingual"): string {
  return layout === "bilingual" ? OVERRIDE_CSS + BILINGUAL_CSS : OVERRIDE_CSS;
}
