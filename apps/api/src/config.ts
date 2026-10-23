import { z } from "zod";

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().default("127.0.0.1"),
  DATA_DIR: z.string().default("./data"),
});

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  env: Record<string, string | undefined>;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = ConfigSchema.parse(env);
  return { port: parsed.PORT, host: parsed.HOST, dataDir: parsed.DATA_DIR, env };
}
