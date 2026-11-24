import type { ProviderInfo } from "@et/contracts";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelSheet } from "@/components/editor/model-sheet";

const providers: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    configured: true,
    supportsBatch: true,
    models: ["claude-sonnet-5-5", "claude-opus-5-5"],
    defaultModel: "claude-sonnet-5-5",
  },
  {
    id: "openai",
    label: "OpenAI",
    configured: false,
    supportsBatch: true,
    models: ["gpt-5-mini"],
    defaultModel: "gpt-5-mini",
  },
];

function renderSheet(overrides: Partial<Parameters<typeof ModelSheet>[0]> = {}) {
  const props = {
    onSelection: vi.fn(),
    onMode: vi.fn(),
    onTargetLang: vi.fn(),
  };
  render(
    <ModelSheet
      providers={providers}
      selection={{ provider: "anthropic", model: "claude-sonnet-5-5" }}
      mode="live"
      batchAvailable
      targetLang="en"
      {...props}
      {...overrides}
    />,
  );
  return props;
}

describe("ModelSheet", () => {
  it("shows the model name, mode and language on the chip, not the model id", () => {
    renderSheet({ mode: "batch", targetLang: "fr" });
    const chip = screen.getByRole("button", { name: /^Model and mode/ });
    expect(chip).toHaveTextContent("Claude Sonnet 5.5");
    expect(chip).toHaveTextContent("Batch");
    expect(chip).toHaveTextContent("French");
    expect(chip).not.toHaveTextContent("claude-sonnet-5-5");
  });

  it("asks for a model when none is set up", () => {
    renderSheet({ selection: null });
    expect(screen.getByRole("button", { name: /^Model and mode/ })).toHaveTextContent(
      "Choose a model",
    );
  });

  it("opens a sheet with provider, model, mode and target language", async () => {
    const { onMode } = renderSheet();
    await userEvent.click(screen.getByRole("button", { name: /^Model and mode/ }));
    const sheet = await screen.findByRole("dialog", { name: "Model and mode" });
    expect(within(sheet).getByRole("combobox", { name: "Provider" })).toHaveTextContent(
      "Anthropic",
    );
    expect(within(sheet).getByRole("combobox", { name: "Model" })).toHaveTextContent(
      "Claude Sonnet 5.5",
    );
    expect(within(sheet).getByRole("combobox", { name: "Target language" })).toHaveTextContent(
      "English",
    );
    await userEvent.click(within(sheet).getByRole("radio", { name: /batch/i }));
    expect(onMode).toHaveBeenCalledWith("batch");
    await userEvent.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
