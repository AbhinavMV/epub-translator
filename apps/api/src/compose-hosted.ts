import type { Services } from "./services.ts";

export function composeHostedServices(_env: Record<string, string | undefined>): Services {
  throw new Error("hosted mode not configured");
}
