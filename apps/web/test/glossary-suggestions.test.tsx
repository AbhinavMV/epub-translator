import type { ProviderInfo } from "@et/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/api-context";
import type { Api } from "@/api/client";
import { createMockApi } from "@/api/mock";
import { GlossarySuggestions } from "@/components/editor/glossary-suggestions";

const providers: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    configured: true,
    models: ["claude-sonnet-5-5", "claude-haiku-5-5"],
    defaultModel: "claude-sonnet-5-5",
    termsModel: "claude-haiku-5-5",
  },
];

const terms = [
  { source: "シャル", target: "Charlotte", note: "female lead" },
  { source: "魔王", target: "Demon King" },
];

function renderIt(overrides: Partial<Api>, onAdd = vi.fn()) {
  const api = { ...createMockApi(), ...overrides };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider api={api}>
        <GlossarySuggestions
          bookId="b1"
          targetLang="en"
          providers={providers}
          selection={{ provider: "anthropic", model: "claude-sonnet-5-5" }}
          onAdd={onAdd}
        />
      </ApiProvider>
    </QueryClientProvider>,
  );
  return { onAdd };
}

describe("GlossarySuggestions", () => {
  it("requests suggestions with the provider's cheap model and lists them all checked", async () => {
    const suggestGlossary = vi.fn(async () => ({
      terms,
      usage: { inputTokens: 1200, outputTokens: 80 },
    }));
    renderIt({ suggestGlossary });

    await userEvent.click(screen.getByRole("button", { name: /suggest from book/i }));

    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
    expect(suggestGlossary).toHaveBeenCalledWith("b1", {
      provider: "anthropic",
      model: "claude-haiku-5-5",
      targetLang: "en",
    });
    expect(screen.getByText(/1,200 in/)).toBeInTheDocument();
  });

  it("adds only the checked suggestions", async () => {
    const { onAdd } = renderIt({ suggestGlossary: async () => ({ terms, usage: null }) });

    await userEvent.click(screen.getByRole("button", { name: /suggest from book/i }));
    const boxes = await screen.findAllByRole("checkbox");
    await userEvent.click(boxes[0] as HTMLElement);
    await userEvent.click(screen.getByRole("button", { name: /add selected/i }));

    expect(onAdd).toHaveBeenCalledWith([terms[1]]);
    await waitFor(() => expect(screen.queryAllByRole("checkbox")).toHaveLength(0));
  });

  it("shows a loading state while the request is pending", async () => {
    renderIt({ suggestGlossary: () => new Promise(() => {}) });
    await userEvent.click(screen.getByRole("button", { name: /suggest from book/i }));
    expect(await screen.findByRole("button", { name: /suggesting/i })).toBeDisabled();
  });
});
