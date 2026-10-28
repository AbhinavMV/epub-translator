import type { Sleep } from "@et/core";
import type { Api } from "@/api/client";
import type { Hosted } from "@/keys/hosted-context";
import { IndexedDbEnvelopeStore } from "@/keys/idb-store";
import { UnlockBus } from "@/keys/unlock-bus";
import { Vault } from "@/keys/vault";
import { createHostedApi } from "./hosted-api";
import { ClientRuntime } from "./runtime";
import { readConcurrency } from "./settings";
import type { WorkApi } from "./work-api";

export const browserSleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

export async function composeHostedClient(options: {
  base: Api;
  work: WorkApi;
  scope: string;
  storage?: Storage;
}): Promise<{ api: Api; hosted: Hosted }> {
  const vault = new Vault({ store: new IndexedDbEnvelopeStore(), scope: options.scope });
  await vault.load().catch(() => undefined);
  const unlock = new UnlockBus();
  const storage = options.storage ?? window.localStorage;
  const runtime = new ClientRuntime({
    api: options.work,
    base: options.base,
    vault,
    sleep: browserSleep,
    concurrency: () => readConcurrency(storage),
    requestUnlock: () =>
      vault.snapshot().status === "locked"
        ? unlock.request()
        : Promise.reject(new Error("No keys saved")),
  });
  return { api: createHostedApi(options.base, runtime, vault), hosted: { vault, runtime, unlock } };
}
