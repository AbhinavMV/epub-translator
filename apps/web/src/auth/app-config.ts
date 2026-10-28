import { type AppConfig, AppConfigSchema } from "@et/contracts";
import type { FetchFn } from "./authed-fetch";

export const LOCAL_CONFIG: AppConfig = {
  authMode: "none",
  supabaseUrl: null,
  supabasePublishableKey: null,
};

export async function fetchAppConfig(
  base: FetchFn = (...args) => fetch(...args),
): Promise<AppConfig> {
  try {
    const res = await base("/api/config");
    if (!res.ok) return LOCAL_CONFIG;
    const parsed = AppConfigSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : LOCAL_CONFIG;
  } catch {
    return LOCAL_CONFIG;
  }
}
