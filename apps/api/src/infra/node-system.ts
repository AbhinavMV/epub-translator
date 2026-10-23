import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Clock, Hasher, IdGenerator, Sleep } from "@et/core";

export class NodeHasher implements Hasher {
  async sha256(bytes: Uint8Array): Promise<string> {
    return createHash("sha256").update(bytes).digest("hex");
  }
}

export const systemClock: Clock = { now: () => new Date() };

export const uuidGenerator: IdGenerator = { next: () => randomUUID() };

export const nodeSleep: Sleep = async (ms, signal) => {
  await delay(ms, undefined, signal ? { signal } : undefined);
};
