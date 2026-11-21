import { type GlossaryEntry, MAX_GLOSSARY_ENTRIES } from "@et/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster, toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlossaryDialog } from "@/components/editor/glossary-dialog";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const entries = (prefix: string, n: number): GlossaryEntry[] =>
  Array.from({ length: n }, (_, i) => ({ source: `${prefix}${i}`, target: `${prefix}-${i}` }));

async function addSuggestionsTo(glossary: GlossaryEntry[], suggested: GlossaryEntry[]) {
  render(
    <>
      <GlossaryDialog
        glossary={glossary}
        saving={false}
        onSave={vi.fn(async () => undefined)}
        suggestions={(add) => (
          <button type="button" onClick={() => add(suggested)}>
            Add suggestions
          </button>
        )}
      />
      <Toaster />
    </>,
  );
  await userEvent.click(screen.getByRole("button", { name: /^glossary/i }));
  await userEvent.click(screen.getByRole("button", { name: "Add suggestions" }));
}

describe("glossary entry limit", () => {
  afterEach(() => toast.dismiss());

  it("tells the reader how many suggestions were added and how many the limit left out", async () => {
    await addSuggestionsTo(entries("old", MAX_GLOSSARY_ENTRIES - 2), [
      ...entries("old", 1),
      ...entries("new", 5),
    ]);
    expect(
      await screen.findByText(
        "Added 2 suggestions. 3 were left out: a glossary holds at most 2,000 entries.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "Source term" })).toHaveLength(
      MAX_GLOSSARY_ENTRIES,
    );
  }, 60_000);

  it("adds every suggestion quietly while they fit", async () => {
    await addSuggestionsTo(entries("old", 1), entries("new", 3));
    expect(screen.getAllByRole("textbox", { name: "Source term" })).toHaveLength(4);
    expect(screen.queryByText(/left out/)).not.toBeInTheDocument();
  });
});
