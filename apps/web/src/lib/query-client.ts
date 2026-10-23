import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

function report(error: unknown) {
  toast.error(error instanceof Error ? error.message : "Something went wrong");
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: report }),
    mutationCache: new MutationCache({ onError: report }),
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5_000 } },
  });
}
