import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

function freePort(): string {
  const script =
    "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close()})";
  return execFileSync(process.execPath, ["-e", script], { encoding: "utf8" });
}

// Workers load this file again; the env var carries the runner's port to them so they all agree.
process.env.SWEEP_PORT ??= freePort();
const port = Number(process.env.SWEEP_PORT);
const outDir = "node_modules/.cache/width-sweep";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? "100%" : "50%",
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  timeout: 120_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...devices["Desktop Chrome"],
    deviceScaleFactor: 1,
  },
  projects: [{ name: "chromium" }],
  webServer: {
    command: `vite build --outDir ${outDir} --emptyOutDir --logLevel warn && vite preview --outDir ${outDir} --host 127.0.0.1 --port ${port} --strictPort`,
    env: { VITE_MOCK_API: "1" },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
