import { type PublicConfig, PublicConfigSchema } from "@et/contracts";
import type { FetchFn } from "./authed-fetch";

export const LOCAL_CONFIG: PublicConfig = {
  authMode: "none",
  supabaseUrl: null,
  supabasePublishableKey: null,
  clientExecution: false,
};

export async function fetchAppConfig(
  base: FetchFn = (...args) => fetch(...args),
): Promise<PublicConfig> {
  try {
    const res = await base("/api/config");
    if (!res.ok) return LOCAL_CONFIG;
    const parsed = PublicConfigSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : LOCAL_CONFIG;
  } catch {
    return LOCAL_CONFIG;
  }
}
