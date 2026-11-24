import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Shows `message` when the user navigates to another page. Listens to the router rather than
 * an unmount cleanup, which StrictMode runs on mount too and chapter switches would not need.
 */
export function useLeaveNotice(message: string | null) {
  const router = useRouter();
  const latest = useRef(message);
  latest.current = message;
  useEffect(
    () =>
      router.subscribe("onBeforeNavigate", (event) => {
        if (event.pathChanged && latest.current) toast.message(latest.current);
      }),
    [router],
  );
}
