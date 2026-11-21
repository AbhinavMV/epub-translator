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
    supportsBatch: true,
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
          bookIds={["b1"]}
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

    await screen.findByText(/request/);
    await userEvent.click(screen.getByRole("button", { name: /suggest from book/i }));

    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
    expect(suggestGlossary).toHaveBeenCalledWith(
      "b1",
      {
        provider: "anthropic",
        model: "claude-haiku-5-5",
        targetLang: "en",
        sampleSize: "large",
        chunk: 0,
      },
      expect.any(AbortSignal),
    );
    expect(screen.getByText(/1,200 in/)).toBeInTheDocument();
  });

  it("adds only the checked suggestions", async () => {
    const { onAdd } = renderIt({ suggestGlossary: async () => ({ terms, usage: null }) });

    await screen.findByText(/request/);
    await userEvent.click(screen.getByRole("button", { name: /suggest from book/i }));
    const boxes = await screen.findAllByRole("checkbox");
    await userEvent.click(boxes[0] as HTMLElement);
    await userEvent.click(screen.getByRole("button", { name: /add selected/i }));

    expect(onAdd).toHaveBeenCalledWith([terms[1]]);
    await waitFor(() => expect(screen.queryAllByRole("checkbox")).toHaveLength(0));
  });

  it("shows a loading state while the request is pending", async () => {
    renderIt({ suggestGlossary: () => new Promise(() => {}) });
    await screen.findByText(/request/);
    await userEvent.click(screen.getByRole("button", { name: /suggest from book/i }));
    expect(await screen.findByRole("button", { name: /suggesting/i })).toBeDisabled();
  });

  it("shows the request count and characters for the chosen sample size before starting", async () => {
    renderIt({});
    expect(await screen.findByText("1 request · ~40,000 chars")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Standard" }));
    expect(await screen.findByText("1 request · ~12,000 chars")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Entire volume" }));
    expect(await screen.findByText("3 requests · ~112,400 chars")).toBeInTheDocument();
  });

  it("runs one request per chunk of an entire volume and merges them, earliest rendering first", async () => {
    const chunks = [
      [{ source: "椎名真昼", target: "Mahiru Shiina" }],
      [
        { source: "椎名真昼", target: "Shiina Mahiru" },
        { source: "藤宮周", target: "Amane Fujimiya" },
      ],
      [
        { source: "赤澤樹", target: "Itsuki Akazawa" },
        { source: "白河千歳", target: "Chitose Shirakawa" },
        { source: "天使様", target: "Angel" },
        { source: "  藤宮周", target: "Fujimiya Amane" },
      ],
    ];
    const suggestGlossary = vi.fn(
      async (_id: string, body: { sampleSize?: string; chunk?: number }) => ({
        terms: chunks[body.chunk ?? 0] ?? [],
        usage: { inputTokens: 100, outputTokens: 10 },
      }),
    );
    renderIt({ suggestGlossary });
    await userEvent.click(await screen.findByRole("radio", { name: "Entire volume" }));
    await screen.findByText(/3 requests/);
    await userEvent.click(screen.getByRole("button", { name: /suggest from book/i }));

    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(5));
    expect(screen.getByText(/300 in · 30 out/)).toBeInTheDocument();
    expect(suggestGlossary.mock.calls.map(([, body]) => [body.sampleSize, body.chunk])).toEqual([
      ["volume", 0],
      ["volume", 1],
      ["volume", 2],
    ]);
    expect(screen.getByText(/Mahiru Shiina/)).toBeInTheDocument();
    expect(screen.queryByText(/Shiina Mahiru/)).not.toBeInTheDocument();
  });

  it("keeps the terms gathered so far when stopped", async () => {
    const suggestGlossary = vi.fn((_id: string, body: { chunk?: number }, signal?: AbortSignal) =>
      body.chunk === 0
        ? Promise.resolve({ terms: [terms[0] as (typeof terms)[0]], usage: null })
        : new Promise<never>((_, reject) => {
            signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
    );
    renderIt({ suggestGlossary });
    await userEvent.click(await screen.findByRole("radio", { name: "Entire volume" }));
    await screen.findByText(/3 requests/);
    await userEvent.click(screen.getByRole("button", { name: /suggest from book/i }));
    expect(await screen.findByText(/2 of 3/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /suggest from book/i })).toBeEnabled(),
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(suggestGlossary).toHaveBeenCalledTimes(2);
  });

  it("ends the run on a failed request, keeping the terms gathered so far", async () => {
    const suggestGlossary = vi.fn(async (_id: string, body: { chunk?: number }) => {
      if (body.chunk === 1) throw new Error("Rate limited");
      return { terms, usage: null };
    });
    renderIt({ suggestGlossary });
    await userEvent.click(await screen.findByRole("radio", { name: "Entire volume" }));
    await screen.findByText(/3 requests/);
    await userEvent.click(screen.getByRole("button", { name: /suggest from book/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Rate limited");
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(suggestGlossary).toHaveBeenCalledTimes(2);
  });
});
