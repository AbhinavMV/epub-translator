import type { ExpectedFailure } from "./expectations";

/**
 * Overflow the sweep finds today on screens not yet redesigned. A screen's ticket removes its
 * entries when it fixes them; the sweep fails while an entry here no longer happens.
 * `review` is the finding in docs/design/ui-review.md, or "sweep" for one only the sweep found.
 */
export const EXPECTED_FAILURES: readonly ExpectedFailure[] = [
  {
    screen: "account menu",
    offender:
      'past-viewport: div > div[data-slot="dropdown-menu-content"][role="menu"] "a.reader.with.a.rather.long.address@tran…"',
    widths: [280, 639],
    review: "sweep: a long email pushes the menu off screen",
  },
  {
    screen: "admin",
    offender: 'overflows: div > div > header > h1 "Admin"',
    widths: [280, 639],
    review: "G3",
  },
  {
    screen: "admin",
    offender:
      'overflows: div > div > section > div[data-slot="table-container"] "EmailRoleStatusActionsa.reader.with.a.ra…"',
    widths: [280, 1023],
    review: "H1",
  },
  {
    screen: "admin",
    offender:
      'overflows: div > div > section > div[data-slot="table-container"] "ForStatusExpiresActionsan.invited.friend…"',
    widths: [280, 1023],
    review: "H1",
  },
  {
    screen: "editor chapters sheet",
    offender:
      'past-viewport: div[data-slot="sheet-content"][role="dialog"] "ChaptersChoose a chapter013 to review198…"',
    widths: [280, 639],
    review: "sweep: the sheet is wider than a 280 px screen",
  },
  {
    screen: "editor failed passages",
    offender:
      'overflows: div > div > button[data-slot="select-trigger"][role="combobox"][aria-label="Model"] > span[data-slot="select-value"] "claude-sonnet-5-5"',
    widths: [280, 639],
    review: "E6",
  },
  {
    screen: "editor failed passages",
    offender:
      'overflows: header > div > div > h1[data-slot="tooltip-trigger"] "The Angel Next Door Spoils Me Rotten, Vo…"',
    widths: [280, 1920],
    review: "E3",
  },
  {
    screen: "editor failed passages",
    offender:
      'overflows: header > div > div > span "お隣の天使様にいつの間にか駄目人間にされていた件 2.5"',
    widths: [1024, 1920],
    review: "E3",
  },
  {
    screen: "editor failed passages",
    offender: "page-scroll: html",
    widths: [280, 639],
    review: "E1",
  },
  {
    screen: "editor failed passages",
    offender: 'past-viewport: div > div > header > div "Anthropicclaude-sonnet-5-5LiveBatch−50%E…"',
    widths: [280, 639],
    review: "E1",
  },
  {
    screen: "editor long title",
    offender:
      'overflows: div > div > button[data-slot="select-trigger"][role="combobox"][aria-label="Model"] > span[data-slot="select-value"] "claude-sonnet-5-5"',
    widths: [280, 639],
    review: "E6",
  },
  {
    screen: "editor long title",
    offender:
      'overflows: header > div > div > h1[data-slot="tooltip-trigger"] "The Reincarnated Princess Who Only Wante…"',
    widths: [280, 1920],
    review: "E3",
  },
  { screen: "editor long title", offender: "page-scroll: html", widths: [280, 639], review: "E1" },
  {
    screen: "editor long title",
    offender: 'past-viewport: div > div > header > div "Anthropicclaude-sonnet-5-5LiveBatch−50%E…"',
    widths: [280, 639],
    review: "E1",
  },
  {
    screen: "editor proofread chapter",
    offender:
      'overflows: div > div > button[data-slot="select-trigger"][role="combobox"][aria-label="Model"] > span[data-slot="select-value"] "claude-sonnet-5-5"',
    widths: [280, 639],
    review: "E6",
  },
  {
    screen: "editor proofread chapter",
    offender:
      'overflows: header > div > div > h1[data-slot="tooltip-trigger"] "The Angel Next Door Spoils Me Rotten, Vo…"',
    widths: [280, 1920],
    review: "E3",
  },
  {
    screen: "editor proofread chapter",
    offender:
      'overflows: header > div > div > span "お隣の天使様にいつの間にか駄目人間にされていた件 1"',
    widths: [1024, 1920],
    review: "E3",
  },
  {
    screen: "editor proofread chapter",
    offender: "page-scroll: html",
    widths: [280, 639],
    review: "E1",
  },
  {
    screen: "editor proofread chapter",
    offender: 'past-viewport: div > div > header > div "Anthropicclaude-sonnet-5-5LiveBatch−50%E…"',
    widths: [280, 639],
    review: "E1",
  },
  {
    screen: "editor untranslated",
    offender:
      'overflows: div > div > button[data-slot="select-trigger"][role="combobox"][aria-label="Model"] > span[data-slot="select-value"] "claude-sonnet-5-5"',
    widths: [280, 639],
    review: "E6",
  },
  {
    screen: "editor untranslated",
    offender:
      'overflows: header > div > div > h1[data-slot="tooltip-trigger"] "お隣の天使様にいつの間にか駄目人間にされていた件 3"',
    widths: [280, 1920],
    review: "E3",
  },
  {
    screen: "editor untranslated",
    offender: "page-scroll: html",
    widths: [280, 639],
    review: "E1",
  },
  {
    screen: "editor untranslated",
    offender: 'past-viewport: div > div > header > div "Anthropicclaude-sonnet-5-5LiveBatch−50%E…"',
    widths: [280, 639],
    review: "E1",
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
    screen: "hosted editor",
    offender:
      'overflows: header > div > div > h1[data-slot="tooltip-trigger"] "The Angel Next Door Spoils Me Rotten, Vo…"',
    widths: [280, 1920],
    review: "E3",
  },
  {
    screen: "hosted editor",
    offender:
      'overflows: header > div > div > span "お隣の天使様にいつの間にか駄目人間にされていた件 1"',
    widths: [1024, 1920],
    review: "E3",
  },
  {
    screen: "hosted library",
    offender: 'overflows: div > header > div > h1 "EPUB Translator"',
    widths: [280, 639],
    review: "L1",
  },
  {
    screen: "hosted library",
    offender: 'overflows: div > header > div > p "Your library, translated chapter by chap…"',
    widths: [280, 639],
    review: "L1",
  },
  {
    screen: "hosted library",
    offender: 'overflows: section > div > a > div "狼と香辛料1 volumeFully translated"',
    widths: [280, 639],
    review: "sweep: project card labels overflow the card",
  },
  {
    screen: "hosted library",
    offender: 'overflows: section > div > a > div "魔女の旅々2 volumesFully translated · French"',
    widths: [280, 1023],
    review: "sweep: project card labels overflow the card",
  },
  {
    screen: "library",
    offender: 'overflows: div > header > div > h1 "EPUB Translator"',
    widths: [280, 639],
    review: "L1",
  },
  {
    screen: "library",
    offender: 'overflows: section > div > a > div "狼と香辛料1 volumeFully translated"',
    widths: [280, 639],
    review: "sweep: project card labels overflow the card",
  },
  {
    screen: "library",
    offender: 'overflows: section > div > a > div "魔女の旅々2 volumesFully translated · French"',
    widths: [280, 1023],
    review: "sweep: project card labels overflow the card",
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
    screen: "reader failed passages",
    offender:
      'overflows: div > header > div > h1[data-slot="tooltip-trigger"] "The Angel Next Door Spoils Me Rotten, Vo…"',
    widths: [280, 1920],
    review: "E3",
  },
  {
    screen: "reader failed passages",
    offender:
      'overflows: div > header > div > span "お隣の天使様にいつの間にか駄目人間にされていた件 2.5"',
    widths: [1024, 1920],
    review: "E3",
  },
  {
    screen: "reader interleaved",
    offender:
      'overflows: div > header > div > h1[data-slot="tooltip-trigger"] "The Angel Next Door Spoils Me Rotten, Vo…"',
    widths: [280, 1920],
    review: "E3",
  },
  {
    screen: "reader interleaved",
    offender:
      'overflows: div > header > div > span "お隣の天使様にいつの間にか駄目人間にされていた件 1"',
    widths: [1024, 1920],
    review: "E3",
  },
  {
    screen: "reader long title",
    offender:
      'overflows: div > header > div > h1[data-slot="tooltip-trigger"] "The Reincarnated Princess Who Only Wante…"',
    widths: [280, 1920],
    review: "E3",
  },
  {
    screen: "reader paged",
    offender:
      'overflows: div > header > div > h1[data-slot="tooltip-trigger"] "The Angel Next Door Spoils Me Rotten, Vo…"',
    widths: [280, 1920],
    review: "E3",
  },
  {
    screen: "reader paged",
    offender:
      'overflows: div > header > div > span "お隣の天使様にいつの間にか駄目人間にされていた件 1"',
    widths: [1024, 1920],
    review: "E3",
  },
  {
    screen: "reader settings",
    offender:
      'past-viewport: div > div[data-slot="popover-content"][role="dialog"] "FontSerifSansSystemSize19pxLine height1.…"',
    widths: [280, 639],
    review: "sweep: the popover is wider than a phone screen",
  },
  {
    screen: "reader side by side",
    offender:
      'overflows: div > header > div > h1[data-slot="tooltip-trigger"] "The Angel Next Door Spoils Me Rotten, Vo…"',
    widths: [280, 1920],
    review: "E3",
  },
  {
    screen: "reader side by side",
    offender:
      'overflows: div > header > div > span "お隣の天使様にいつの間にか駄目人間にされていた件 1"',
    widths: [1024, 1920],
    review: "E3",
  },
  {
    screen: "reader untranslated",
    offender:
      'overflows: div > header > div > h1[data-slot="tooltip-trigger"] "お隣の天使様にいつの間にか駄目人間にされていた件 3"',
    widths: [280, 1920],
    review: "E3",
  },
  {
    screen: "reader",
    offender:
      'overflows: div > header > div > h1[data-slot="tooltip-trigger"] "The Angel Next Door Spoils Me Rotten, Vo…"',
    widths: [280, 1920],
    review: "E3",
  },
  {
    screen: "reader",
    offender:
      'overflows: div > header > div > span "お隣の天使様にいつの間にか駄目人間にされていた件 1"',
    widths: [1024, 1920],
    review: "E3",
  },
];
