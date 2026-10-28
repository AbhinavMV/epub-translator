import { BookSummarySchema, ChapterViewSchema, JobSummarySchema } from "@et/contracts";
import { readZip, YauzlEpubParser } from "@et/epub";
import { describe, expect, it } from "vitest";
import { buildFixtureEpub } from "../../../packages/epub/test/fixtures/build-fixture.ts";
import { createApp } from "../src/app.ts";
import { composeLocalServices } from "../src/compose-local.ts";

describe("api with real epub adapters", () => {
  it("imports, translates a chapter, renders it and exports a valid english epub", async () => {
    const services = composeLocalServices({
      dataDir: ":memory:",
      env: { ENABLE_FAKE_PROVIDER: "1", FAKE_PROVIDER_DELAY_MS: "0" },
      discoverModels: false,
    });
    const app = createApp(services);

    const form = new FormData();
    form.append("file", new File([new Uint8Array(await buildFixtureEpub())], "fixture.epub"));
    const book = BookSummarySchema.parse(
      await (await app.request("/api/books", { method: "POST", body: form })).json(),
    );
    expect(book.sourceLang).toBe("ja");

    const job = JobSummarySchema.parse(
      await (await app.request(`/api/books/${book.id}/workspace?targetLang=en`)).json(),
    );
    const chapter = job.progress.find((p) => p.total > 0 && p.chapterId !== "ch-contents");
    if (!chapter) throw new Error("fixture has no text chapter");
    await app.request(`/api/jobs/${job.id}/chapters/${chapter.chapterId}/translate`, {
      method: "POST",
      body: JSON.stringify({ provider: "fake", model: "fake-echo" }),
      headers: { "content-type": "application/json" },
    });
    await services.runner.whenIdle();

    const view = ChapterViewSchema.parse(
      await (
        await app.request(`/api/books/${book.id}/chapters/${chapter.chapterId}?jobId=${job.id}`)
      ).json(),
    );
    const segments = view.blocks.filter((b) => b.kind === "segment");
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.every((b) => b.kind === "segment" && b.targetHtml?.includes("[en]"))).toBe(
      true,
    );

    const exported = new Uint8Array(
      await (await app.request(`/api/jobs/${job.id}/export`)).arrayBuffer(),
    );
    expect([...(await readZip(exported)).keys()][0]).toBe("mimetype");
    const reparsed = await new YauzlEpubParser().parse(exported);
    expect(reparsed.sourceLang).toBe("en");
  });
});
