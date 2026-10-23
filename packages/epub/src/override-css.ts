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
