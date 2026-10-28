import { describe, expect, it } from "vitest";
import { exportText } from "../../src/index.ts";
import { MemoryBooks, MemoryJobs, MemoryTranslations, sampleParsed } from "./fakes.ts";

describe("exportText", () => {
  it("joins translated chapters with headings and strips placeholders", async () => {
    const books = new MemoryBooks();
    await books.insert(
      {
        id: "b1",
        sha256: "s",
        title: "本",
        author: null,
        sourceLang: "ja",
        coverHref: null,
        createdAt: "",
      },
      sampleParsed,
    );
    const jobs = new MemoryJobs();
    await jobs.insert({
      id: "j1",
      bookId: "b1",
      targetLang: "en",
      sourceLang: "ja",
      error: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: "",
    });
    const translations = new MemoryTranslations();
    await translations.put("j1", "a.xhtml#0", { text: "One", status: "done" });
    await translations.put("j1", "a.xhtml#1", { text: "Two <1>!?</1><x2/>", status: "done" });

    const out = await exportText({ books, jobs, translations }, "j1");

    expect(out.filename).toBe("本 (en).txt");
    expect(out.text).toBe("第一章\n\nOne\n\nTwo !?\n");
  });

  it("starts with the translated book title and names the file after it", async () => {
    const books = new MemoryBooks();
    await books.insert(
      {
        id: "b1",
        sha256: "s",
        title: "本",
        author: null,
        sourceLang: "ja",
        coverHref: null,
        createdAt: "",
      },
      sampleParsed,
    );
    const jobs = new MemoryJobs();
    await jobs.insert({
      id: "j1",
      bookId: "b1",
      targetLang: "en",
      sourceLang: "ja",
      error: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: "",
    });
    const translations = new MemoryTranslations();
    await translations.put("j1", "opf#title", { text: "The Book", status: "done" });
    await translations.put("j1", "a.xhtml#0", { text: "One", status: "done" });

    const out = await exportText({ books, jobs, translations }, "j1");

    expect(out.filename).toBe("The Book (en).txt");
    expect(out.text).toBe("The Book\n\n\n第一章\n\nOne\n");
  });
});
