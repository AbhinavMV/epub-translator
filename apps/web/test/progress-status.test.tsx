import type { ProjectSummary } from "@et/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusLine } from "@/components/status-line";
import { projectProgress, volumeProgress } from "@/lib/progress-status";

const project = (p: Partial<ProjectSummary>): ProjectSummary => ({
  id: "p1",
  name: "Angel",
  createdAt: "2026-11-01T00:00:00.000Z",
  volumeCount: 4,
  coverUrl: null,
  fullyTranslatedLang: null,
  mainLang: null,
  translatedVolumeCount: 0,
  ...p,
});

describe("projectProgress", () => {
  it.each([
    ["nothing translated", {}, "Not started · 4 volumes", 0, false],
    ["one volume", { volumeCount: 1 }, "Not started · 1 volume", 0, false],
    ["started but no volume complete", { mainLang: "en" }, "0 of 4 volumes translated", 0, false],
    [
      "some volumes complete",
      { mainLang: "en", translatedVolumeCount: 2 },
      "2 of 4 volumes translated",
      0.5,
      false,
    ],
    [
      "fully translated into English",
      { mainLang: "en", translatedVolumeCount: 4, fullyTranslatedLang: "en" },
      "Fully translated",
      1,
      true,
    ],
    [
      "fully translated into another language",
      { mainLang: "fr", translatedVolumeCount: 4, fullyTranslatedLang: "fr" },
      "Fully translated · French",
      1,
      true,
    ],
    ["an empty project is not fully translated", { volumeCount: 0 }, "No volumes", 0, false],
  ] as const)("%s", (_, overrides, text, ratio, done) => {
    expect(projectProgress(project(overrides))).toEqual({ text, ratio, done });
  });
});

describe("volumeProgress", () => {
  it.each([
    ["no main language", null, null, "Not started", 0, false],
    ["nothing in the main language", 0, "en", "Not started", 0, false],
    ["under one percent", 0.4, "en", "Under 1% translated", 0.004, false],
    ["part translated", 34, "en", "34% translated", 0.34, false],
    ["never rounds up to done", 99.7, "en", "99% translated", 0.997, false],
    ["complete in English", 100, "en", "Translated", 1, true],
    ["complete in French", 100, "fr", "Translated · French", 1, true],
  ] as const)("%s", (_, percent, mainLang, text, ratio, done) => {
    expect(volumeProgress({ translatedPercent: percent }, mainLang)).toEqual({ text, ratio, done });
  });
});

describe("StatusLine", () => {
  it("shows the text and a bar filled to the ratio", () => {
    render(<StatusLine status={{ text: "34% translated", ratio: 0.34, done: false }} />);
    expect(screen.getByText("34% translated")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "34% translated" })).toHaveAttribute(
      "aria-valuenow",
      "34",
    );
  });

  it("can leave the bar out", () => {
    render(<StatusLine status={{ text: "Not started", ratio: 0, done: false }} bar={false} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
