import { useState } from "react";

const KEY = "et.renameOfferDismissed";

function read(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** "Not now" on the rename offer, per project and offered title, on this device. */
export function useRenameOfferDismissal(projectId: string, title: string | null) {
  const [dismissed, setDismissed] = useState(read);
  return {
    dismissed: title !== null && dismissed[projectId] === title,
    dismiss: () => {
      if (title === null) return;
      const next = { ...read(), [projectId]: title };
      setDismissed(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
    },
  };
}
