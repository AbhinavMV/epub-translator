import { useSyncExternalStore } from "react";
import { useDeviceStores } from "./device-stores";
import { createListeners, readJson, type StorageLike, writeJson } from "./storage";

const STORAGE_KEY = "et.renameOfferDismissed";

export function createRenameOfferStore(storage: StorageLike | null) {
  const raw = readJson(storage, STORAGE_KEY);
  let dismissed: Readonly<Record<string, string>> =
    typeof raw === "object" && raw !== null ? (raw as Record<string, string>) : {};
  const { notify, subscribe } = createListeners();
  return {
    isDismissed: (projectId: string, title: string) => dismissed[projectId] === title,
    dismiss(projectId: string, title: string) {
      dismissed = { ...dismissed, [projectId]: title };
      writeJson(storage, STORAGE_KEY, dismissed);
      notify();
    },
    subscribe,
  };
}

export type RenameOfferStore = ReturnType<typeof createRenameOfferStore>;

/** "Not now" on the rename offer is remembered per project and offered title. */
export function useRenameOfferDismissal(projectId: string, title: string | null) {
  const store = useDeviceStores().renameOffer;
  const dismissed = useSyncExternalStore(store.subscribe, () =>
    title === null ? false : store.isDismissed(projectId, title),
  );
  return {
    dismissed,
    dismiss: () => {
      if (title !== null) store.dismiss(projectId, title);
    },
  };
}
