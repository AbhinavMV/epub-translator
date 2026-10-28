import { createContext, type ReactNode, useContext, useEffect, useSyncExternalStore } from "react";
import type { ClientRuntime } from "@/translate/runtime";
import type { UnlockBus } from "./unlock-bus";
import type { Vault, VaultSnapshot } from "./vault";

export const SIGN_OUT_EVENT = "et:sign-out";

export interface Hosted {
  vault: Vault;
  runtime: ClientRuntime;
  unlock: UnlockBus;
}

const HostedContext = createContext<Hosted | null>(null);

export function HostedProvider({ hosted, children }: { hosted: Hosted; children: ReactNode }) {
  useEffect(() => hosted.vault.lockOn(window, ["pagehide", SIGN_OUT_EVENT]), [hosted.vault]);
  return <HostedContext.Provider value={hosted}>{children}</HostedContext.Provider>;
}

export function useHosted(): Hosted | null {
  return useContext(HostedContext);
}

export function useVaultSnapshot(vault: Vault | undefined): VaultSnapshot | null {
  const subscribe = (listener: () => void) => vault?.subscribe(listener) ?? (() => {});
  return useSyncExternalStore(subscribe, () => vault?.snapshot() ?? null);
}
