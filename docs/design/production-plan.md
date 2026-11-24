# Redesign: production plan

How the reviewed prototype became the real web app. The prototype was removed once the hosted preview was signed off; it remains in the history of [#37](https://github.com/AbhinavMV/epub-translator/pull/37). The findings it answers are in `docs/design/ui-review.md`.

## Decisions already made

- **Stack:** stay in the Vite React SPA with Tailwind and shadcn/ui. No Next.js migration.
- **Look:** keep the current identity: blue `#2f6fde`, deep blacks, Inter for the interface, Literata for book text, the open-book `AppMark`. The Indigo look is dropped.
- **Responsive rule:** no fixed widths to make a layout fit. Grid tracks use `minmax(0, 1fr)`, flex and grid children that hold text get `min-width: 0`, and labels and badges wrap. Every screen is checked from 280 to 1,920 px.
- **Touch:** controls are 44 px tall under `pointer: coarse` (phones and touch tablets) and 36 px with a mouse. Layout breakpoints stay width-based, at 640 and 1,024 px.
- **Mobile scope:** reading and light tasks come first. The editor works on a phone but is designed desktop-first.
- **Delivery:** as before, a GitHub spec with one issue per ticket, an integration branch, and one PR with `Closes #N` for each ticket. Nothing goes to `main` until you approve the PR.
- **Docs:** each ticket updates the README, the deploy doc and `GLOSSARY.md` for what it changes. There is no docs ticket at the end.
- **Wording:** "Upload" replaces "import" in the interface, README, toasts and the `GLOSSARY.md` entry for Book. Each new label is checked against the glossary's "Avoid" lists.
- **Progress counts the main language.** "N of M volumes translated" and a volume's "% translated" count only the project's main language (see `GLOSSARY.md`), so 4 of 4 always means Fully translated.
- **Continue is per device.** The last opened volume and chapter are stored in the browser. No API change.
- **Layout check runs in CI.** Playwright is added as a dev dependency, and CI runs the width sweep on the seeded mock.
- **Hosted upload wording** already switches by mode in `upload-dropzone.tsx` ("Books are stored privately in your account" or "Books stay on this machine"), and that stays.

## What changes, and what it needs from the API

| Area | Change | API or data |
|---|---|---|
| App shell | Breadcrumb header on every inner page. One Settings menu (Light, Sepia, Dark, System; API keys; Admin; Sign out) replaces the theme toggle in headers. | None. `ThemeName` already has `system`. |
| Library | Cards of equal height: name capped at two lines, one status line plus bar. Header: title, search, Upload. Empty state. "Continue where you left off" strip. | `ProjectSummary` gains `translatedVolumeCount` and `mainLang`. Continue is stored in the browser. |
| Upload | Two steps: choose or drop a file, then project and volume number. Drop anywhere on library or project. Lands on the target project. | None. The existing preview and import endpoints cover it. |
| Project | Volumes, Glossary and Custom prompt become tabs, replacing the two dialogs. The tab lives in the URL (`?tab=glossary`), so links and Back work. Project ⋯ menu: Rename, Use translated title, Upload volume, Delete. The rename offer becomes a notice. | None. |
| Volumes | Phone and tablet: compact rows with an aligned status column. Desktop: cover grid. Per-volume progress ("34% translated"). Volume ⋯ menu. | `BookSummary` gains `translatedPercent`, in the project's main language. It comes from the counts `completeLanguages` already reads. |
| Glossary first | Warning on a project with no glossary and untranslated volumes. The editor asks "Translate without a glossary?" before any translation starts. Skipping is remembered per project, per device. | None. |
| Glossary tab | Inline Suggest terms panel (one volume or all, sample size, estimate). Conflict box with "Use this" for each rendering. Rows stack on a phone. Sticky "Save glossary" bar when there are unsaved changes. | None. |
| Custom prompt tab | Read-only rules in a collapsible section, the prompt in force editable in place, Reset to default. | None. |
| Editor (desktop and tablet) | One toolbar row: model chip with a sheet, Proofread with its count, Export menu, split Translate button. Chapter rail shows status. One status block. Retry on failed passages only. Side by side from 640 px. Toast when you leave mid-translation. | None. |
| Editor (phone) | Translation / Source / Both switch. Bottom bar: Chapters, Translate, More. Sheets for chapters and tools. | None. |
| Proofread | Counts of remaining suggestions; a summary and Done once all are reviewed. | None. |
| Reader | One-row header. View modes move into the Aa sheet. Notice on chapters not fully translated, with Translate in editor. Contents shows status, not character counts. | None. |
| Hosted screens | Admin invites stack on a phone. Sign-in and keys restyled to match. | None. |

### Glossary-first guard: every way a translation can start

Chapter, Translate all, Title & contents, Continue, Retry N failed, per-passage Retry, Batch submit, and the hosted in-browser path (`translate/compose-hosted.ts`) all go through one check. It runs before any request is sent.

### Kept as they are (the prototype only stubbed these with toasts)

Inline rename, volume number editor, Move volume dialog, Delete volume and Delete project confirmations, Translate all queueing, Batch status and polling, the fatal-error banner and its queue stop, the multi-chapter proofread confirmation, the paged reader, and the API keys vault and unlock flow. These keep their current components and behaviour, restyled where they appear.

## Tickets

Published as the spec [#20](https://github.com/AbhinavMV/epub-translator/issues/20) with tickets 1–16 as sub-issues [#21](https://github.com/AbhinavMV/epub-translator/issues/21)–[#36](https://github.com/AbhinavMV/epub-translator/issues/36), in this order. The blocking edges are GitHub issue dependencies.

Vertical slices, each shippable and testable on its own. "Blocked by" lists what must merge first.

1. **Mock data for every edge case.** `mock.ts` seeds several projects: long titles, a fully translated non-English project, a partly translated one, an empty glossary, a glossary conflict, failed passages and a hosted-mode switch. Without this, the layout check passes trivially. *Blocked by:* none.
2. **Layout check.** The width sweep over every route and overlay at 280–1,920 px, failing on anything past the edge or any container that scrolls when it shouldn't in Playwright, run in CI. *Blocked by:* 1.
3. **App shell.** Breadcrumb header, Settings menu, theme toggle removed, `pointer: coarse` touch sizing, 12 px text floor. Also the shared pieces later tickets need: the status line and bar, the per-device "last opened" store, and the chapter-status helper the editor rail and reader contents share. *Blocked by:* 2.
4. **Progress in the API.** The project's main language, `translatedVolumeCount` and `translatedPercent` in core, the local and hosted stores, and the contracts, with tests against both stores. *Blocked by:* none.
5. **Library and upload.** Cards, header, search, empty state, Continue strip, and two-step upload landing on the project. *Blocked by:* 3, 4.
6. **Project page shell and volumes.** URL tabs, project menu, rename notice, volume rows and desktop grid, volume menu. *Blocked by:* 3, 4, 5. It shares the upload component with 5.
7. **Glossary tab.** Moves the glossary dialog into the tab, with the suggest panel, conflict settling, phone rows and the save bar. *Blocked by:* 6.
8. **Custom prompt tab.** *Blocked by:* 6.
9. **Editor toolbar and status (desktop and tablet).** Model chip, Proofread count, Export menu, split Translate button, status block, Retry on failed passages only, side by side from 640 px. *Blocked by:* 3.
10. **Chapter rail and reader contents.** Both use `chapter-rail.tsx`, so they change together. *Blocked by:* 3.
11. **Editor on phones.** *Blocked by:* 9, 10.
12. **Proofread panel states.** *Blocked by:* 9.
13. **Reader header, Aa sheet and untranslated notice.** *Blocked by:* 10.
14. **Glossary-first prompts.** The project warning and the guard on every entry point above. *Blocked by:* 7, 9.
15. **Hosted screens.** Admin rows, sign-in, keys. *Blocked by:* 3.
16. **Hosted check and cleanup.** One manual `vercel deploy` preview, with your sign-off, before the PR merges. Never pointed at a different Supabase. Then remove `docs/design/prototype/`. *Blocked by:* all.

Once 3 lands, these can run in parallel: 4 (any time), 5, 9, 10 and 15.

## Testing

- **Behaviour:** Vitest and Testing Library at the component seam, as now. Examples: proofread buttons once all suggestions are reviewed, the glossary-first guard on each entry point, Retry shown only on failed passages, conflict settling, tabs restored from the URL.
- **API:** core use-case tests for the two new progress fields, run against both the SQLite and the Postgres stores, like the existing projects tests.
- **Layout:** ticket 2's sweep, run on the seeded mock, in light and dark.

## Out of scope

- The Indigo look and the 訳 mark.
- Redesigning the paged reader's page-turn interaction.
- Syncing "Continue where you left off" across devices.
- Any change to translation, proofreading or export logic.
