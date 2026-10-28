import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiProvider } from "@/api/api-context";
import { type Api, createHttpApi } from "@/api/client";
import { AdminApiProvider, createHttpAdminApi } from "@/auth/admin-api";
import { fetchAppConfig, LOCAL_CONFIG } from "@/auth/app-config";
import { type AuthClient, createSupabaseAuthClient } from "@/auth/auth-client";
import { AuthProvider } from "@/auth/auth-context";
import { authedFetch, type FetchFn } from "@/auth/authed-fetch";
import { createQueryClient } from "@/lib/query-client";
import { router } from "./router";
import "./styles.css";

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
  const api: Api = mock ? (await import("@/api/mock")).createMockApi() : createHttpApi(fetchFn);
  const queryClient = createQueryClient();
  createRoot(root).render(
    <StrictMode>
      <AuthProvider client={client}>
        <AdminApiProvider value={createHttpAdminApi(fetchFn)}>
          <ApiProvider api={api}>
            <QueryClientProvider client={queryClient}>
              <RouterProvider router={router} />
            </QueryClientProvider>
          </ApiProvider>
        </AdminApiProvider>
      </AuthProvider>
    </StrictMode>,
  );
}

void boot();
