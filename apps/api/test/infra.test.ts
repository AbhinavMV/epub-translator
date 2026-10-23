import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JobEvent } from "@et/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { FsBlobStore } from "../src/infra/fs-blob-store.ts";
import { JobEventBus } from "../src/infra/job-event-bus.ts";
import { NodeHasher } from "../src/infra/node-system.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "et-api-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("FsBlobStore", () => {
  it("round-trips bytes under nested keys", async () => {
    const store = new FsBlobStore(dir);
    await store.put("books/abc.epub", new Uint8Array([1, 2]));
    expect([...(await store.get("books/abc.epub"))]).toEqual([1, 2]);
    await store.delete("books/abc.epub");
    await expect(store.get("books/abc.epub")).rejects.toThrow();
  });

  it("rejects keys that escape the root", async () => {
    const store = new FsBlobStore(dir);
    await expect(store.put("../evil", new Uint8Array())).rejects.toThrow(/invalid blob key/i);
  });
});

describe("JobEventBus", () => {
  it("delivers events only to subscribers of that job until unsubscribed", () => {
    const bus = new JobEventBus();
    const seen: JobEvent[] = [];
    const off = bus.subscribe("j1", (e) => seen.push(e));
    const event = (jobId: string): JobEvent => ({
      type: "segment.done",
      jobId,
      chapterId: "c",
      segmentId: "s",
      status: "done",
    });
    bus.publish(event("j1"));
    bus.publish(event("j2"));
    off();
    bus.publish(event("j1"));
    expect(seen).toHaveLength(1);
  });
});

describe("NodeHasher", () => {
  it("hashes bytes as hex sha256", async () => {
    expect(await new NodeHasher().sha256(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("loadConfig", () => {
  it("applies defaults and reads provider keys", () => {
    const cfg = loadConfig({ ANTHROPIC_API_KEY: "sk-x" });
    expect(cfg).toMatchObject({ port: 8787, host: "127.0.0.1", dataDir: "./data" });
    expect(cfg.env.ANTHROPIC_API_KEY).toBe("sk-x");
  });

  it("rejects a non-numeric port", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow();
  });
});
