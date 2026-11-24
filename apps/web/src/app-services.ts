import type { Api } from "@/api/client";
import type { AdminApi } from "@/auth/admin-api";
import type { AuthClient } from "@/auth/auth-client";
import type { FetchFn } from "@/auth/authed-fetch";
import type { Hosted } from "@/keys/hosted-context";

export interface AppServices {
  api: Api;
  client: AuthClient | null;
  authFetch?: FetchFn;
  adminApi: AdminApi;
  hosted: Hosted | null;
}
