import { createContext, type ReactNode, useContext } from "react";
import { createGlossarySkipStore, type GlossarySkipStore } from "./glossary-skip-store";
import { createLastOpenedStore, type LastOpenedStore } from "./last-opened-store";
import { createPrefsStore, type PrefsStore } from "./reader-settings-store";
import { createRenameOfferStore, type RenameOfferStore } from "./rename-offer-store";
import type { StorageLike } from "./storage";

export interface DeviceStores {
  prefs: PrefsStore;
  glossarySkip: GlossarySkipStore;
  lastOpened: LastOpenedStore;
  renameOffer: RenameOfferStore;
}

export function createDeviceStores(storage: StorageLike | null): DeviceStores {
  return {
    prefs: createPrefsStore(storage),
    glossarySkip: createGlossarySkipStore(storage),
    lastOpened: createLastOpenedStore(storage),
    renameOffer: createRenameOfferStore(storage),
  };
}

const DeviceStoresContext = createContext<DeviceStores | null>(null);

export function DeviceStoresProvider({
  stores,
  children,
}: {
  stores: DeviceStores;
  children: ReactNode;
}) {
  return <DeviceStoresContext.Provider value={stores}>{children}</DeviceStoresContext.Provider>;
}

export function useDeviceStores(): DeviceStores {
  const stores = useContext(DeviceStoresContext);
  if (!stores) throw new Error("DeviceStoresProvider is missing");
  return stores;
}
