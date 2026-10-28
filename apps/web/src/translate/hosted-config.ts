import type { PublicConfig } from "@et/contracts";

export const isHostedConfig = (config: PublicConfig): boolean =>
  config.clientExecution || config.authMode === "supabase";
