import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiProvider } from "@/api/api-context";
import { type Api, createHttpApi } from "@/api/client";
import { type Hosted, HostedProvider } from "@/keys/hosted-context";
import { UnlockDialog } from "@/keys/keys-dialog";
import { createQueryClient } from "@/lib/query-client";
import { isHostedConfig } from "@/translate/hosted-config";
import { createWorkApi } from "@/translate/work-api";
import { router } from "./router";
import "./styles.css";

interface Boot {
  api: Api;
  hosted: Hosted | null;
}

async function pickApi(): Promise<Boot> {
  if (import.meta.env.VITE_MOCK_API === "1") {
    const { createMockApi } = await import("@/api/mock");
    return { api: createMockApi(), hosted: null };
  }
  const base = createHttpApi();
  const work = createWorkApi();
  const config = await work.getConfig().catch(() => null);
  if (!config || !isHostedConfig(config)) return { api: base, hosted: null };
  const { composeHostedClient } = await import("@/translate/compose-hosted");
  return composeHostedClient({ base, work, scope: HOSTED_SCOPE });
}

const HOSTED_SCOPE = "local";

async function boot() {
  const root = document.getElementById("root");
  if (!root) return;
  const { api, hosted } = await pickApi();
  const queryClient = createQueryClient();
  const app = (
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <UnlockDialog />
      </QueryClientProvider>
    </ApiProvider>
  );
  createRoot(root).render(
    <StrictMode>
      {hosted ? <HostedProvider hosted={hosted}>{app}</HostedProvider> : app}
    </StrictMode>,
  );
}

void boot();
