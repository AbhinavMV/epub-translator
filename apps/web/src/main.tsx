import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiProvider } from "@/api/api-context";
import { type Api, createHttpApi } from "@/api/client";
import { createQueryClient } from "@/lib/query-client";
import { router } from "./router";
import "./styles.css";

async function pickApi(): Promise<Api> {
  if (import.meta.env.VITE_MOCK_API === "1") {
    const { createMockApi } = await import("@/api/mock");
    return createMockApi();
  }
  return createHttpApi();
}

async function boot() {
  const root = document.getElementById("root");
  if (!root) return;
  const api = await pickApi();
  const queryClient = createQueryClient();
  createRoot(root).render(
    <StrictMode>
      <ApiProvider api={api}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ApiProvider>
    </StrictMode>,
  );
}

void boot();
