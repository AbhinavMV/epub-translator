import type { ExpectedFailure } from "./expectations";

/**
 * Overflow the sweep finds today on screens not yet redesigned. A screen's ticket removes its
 * entries when it fixes them; the sweep fails while an entry here no longer happens.
 * `review` is the finding in docs/design/ui-review.md, or "sweep" for one only the sweep found.
 */
export const EXPECTED_FAILURES: readonly ExpectedFailure[] = [
  {
    screen: "glossary dialog empty",
    offender:
      'overflows: div > div > button[data-slot="select-trigger"][role="combobox"][aria-label="Model"] > span[data-slot="select-value"] "claude-sonnet-5-5"',
    widths: [280, 639],
    review: "P1",
  },
  {
    screen: "glossary dialog empty",
    offender:
      'overflows: div > div > button[data-slot="select-trigger"][role="combobox"][aria-label="Provider"] > span[data-slot="select-value"] "Anthropic"',
    widths: [280, 639],
    review: "P1",
  },
  {
    screen: "glossary dialog empty",
    offender:
      'overflows: div[data-slot="dialog-content"][role="dialog"] > div > div "StandardLargeEntire volume1 request · ~4…"',
    widths: [280, 639],
    review: "P1",
  },
  {
    screen: "glossary dialog empty",
    offender:
      'overflows: div[data-slot="dialog-content"][role="dialog"] > div > div "Suggest from volumeclaude-haiku-5-5"',
    widths: [280, 639],
    review: "P1",
  },
  {
    screen: "glossary dialog",
    offender:
      'overflows: div > div > button[data-slot="select-trigger"][role="combobox"][aria-label="Model"] > span[data-slot="select-value"] "claude-sonnet-5-5"',
    widths: [280, 639],
    review: "P1",
  },
  {
    screen: "glossary dialog",
    offender:
      'overflows: div > div > button[data-slot="select-trigger"][role="combobox"][aria-label="Provider"] > span[data-slot="select-value"] "Anthropic"',
    widths: [280, 639],
    review: "P1",
  },
  {
    screen: "glossary dialog",
    offender:
      'overflows: div[data-slot="dialog-content"][role="dialog"] > div > div "StandardLargeEntire volume1 request · ~4…"',
    widths: [280, 639],
    review: "P1",
  },
  {
    screen: "glossary dialog",
    offender:
      'overflows: div[data-slot="dialog-content"][role="dialog"] > div > div "Suggest from volumeclaude-haiku-5-5"',
    widths: [280, 639],
    review: "P1",
  },
];
