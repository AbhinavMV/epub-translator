import type { JobEvent } from "@et/contracts";

export interface JobEventSink {
  publish(event: JobEvent): void;
}
