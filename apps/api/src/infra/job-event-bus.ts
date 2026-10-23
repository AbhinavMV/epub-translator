import type { JobEvent } from "@et/contracts";
import type { JobEventSink } from "@et/core";

type Listener = (event: JobEvent) => void;

function jobIdOf(event: JobEvent): string {
  return event.type === "job.status" ? event.job.id : event.jobId;
}

export class JobEventBus implements JobEventSink {
  private readonly listeners = new Map<string, Set<Listener>>();

  publish(event: JobEvent): void {
    for (const listener of this.listeners.get(jobIdOf(event)) ?? []) listener(event);
  }

  subscribe(jobId: string, listener: Listener): () => void {
    let set = this.listeners.get(jobId);
    if (!set) {
      set = new Set();
      this.listeners.set(jobId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(jobId);
    };
  }
}
