import type { ExpectedFailure } from "./expectations";

/**
 * Overflow the sweep finds today on screens not yet redesigned. A screen's ticket removes its
 * entries when it fixes them; the sweep fails while an entry here no longer happens.
 * `review` is the finding in docs/design/ui-review.md, or "sweep" for one only the sweep found.
 */
export const EXPECTED_FAILURES: readonly ExpectedFailure[] = [
  {
    screen: "admin",
    offender:
      'overflows: div > main > section > div[data-slot="table-container"] "EmailRoleStatusActionsa.reader.with.a.ra…"',
    widths: [280, 1023],
    review: "H1",
  },
  {
    screen: "admin",
    offender:
      'overflows: div > main > section > div[data-slot="table-container"] "ForStatusExpiresActionsan.invited.friend…"',
    widths: [280, 1023],
    review: "H1",
  },
  {
    screen: "editor failed passages",
    offender:
      'overflows: div > div > button[data-slot="select-trigger"][role="combobox"][aria-label="Model"] > span[data-slot="select-value"] "claude-sonnet-5-5"',
    widths: [280, 639],
    review: "E6",
  },
  {
    screen: "editor long title",
    offender:
      'overflows: div > div > button[data-slot="select-trigger"][role="combobox"][aria-label="Model"] > span[data-slot="select-value"] "claude-sonnet-5-5"',
    widths: [280, 639],
    review: "E6",
  },
  {
    screen: "editor proofread chapter",
    offender:
      'overflows: div > div > button[data-slot="select-trigger"][role="combobox"][aria-label="Model"] > span[data-slot="select-value"] "claude-sonnet-5-5"',
    widths: [280, 639],
    review: "E6",
  },
  {
    screen: "editor source shown",
    offender:
      'overflows: div > div > button[data-slot="select-trigger"][role="combobox"][aria-label="Model"] > span[data-slot="select-value"] "claude-sonnet-5-5"',
    widths: [280, 639],
    review: "E6",
  },
  {
    screen: "editor untranslated",
    offender:
      'overflows: div > div > button[data-slot="select-trigger"][role="combobox"][aria-label="Model"] > span[data-slot="select-value"] "claude-sonnet-5-5"',
    widths: [280, 639],
    review: "E6",
  },
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
  {
    screen: "hosted editor",
    offender:
      'overflows: div > div > button[data-slot="select-trigger"][role="combobox"][aria-label="Provider"] > span[data-slot="select-value"] "Fake (offline test)"',
    widths: [280, 1920],
    review: "E6",
  },
  {
    screen: "project long title",
    offender:
      'overflows: div > a > div > h3[data-slot="tooltip-trigger"] "The Reincarnated Princess Who Only Wante…"',
    widths: [280, 1920],
    review: "E3",
  },
  {
    screen: "project long title",
    offender:
      'overflows: div > a > div > p "とても長いペンネームを持つ作家・イラストレーター共同名義"',
    widths: [280, 1920],
    review: "sweep: long titles and labels overflow volume cards",
  },
  {
    screen: "project rename",
    offender:
      'overflows: div > a > div > h3[data-slot="tooltip-trigger"] "The Reincarnated Princess Who Only Wante…"',
    widths: [280, 1920],
    review: "E3",
  },
  {
    screen: "project rename",
    offender:
      'overflows: div > a > div > p "とても長いペンネームを持つ作家・イラストレーター共同名義"',
    widths: [280, 1920],
    review: "sweep: long titles and labels overflow volume cards",
  },
  {
    screen: "project volume number",
    offender:
      'overflows: div > a > div > h3[data-slot="tooltip-trigger"] "The Reincarnated Princess Who Only Wante…"',
    widths: [280, 1920],
    review: "E3",
  },
  {
    screen: "project volume number",
    offender:
      'overflows: div > a > div > p "とても長いペンネームを持つ作家・イラストレーター共同名義"',
    widths: [280, 1920],
    review: "sweep: long titles and labels overflow volume cards",
  },
  {
    screen: "project volume number",
    offender: 'overflows: section > div > div > div "Save Move"',
    widths: [280, 639],
    review: "sweep: long titles and labels overflow volume cards",
  },
  {
    screen: "project witch",
    offender: 'overflows: div > a > div > div "Translated · French"',
    widths: [280, 639],
    review: "sweep: long titles and labels overflow volume cards",
  },
  {
    screen: "reader settings",
    offender:
      'past-viewport: div > div[data-slot="popover-content"][role="dialog"] "FontSerifSansSystemSize19pxLine height1.…"',
    widths: [280, 639],
    review: "sweep: the popover is wider than a phone screen",
  },
];
