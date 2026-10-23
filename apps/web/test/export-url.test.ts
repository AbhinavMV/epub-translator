import { describe, expect, it } from "vitest";
import { createHttpApi } from "@/api/client";

describe("exportUrl", () => {
  const api = createHttpApi();

  it("defaults to the translation-only epub", () => {
    expect(api.exportUrl("j 1", "epub")).toBe("/api/jobs/j%201/export");
  });

  it("asks for the bilingual layout", () => {
    expect(api.exportUrl("j1", "epub", "bilingual")).toBe("/api/jobs/j1/export?layout=bilingual");
  });

  it("ignores the layout for text exports", () => {
    expect(api.exportUrl("j1", "txt", "bilingual")).toBe("/api/jobs/j1/export.txt");
  });
});
