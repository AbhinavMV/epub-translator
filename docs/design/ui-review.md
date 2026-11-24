# UI review, November 2026

Audit of the web app run on the mock API (`VITE_MOCK_API=1`), at 375, 768 and 1280 px wide, in light and dark. Touch-target sizes, overflow and accessible names were measured in the page, not eyeballed. The hosted-only screens (sign-in, invite, reset, admin, API keys) were read from source, not seen.

Severity: **High** blocks or misleads; **Medium** slows the user down or looks broken; **Low** is polish.

## Every screen

| # | Width | Finding | Severity |
|---|---|---|---|
| G1 | all | Every control is 32 px tall. On touch screens the minimum is 44 px; at 375 px, 12 of 13 controls on the project page and all 26 in the editor are under it. | High |
| G2 | all | The theme toggle uses a sun and a dimmer sun for light and sepia, which look the same. Reader settings offers a fourth choice, System, that the header toggle lacks. | Medium |
| G3 | all | The theme toggle sits in every page header and takes the room the title needs. | Medium |
| G4 | all | Section labels and metadata (`LIBRARY · 1`, `Vol. 1`, `3 chapters · JA`, `198 chars`) are 10–11 px mono uppercase, below the 12 px floor. | Medium |
| G5 | all | Loading skeletons show four or three cards whatever the real count, so the layout jumps when data arrives. | Low |
| G6 | all | No breadcrumb. The editor and reader reach the library only through the logo, and the project only through the Project button. | Medium |

## Library

| # | Width | Finding | Severity |
|---|---|---|---|
| L1 | 375 | "EPUB Translator" wraps onto two lines beside the theme toggle. | Medium |
| L2 | 375 | The import area says "Drop an EPUB here", which a phone can't do. | Low |
| L3 | all | Project cards show only the name and volume count: no progress and no last-opened volume, so there's no way to resume from the library. | Medium |
| L4 | all | No search or sort, which matters once there are more than a dozen projects. | Low |

## Project

| # | Width | Finding | Severity |
|---|---|---|---|
| P1 | all | The glossary is a modal with suggest controls (volume, language, provider, model, sample size, suggest model) stacked above the table. It's hard to use at 375 px, and a 2,000-entry glossary doesn't belong in a modal. | High |
| P2 | all | The delete button sits on the volume cover, next to the click target that opens the volume. | Medium |
| P3 | all | Volume cards don't show translation progress until a volume is complete. | Medium |
| P4 | all | Rename and delete sit as bare icons beside the name, with no menu or label. | Low |

## Editor

| # | Width | Finding | Severity |
|---|---|---|---|
| E1 | 375 | Five rows of controls (header, provider and model, mode, language, glossary, proofread, reader, translate, navigation, export, progress) fill about 40% of the screen before any text. Most are icon-only. | High |
| E2 | 375–768 | The source pane is collapsed behind "Show" up to tablet width, so side-by-side comparison is lost on an iPad held upright. | Medium |
| E3 | 1280 | The book title is cut to "お隣の天使…" because the theme toggle shares the header. | Medium |
| E4 | 1280 | Two progress indicators show at once ("Translating 3/6 segments" and "0 / 3 translated") on a separate row under the toolbar. | Medium |
| E5 | all | Retry, Copy and Clear stay visible with nothing translated. | Low |
| E6 | all | The model picker shows raw model ids (`claude-sonnet-5-5`) rather than names. | Low |
| E7 | all | The chapter rail shows character counts, which mean little to the user, instead of translation status. | Low |
| E8 | all | You can leave the page in the middle of a chapter with no hint that translation keeps running. | Medium |

## Reader

| # | Width | Finding | Severity |
|---|---|---|---|
| R1 | 375 | The toolbar wraps and leaves the Editor button alone on a second row. | Medium |
| R2 | all | An untranslated chapter shows the source in grey with no explanation and no way to translate it. | High |
| R3 | all | The contents rail repeats the editor's character counts. | Low |

## Hosted screens (read from source)

| # | Finding | Severity |
|---|---|---|
| H1 | Admin uses a four-column table for invites, which will scroll sideways or squash at 375 px. | Medium |
| H2 | Sign-in, invite and reset share one shell, which is fine. Keep it, restyled. | Low |
