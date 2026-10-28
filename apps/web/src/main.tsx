import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiProvider } from "@/api/api-context";
import { type Api, createHttpApi } from "@/api/client";
import { createSupabaseUploader } from "@/api/signed-upload";
import { AdminApiProvider, createHttpAdminApi } from "@/auth/admin-api";
import { fetchAppConfig, LOCAL_CONFIG } from "@/auth/app-config";
import { type AuthClient, createSupabaseAuthClient } from "@/auth/auth-client";
import { AuthProvider } from "@/auth/auth-context";
import { authedFetch, type FetchFn } from "@/auth/authed-fetch";
import { type Hosted, HostedProvider } from "@/keys/hosted-context";
import { UnlockDialog } from "@/keys/keys-dialog";
import { createQueryClient } from "@/lib/query-client";
import { isHostedConfig } from "@/translate/hosted-config";
import { createWorkApi } from "@/translate/work-api";
import { router } from "./router";
import "./styles.css";

const SIGNED_OUT_SCOPE = "signed-out";

/** The key vault is namespaced per signed-in user; a different user means a fresh composition. */
function reloadWhenUserChanges(client: AuthClient, scope: string) {
  client.onChange((event, session) => {
    if (event === "SIGNED_OUT") window.dispatchEvent(new Event("et:sign-out"));
    const next = session?.userId ?? SIGNED_OUT_SCOPE;
    if (next !== scope) window.location.reload();
  });
}

async function boot() {
  const root = document.getElementById("root");
  if (!root) return;
  const mock = import.meta.env.VITE_MOCK_API === "1";
  const config = mock ? LOCAL_CONFIG : await fetchAppConfig();
  const client: AuthClient | null =
    config.authMode === "supabase" && config.supabaseUrl && config.supabasePublishableKey
      ? createSupabaseAuthClient(config.supabaseUrl, config.supabasePublishableKey)
      : null;
  const fetchFn: FetchFn | undefined = client ? authedFetch(client) : undefined;

  let api: Api = mock
    ? (await import("@/api/mock")).createMockApi()
    : createHttpApi(fetchFn, undefined, {
        upload: { mode: config.uploadMode, maxBytes: config.maxUploadBytes },
        ...(config.uploadMode === "signed" && config.supabaseUrl && config.supabasePublishableKey
          ? { uploader: createSupabaseUploader(config.supabaseUrl, config.supabasePublishableKey) }
          : {}),
      });
  let hosted: Hosted | null = null;
  if (!mock && isHostedConfig(config)) {
    const scope = client ? ((await client.getSession())?.userId ?? SIGNED_OUT_SCOPE) : "local";
    const { composeHostedClient } = await import("@/translate/compose-hosted");
    ({ api, hosted } = await composeHostedClient({
      base: api,
      work: createWorkApi(fetchFn),
      scope,
    }));
    if (client) reloadWhenUserChanges(client, scope);
  }

  const queryClient = createQueryClient();
  const app = (
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        {hosted ? <UnlockDialog /> : null}
      </QueryClientProvider>
    </ApiProvider>
  );
  createRoot(root).render(
    <StrictMode>
      <AuthProvider client={client}>
        <AdminApiProvider value={createHttpAdminApi(fetchFn)}>
          {hosted ? <HostedProvider hosted={hosted}>{app}</HostedProvider> : app}
        </AdminApiProvider>
      </AuthProvider>
    </StrictMode>,
  );
}

void boot();
