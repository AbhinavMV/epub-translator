import { mkdirSync } from "node:fs";
import { XmlChapterRenderer, YauzlEpubAssets, YauzlEpubParser, YazlEpubExporter } from "@et/epub";
import { FakeProvider } from "@et/providers";
import { systemClock } from "./infra/node-system.ts";
import { createServices, type Services } from "./services.ts";

export function composeServices(options: {
  dataDir: string;
  env: Record<string, string | undefined>;
  discoverModels?: boolean;
}): Services {
  if (options.dataDir !== ":memory:") mkdirSync(options.dataDir, { recursive: true });
  const fakeDelayMs = Number(options.env.FAKE_PROVIDER_DELAY_MS ?? 300);
  return createServices({
    dataDir: options.dataDir,
    env: options.env,
    discoverModels: options.discoverModels ?? true,
    ...(options.env.ENABLE_FAKE_PROVIDER === "1"
      ? {
          fakeProvider: new FakeProvider({
            delayMs: Number.isFinite(fakeDelayMs) ? fakeDelayMs : 0,
          }),
        }
      : {}),
    epub: {
      parser: new YauzlEpubParser(),
      assets: new YauzlEpubAssets(),
      renderer: new XmlChapterRenderer(),
      exporter: new YazlEpubExporter(systemClock),
    },
  });
}
