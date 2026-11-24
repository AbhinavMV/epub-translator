import type { Locator, Page } from "@playwright/test";

export const WIDTHS = [
  280, 320, 360, 375, 390, 412, 414, 430, 600, 639, 640, 767, 768, 820, 1023, 1024, 1280, 1440,
  1920,
] as const;

export const HEIGHT = 800;

export const OVERLAY = {
  dialog: '[data-slot="dialog-content"]',
  sheet: '[data-slot="sheet-content"]',
  menu: '[data-slot="dropdown-menu-content"]',
  select: '[data-slot="select-content"]',
  popover: '[data-slot="popover-content"]',
} as const;

export interface Screen {
  name: string;
  path: string;
  hash?: string;
  /** Mock hosted mode, passed as `?hosted=`. */
  hosted?: "1" | "signed-out";
  /** Reader preferences stored before the app boots (theme is set by the sweep). */
  prefs?: Record<string, unknown>;
  /** Other localStorage entries stored before the app boots. */
  storage?: Record<string, string>;
  /** Visible once the page has its data. */
  ready: (page: Page) => Locator;
  /** Opens the overlay or state under test; the sweep calls it again whenever it has closed. */
  open?: (page: Page) => Promise<void>;
  /** Visible while the state under test is open. */
  opened?: (page: Page) => Locator;
  /** Overlay to measure instead of the whole page. */
  scope?: string;
  /** Widths at which the state can be reached. */
  reachable?: (width: number) => boolean;
}

const heading = (text: string | RegExp) => (page: Page) =>
  page.getByRole("heading", { name: text }).first();

const text = (value: string) => (page: Page) => page.getByText(value, { exact: true }).first();

const iconButton = (page: Page, icon: string) =>
  page.locator(`button:has(svg.lucide-${icon}):visible`).first();

const scoped = (selector: string) => (page: Page) => page.locator(selector).first();

const glossaryLoaded = (page: Page) =>
  page
    .locator(OVERLAY.dialog)
    .filter({ hasText: /\d+ requests? ·/ })
    .filter({ hasText: "Anthropic" })
    .filter({ hasText: "claude-haiku-5-5" });

const openApiKeys = async (page: Page) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("menuitem", { name: "API keys" }).click();
};

const MOCK_PASSPHRASE = "mock passphrase";

const adminReady = (page: Page) => page.getByText("kenji@example.com").first();

const ANGEL = "お隣の天使様にいつの間にか駄目人間にされていた件";
const LONG_SERIES = /^片田舎で静かに暮らしたかった/;

const libraryReady = (page: Page) => page.getByRole("heading", { level: 1, name: "Library" });

const openUpload = async (page: Page) => {
  await page.getByRole("button", { name: "Upload EPUB" }).first().click();
};

const upload = (fileName: string) => async (page: Page) => {
  await openUpload(page);
  await page.locator(`${OVERLAY.dialog} input[type="file"]`).setInputFiles({
    name: fileName,
    mimeType: "application/epub+zip",
    buffer: Buffer.from("not really an epub; the mock only reads the name"),
  });
};

const editorReady = (page: Page) => page.getByRole("progressbar", { name: "Passages translated" });

const openModelSheet = async (page: Page) => {
  await page.getByRole("button", { name: /^Model and mode/ }).click();
  await page.locator(OVERLAY.sheet).waitFor();
};
const readerReady = (page: Page) => page.locator(".reader-prose").first();

const click = (target: (page: Page) => Locator) => async (page: Page) => {
  await target(page).click();
};

const PROJECTS: [string, string | RegExp][] = [
  ["angel", ANGEL],
  ["long", LONG_SERIES],
  ["witch", "魔女の旅々"],
  ["wolf", "狼と香辛料"],
];

const volumeActions = (page: Page) =>
  page
    .getByRole("list", { name: "Volumes" })
    .getByRole("button", { name: / actions$/ })
    .first();

/** Opens a menu, then picks `item` from it; safe to call again while the menu is open. */
const fromMenu = (trigger: (page: Page) => Locator, item?: string) => async (page: Page) => {
  const menu = page.locator(OVERLAY.menu);
  if (!(await menu.isVisible())) await trigger(page).click();
  if (item) await menu.getByRole("menuitem", { name: item }).click();
};

const projectAction = (item?: string) =>
  fromMenu((page) => page.getByRole("button", { name: "Project actions" }), item);
const volumeAction = (item: string) => fromMenu(volumeActions, item);

export const SCREENS: readonly Screen[] = [
  { name: "library", path: "/", ready: libraryReady },
  {
    name: "library continue strip",
    path: "/",
    storage: {
      "et.lastOpened": JSON.stringify({ bookId: "long-2", chapterId: "c1", openedAt: 1 }),
    },
    ready: (page) => page.getByRole("region", { name: "Continue" }).getByText(/Vol\. 2/),
  },
  {
    name: "upload choose a file",
    path: "/",
    ready: libraryReady,
    open: openUpload,
    opened: scoped(OVERLAY.dialog),
    scope: OVERLAY.dialog,
  },
  {
    name: "upload into an existing project",
    path: "/",
    ready: libraryReady,
    open: upload(`${ANGEL} 4.epub`),
    opened: scoped(OVERLAY.dialog),
    scope: OVERLAY.dialog,
  },
  {
    name: "upload as a new project",
    path: "/",
    ready: libraryReady,
    open: upload(
      "A completely new series whose title keeps going well past any reasonable length 1.epub",
    ),
    opened: scoped(OVERLAY.dialog),
    scope: OVERLAY.dialog,
  },

  { name: "project angel", path: "/projects/project-angel", ready: heading(ANGEL) },
  { name: "project long title", path: "/projects/project-long", ready: heading(LONG_SERIES) },
  { name: "project witch", path: "/projects/project-witch", ready: heading("魔女の旅々") },
  { name: "project wolf", path: "/projects/project-wolf", ready: heading("狼と香辛料") },
  ...PROJECTS.flatMap(([id, title]): Screen[] => [
    {
      name: `project menu ${id}`,
      path: `/projects/project-${id}`,
      ready: heading(title),
      open: projectAction(),
      opened: scoped(OVERLAY.menu),
      scope: OVERLAY.menu,
    },
    {
      name: `volume menu ${id}`,
      path: `/projects/project-${id}`,
      ready: heading(title),
      open: click(volumeActions),
      opened: scoped(OVERLAY.menu),
      scope: OVERLAY.menu,
    },
  ]),
  {
    name: "project glossary tab",
    path: "/projects/project-angel?tab=glossary",
    ready: heading(ANGEL),
  },
  {
    name: "project glossary tab empty",
    path: "/projects/project-long?tab=glossary",
    ready: heading(LONG_SERIES),
  },
  {
    name: "project prompt tab",
    path: "/projects/project-long?tab=prompt",
    ready: heading(LONG_SERIES),
  },
  {
    name: "project rename",
    path: "/projects/project-long",
    ready: heading(LONG_SERIES),
    open: projectAction("Rename project"),
    opened: (page) => page.getByRole("textbox", { name: "Project name" }),
  },
  {
    name: "project volume number",
    path: "/projects/project-long",
    ready: heading(LONG_SERIES),
    open: volumeAction("Change volume number"),
    opened: (page) => page.getByRole("spinbutton").first(),
  },
  {
    name: "glossary dialog",
    path: "/projects/project-angel?tab=glossary",
    ready: heading(ANGEL),
    open: click((page) => page.getByRole("button", { name: /^Glossary/ })),
    opened: glossaryLoaded,
    scope: OVERLAY.dialog,
  },
  {
    name: "glossary dialog empty",
    path: "/projects/project-long?tab=glossary",
    ready: heading(LONG_SERIES),
    open: click((page) => page.getByRole("button", { name: /^Glossary/ })),
    opened: glossaryLoaded,
    scope: OVERLAY.dialog,
  },
  {
    name: "custom prompt dialog",
    path: "/projects/project-angel?tab=prompt",
    ready: heading(ANGEL),
    open: click((page) => page.getByRole("button", { name: /^Custom prompt/ })),
    opened: scoped(OVERLAY.dialog),
    scope: OVERLAY.dialog,
  },
  {
    name: "delete project dialog",
    path: "/projects/project-long",
    ready: heading(LONG_SERIES),
    open: projectAction("Delete project…"),
    opened: scoped(OVERLAY.dialog),
    scope: OVERLAY.dialog,
  },
  {
    name: "move volume dialog",
    path: "/projects/project-long",
    ready: heading(LONG_SERIES),
    open: volumeAction("Move to project…"),
    opened: scoped(OVERLAY.dialog),
    scope: OVERLAY.dialog,
  },
  {
    name: "delete volume dialog",
    path: "/projects/project-long",
    ready: heading(LONG_SERIES),
    open: volumeAction("Delete volume…"),
    opened: scoped(OVERLAY.dialog),
    scope: OVERLAY.dialog,
  },

  { name: "editor proofread chapter", path: "/books/angel-1?chapter=c1", ready: editorReady },
  { name: "editor failed passages", path: "/books/angel-2-5?chapter=c2", ready: editorReady },
  { name: "editor untranslated", path: "/books/angel-3?chapter=c1", ready: editorReady },
  { name: "editor long title", path: "/books/long-2?chapter=c1", ready: editorReady },
  {
    name: "editor source shown",
    path: "/books/angel-1?chapter=c1",
    ready: editorReady,
    open: click((page) => page.getByRole("button", { name: "Show", exact: true })),
    opened: (page) => page.getByRole("button", { name: "Hide", exact: true }),
    reachable: (width) => width < 640,
  },
  {
    name: "editor chapters sheet",
    path: "/books/angel-1?chapter=c1",
    ready: editorReady,
    open: click((page) => page.getByRole("button", { name: "Open chapters" })),
    opened: scoped(OVERLAY.sheet),
    scope: OVERLAY.sheet,
    reachable: (width) => width < 768,
  },
  {
    name: "proofread sheet",
    path: "/books/angel-1?chapter=c1",
    ready: editorReady,
    open: click((page) => page.getByRole("button", { name: /^(Review|Show)$/ }).first()),
    opened: scoped(OVERLAY.sheet),
    scope: OVERLAY.sheet,
  },
  {
    name: "proofread sheet reviewed",
    path: "/books/angel-1?chapter=c1",
    ready: editorReady,
    open: async (page) => {
      await page
        .getByRole("button", { name: /^(Review|Show)$/ })
        .first()
        .click();
      const sheet = page.locator(OVERLAY.sheet);
      await sheet
        .getByText(/suggestions? (left|reviewed)/)
        .first()
        .waitFor();
      const acceptAll = sheet.getByRole("button", { name: /^Accept( all)? \d+$/ });
      if (await acceptAll.isVisible()) await acceptAll.click();
    },
    opened: (page) => page.locator(OVERLAY.sheet).filter({ hasText: /suggestions? reviewed/ }),
    scope: OVERLAY.sheet,
  },
  {
    name: "proofread menu",
    path: "/books/angel-1?chapter=c1",
    ready: editorReady,
    open: async (page) => iconButton(page, "spell-check").click(),
    opened: scoped(OVERLAY.menu),
    scope: OVERLAY.menu,
  },
  {
    name: "proofread confirm dialog",
    path: "/books/angel-1?chapter=c1",
    ready: editorReady,
    open: async (page) => {
      await iconButton(page, "spell-check").click();
      await page.getByRole("menuitem", { name: /^Whole book/ }).click();
    },
    opened: scoped(OVERLAY.dialog),
    scope: OVERLAY.dialog,
  },
  {
    name: "export menu",
    path: "/books/angel-1?chapter=c1",
    ready: editorReady,
    open: click((page) => page.getByRole("button", { name: "Export", exact: true })),
    opened: scoped(OVERLAY.menu),
    scope: OVERLAY.menu,
  },
  {
    name: "translate menu",
    path: "/books/angel-1?chapter=c1",
    ready: editorReady,
    open: click((page) => page.getByRole("button", { name: "More translate options" })),
    opened: scoped(OVERLAY.menu),
    scope: OVERLAY.menu,
  },
  {
    name: "model sheet",
    path: "/books/angel-1?chapter=c1",
    ready: editorReady,
    open: openModelSheet,
    opened: scoped(OVERLAY.sheet),
    scope: OVERLAY.sheet,
  },
  {
    name: "provider select",
    path: "/books/angel-1?chapter=c1",
    ready: editorReady,
    open: async (page) => {
      if (!(await page.locator(OVERLAY.sheet).isVisible())) await openModelSheet(page);
      await page.getByRole("combobox", { name: "Provider" }).click();
    },
    opened: scoped(OVERLAY.select),
    scope: OVERLAY.select,
  },
  {
    name: "model select",
    path: "/books/angel-1?chapter=c1",
    ready: editorReady,
    open: async (page) => {
      if (!(await page.locator(OVERLAY.sheet).isVisible())) await openModelSheet(page);
      await page.getByRole("combobox", { name: "Model" }).click();
    },
    opened: scoped(OVERLAY.select),
    scope: OVERLAY.select,
  },
  {
    name: "target language select",
    path: "/books/angel-1?chapter=c1",
    ready: editorReady,
    open: async (page) => {
      if (!(await page.locator(OVERLAY.sheet).isVisible())) await openModelSheet(page);
      await page.getByRole("combobox", { name: "Target language" }).click();
    },
    opened: scoped(OVERLAY.select),
    scope: OVERLAY.select,
  },

  { name: "reader", path: "/books/angel-1/read/c1", ready: readerReady },
  {
    name: "reader interleaved",
    path: "/books/angel-1/read/c1",
    prefs: { viewMode: "interleaved" },
    ready: readerReady,
  },
  {
    name: "reader side by side",
    path: "/books/angel-1/read/c1",
    prefs: { viewMode: "side-by-side" },
    ready: readerReady,
  },
  {
    name: "reader paged",
    path: "/books/angel-1/read/c1",
    prefs: { layout: "paged" },
    ready: (page) => page.getByTestId("paged-columns"),
  },
  { name: "reader failed passages", path: "/books/angel-2-5/read/c2", ready: readerReady },
  { name: "reader untranslated", path: "/books/angel-3/read/c1", ready: readerReady },
  {
    name: "reader paged untranslated",
    path: "/books/angel-3/read/c1",
    prefs: { layout: "paged" },
    ready: (page) => page.getByTestId("paged-columns"),
  },
  {
    name: "reader paged interleaved",
    path: "/books/angel-2-5/read/c2",
    prefs: { layout: "paged", viewMode: "interleaved" },
    ready: (page) => page.getByTestId("paged-columns"),
  },
  { name: "reader long title", path: "/books/long-2/read/c1", ready: readerReady },
  {
    name: "reader contents sheet",
    path: "/books/long-2/read/c1",
    ready: readerReady,
    open: click((page) => page.getByRole("button", { name: "Contents", exact: true })),
    opened: scoped(OVERLAY.sheet),
    scope: OVERLAY.sheet,
    reachable: (width) => width < 768,
  },
  {
    name: "reader settings",
    path: "/books/angel-1/read/c1",
    ready: readerReady,
    open: click((page) => page.getByRole("button", { name: "Reader settings" })),
    opened: scoped(OVERLAY.sheet),
    scope: OVERLAY.sheet,
  },

  { name: "hosted library", path: "/", hosted: "1", ready: libraryReady },
  {
    name: "settings menu",
    path: "/books/angel-1?chapter=c1",
    ready: editorReady,
    open: click((page) => page.getByRole("button", { name: "Settings", exact: true })),
    opened: scoped(OVERLAY.menu),
    scope: OVERLAY.menu,
  },
  {
    name: "hosted settings menu",
    path: "/",
    hosted: "1",
    ready: libraryReady,
    open: click((page) => page.getByRole("button", { name: "Settings", exact: true })),
    opened: scoped(OVERLAY.menu),
    scope: OVERLAY.menu,
  },
  {
    name: "hosted upload choose a file",
    path: "/",
    hosted: "1",
    ready: libraryReady,
    open: openUpload,
    opened: scoped(OVERLAY.dialog),
    scope: OVERLAY.dialog,
  },
  {
    name: "hosted upload",
    path: "/",
    hosted: "1",
    ready: libraryReady,
    open: upload(`${ANGEL} 4.epub`),
    opened: scoped(OVERLAY.dialog),
    scope: OVERLAY.dialog,
  },
  { name: "admin", path: "/admin", hosted: "1", ready: adminReady },
  {
    name: "admin invite link dialog",
    path: "/admin",
    hosted: "1",
    ready: adminReady,
    open: click((page) => page.getByRole("button", { name: "Create invite" })),
    opened: scoped(OVERLAY.dialog),
    scope: OVERLAY.dialog,
  },
  {
    name: "admin reset link dialog",
    path: "/admin",
    hosted: "1",
    ready: adminReady,
    open: click((page) => page.getByRole("button", { name: /^Reset link for / }).first()),
    opened: scoped(OVERLAY.dialog),
    scope: OVERLAY.dialog,
  },
  {
    name: "admin delete user dialog",
    path: "/admin",
    hosted: "1",
    ready: adminReady,
    open: click((page) => page.getByRole("button", { name: /^Delete / }).first()),
    opened: scoped(OVERLAY.dialog),
    scope: OVERLAY.dialog,
  },
  { name: "hosted editor", path: "/books/angel-1?chapter=c1", hosted: "1", ready: editorReady },
  {
    name: "api keys dialog",
    path: "/books/angel-1?chapter=c1",
    hosted: "1",
    ready: editorReady,
    open: openApiKeys,
    opened: scoped(OVERLAY.dialog),
    scope: OVERLAY.dialog,
  },
  {
    name: "api keys unlocked",
    path: "/books/angel-1?chapter=c1",
    hosted: "1",
    ready: editorReady,
    open: async (page) => {
      await openApiKeys(page);
      await page.getByLabel("New passphrase").fill(MOCK_PASSPHRASE);
      await page.getByLabel("Repeat passphrase").fill(MOCK_PASSPHRASE);
      await page.getByRole("button", { name: "Set passphrase" }).click();
      await page.getByRole("button", { name: "Add Google Gemini key" }).click();
    },
    opened: (page) => page.locator(OVERLAY.dialog).filter({ hasText: "Generative Language API" }),
    scope: OVERLAY.dialog,
  },
  {
    name: "api keys locked",
    path: "/books/angel-1?chapter=c1",
    hosted: "1",
    ready: editorReady,
    open: async (page) => {
      await openApiKeys(page);
      await page.getByLabel("New passphrase").fill(MOCK_PASSPHRASE);
      await page.getByLabel("Repeat passphrase").fill(MOCK_PASSPHRASE);
      await page.getByRole("button", { name: "Set passphrase" }).click();
      await page.getByRole("button", { name: "Add Anthropic Claude key" }).click();
      await page.getByLabel("Anthropic Claude API key").fill("sk-ant-mock-key-0000");
      await page.getByRole("button", { name: "Save key" }).click();
      await page.getByText(/^saved · ending/).waitFor();
      await page.getByRole("button", { name: "Lock now" }).click();
    },
    opened: (page) => page.locator(OVERLAY.dialog).filter({ hasText: "Forgot it?" }),
    scope: OVERLAY.dialog,
  },
  {
    name: "sign in",
    path: "/signin",
    hosted: "signed-out",
    ready: text("Access is by invitation only."),
  },
  {
    name: "invite",
    path: "/invite",
    hash: "t=mock-invite",
    hosted: "signed-out",
    ready: text("Create your account"),
  },
  {
    name: "invite incomplete",
    path: "/invite",
    hosted: "signed-out",
    ready: text("Invite link incomplete"),
  },
  { name: "reset password", path: "/reset", hosted: "1", ready: text("Choose a new password") },
  {
    name: "reset link expired",
    path: "/reset",
    hosted: "signed-out",
    ready: text("This reset link is no longer valid."),
  },
];
