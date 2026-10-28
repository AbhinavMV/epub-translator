import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { type Hosted, HostedProvider } from "@/keys/hosted-context";
import { KeysDialog, UnlockDialog } from "@/keys/keys-dialog";
import { MemoryEnvelopeStore } from "@/keys/memory-store";
import { UnlockBus } from "@/keys/unlock-bus";
import { Vault } from "@/keys/vault";
import { hostedProviders } from "@/translate/hosted-api";

const KEY = "sk-ant-fake-ui-0123456789ABCDwxyz";
const PASS = "a long enough passphrase";

async function setup(prepare?: (vault: Vault) => Promise<void>) {
  const store = new MemoryEnvelopeStore();
  const vault = new Vault({ store, scope: "u", iterations: 1000 });
  await vault.load();
  await prepare?.(vault);
  const unlock = new UnlockBus();
  const hosted = { vault, unlock, runtime: {} } as unknown as Hosted;
  render(
    <HostedProvider hosted={hosted}>
      <KeysDialog />
      <UnlockDialog />
    </HostedProvider>,
  );
  return { vault, store, unlock, user: userEvent.setup() };
}

describe("AI keys dialog", () => {
  it("first use: sets a passphrase, then adds a key and shows only the last four", async () => {
    const { vault, store, user } = await setup();
    await user.click(screen.getByRole("button", { name: /AI keys/ }));
    expect(screen.getByText(/never to this app's server/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("New passphrase"), PASS);
    await user.type(screen.getByLabelText("Repeat passphrase"), PASS);
    await user.click(screen.getByRole("button", { name: "Set passphrase" }));

    await user.click(await screen.findByRole("button", { name: "Add Anthropic Claude key" }));
    const input = screen.getByLabelText("Anthropic Claude API key");
    expect(input).toHaveAttribute("type", "password");
    await user.type(input, KEY);
    await user.click(screen.getByRole("button", { name: "Save key" }));

    await waitFor(() => expect(vault.getKey("anthropic")).toBe(KEY));
    expect(
      await screen.findByText("saved · ending xyz".replace("xyz", KEY.slice(-4))),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(KEY);
    expect(JSON.stringify(store.all())).not.toContain(KEY);
  });

  it("does not accept mismatched passphrases", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: /AI keys/ }));
    await user.type(screen.getByLabelText("New passphrase"), PASS);
    await user.type(screen.getByLabelText("Repeat passphrase"), "something else entirely");
    expect(screen.getByRole("button", { name: "Set passphrase" })).toBeDisabled();
  });

  it("shows the Gemini restriction hint", async () => {
    const { user } = await setup(async (v) => {
      await v.initialize(PASS);
    });
    await user.click(screen.getByRole("button", { name: /AI keys/ }));
    await user.click(await screen.findByRole("button", { name: "Add Google Gemini key" }));
    expect(screen.getByText(/Generative Language API/)).toBeInTheDocument();
  });

  it("forgets a key", async () => {
    const { vault, user } = await setup(async (v) => {
      await v.initialize(PASS);
      await v.setKey("openai", "sk-fake-openai-123456");
    });
    await user.click(screen.getByRole("button", { name: /AI keys/ }));
    await user.click(await screen.findByRole("button", { name: "Forget OpenAI key" }));
    await waitFor(() => expect(vault.snapshot().keys).toEqual([]));
  });
});

describe("unlock prompt", () => {
  it("rejects a wrong passphrase and resolves the request on the right one", async () => {
    const { vault, unlock, user } = await setup(async (v) => {
      await v.initialize(PASS);
      await v.setKey("anthropic", KEY);
      v.lock();
    });
    const request = unlock.request();
    const field = await screen.findByLabelText("Passphrase");

    await user.type(field, "wrong one");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Wrong passphrase/);

    await user.clear(field);
    await user.type(field, PASS);
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    await expect(request).resolves.toBeUndefined();
    expect(vault.getKey("anthropic")).toBe(KEY);
  });

  it("dismissing rejects the request", async () => {
    const { unlock, user } = await setup(async (v) => {
      await v.initialize(PASS);
      await v.setKey("anthropic", KEY);
      v.lock();
    });
    const request = unlock.request();
    const caught = request.catch((e: Error) => e.message);
    await screen.findByLabelText("Passphrase");
    await user.keyboard("{Escape}");
    expect(await caught).toBe("Unlock cancelled");
  });
});

describe("hostedProviders", () => {
  it("marks a provider configured only when the vault holds a key for it", async () => {
    const vault = new Vault({ store: new MemoryEnvelopeStore(), scope: "u", iterations: 1000 });
    await vault.load();
    await vault.initialize(PASS);
    await vault.setKey("openai", "sk-fake-openai-123456");
    const list = hostedProviders([], vault, () => undefined);
    expect(list.map((p) => [p.id, p.configured])).toEqual([
      ["anthropic", false],
      ["openai", true],
      ["gemini", false],
    ]);
    expect(list.every((p) => p.supportsBatch && p.defaultModel !== "")).toBe(true);
  });

  it("uses discovered models and keeps a fake provider from the server", async () => {
    const vault = new Vault({ store: new MemoryEnvelopeStore(), scope: "u", iterations: 1000 });
    const list = hostedProviders(
      [
        {
          id: "fake",
          label: "Offline",
          configured: true,
          models: ["fake-echo"],
          defaultModel: "fake-echo",
          supportsBatch: true,
        },
      ],
      vault,
      (p) => (p === "openai" ? ["gpt-x", "gpt-5-mini"] : undefined),
    );
    expect(list.find((p) => p.id === "openai")?.models).toEqual(["gpt-x", "gpt-5-mini"]);
    expect(list.at(-1)?.id).toBe("fake");
  });
});
