import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createHttpApi } from "@/api/client";
import { ExportEpubMenu } from "@/components/editor/export-epub-menu";

const SUMMARY = {
  id: "b1",
  title: "T",
  author: null,
  sourceLang: "ja",
  coverUrl: null,
  chapterCount: 1,
  segmentCount: 2,
  createdAt: "2026-10-28T00:00:00.000Z",
};

const PREVIEW = {
  kind: "new",
  title: "T 2",
  seriesTitle: "T",
  volumeNumber: 2,
  project: null,
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("signed upload", () => {
  it("uploads once to storage, previews by path, then imports into the chosen project", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push([String(url), init]);
      if (String(url) === "/api/uploads") return reply({ path: "u/incoming/x.epub", token: "tok" });
      if (String(url) === "/api/books/import/preview") return reply(PREVIEW);
      return reply(SUMMARY, 201);
    });
    const uploader = vi.fn(async () => {});
    const api = createHttpApi(fetchFn as typeof fetch, undefined, {
      upload: { mode: "signed", maxBytes: 50 },
      uploader,
    });
    const file = new File(["x"], "b.epub");
    const pending = await api.prepareImport(file);
    expect(pending.preview).toEqual(PREVIEW);
    await pending.commit({ projectId: "p1", volumeNumber: null });
    expect(uploader).toHaveBeenCalledTimes(1);
    expect(uploader).toHaveBeenCalledWith("u/incoming/x.epub", "tok", file);
    expect(calls.map(([u]) => u)).toEqual([
      "/api/uploads",
      "/api/books/import/preview",
      "/api/books/import",
    ]);
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({ path: "u/incoming/x.epub" });
    expect(JSON.parse(String(calls[2]?.[1]?.body))).toEqual({
      path: "u/incoming/x.epub",
      placement: { projectId: "p1", volumeNumber: null },
    });
  });

  it("does not import when the storage upload fails", async () => {
    const fetchFn = vi.fn(async () => reply({ path: "p", token: "t" }));
    const api = createHttpApi(fetchFn as typeof fetch, undefined, {
      upload: { mode: "signed", maxBytes: 50 },
      uploader: async () => {
        throw new Error("boom");
      },
    });
    await expect(api.prepareImport(new File(["x"], "b.epub"))).rejects.toThrow(
      /upload to storage/i,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("keeps multipart as the default, sending the placement with the file", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) =>
      String(url) === "/api/books/preview" ? reply(PREVIEW) : reply(SUMMARY, 201),
    );
    const api = createHttpApi(fetchFn as typeof fetch);
    const pending = await api.prepareImport(new File(["x"], "b.epub"));
    await pending.commit({ projectName: "New", volumeNumber: 2 });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/books/preview",
      expect.objectContaining({ method: "POST" }),
    );
    const [, init] = fetchFn.mock.calls[1] as unknown as [string, RequestInit];
    expect(fetchFn.mock.calls[1]?.[0]).toBe("/api/books");
    const form = init.body as FormData;
    expect(form.get("file")).toBeInstanceOf(File);
    expect(JSON.parse(String(form.get("placement")))).toEqual({
      projectName: "New",
      volumeNumber: 2,
    });
    expect(api.signedExports).toBe(false);
  });
});

describe("signed exports", () => {
  it("fetches the link with the authed fetch, then navigates to it", async () => {
    const fetchFn = vi.fn(async () => reply({ url: "https://x.supabase.co/sign/e.epub?token=t" }));
    const navigate = vi.fn();
    const api = createHttpApi(fetchFn as typeof fetch, undefined, {
      upload: { mode: "signed", maxBytes: 50 },
      navigate,
    });
    await api.openExport(api.exportUrl("j1", "epub", "bilingual"));
    expect(fetchFn).toHaveBeenCalledWith("/api/jobs/j1/export?layout=bilingual");
    expect(navigate).toHaveBeenCalledWith("https://x.supabase.co/sign/e.epub?token=t");
  });

  it("does not navigate when the export fails", async () => {
    const navigate = vi.fn();
    const api = createHttpApi((async () => reply({ error: "x" }, 404)) as typeof fetch, undefined, {
      upload: { mode: "signed", maxBytes: 50 },
      navigate,
    });
    await expect(api.openExport("/api/jobs/j1/export")).rejects.toThrow();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("intercepts export link clicks when a handler is given", async () => {
    const onExport = vi.fn();
    render(
      <ExportEpubMenu
        translationHref="/api/jobs/j1/export"
        bilingualHref="/api/jobs/j1/export?layout=bilingual"
        disabled={false}
        hint=""
        onExport={onExport}
      />,
    );
    await userEvent.click(screen.getByRole("link", { name: "Export EPUB" }));
    expect(onExport).toHaveBeenCalledWith("/api/jobs/j1/export");
  });
});
