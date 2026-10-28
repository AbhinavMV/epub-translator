import type { Usage } from "@et/contracts";
import type { SegmentTranslation } from "../../domain/segment.ts";
import type { JobEventSink } from "../../ports/events.ts";
import type { Repositories } from "../../ports/stores.ts";

export interface RecordInput {
  jobId: string;
  chapterId: string;
  usage: Usage;
  entries: readonly (readonly [string, SegmentTranslation])[];
  isStopped?: () => boolean;
  onRecorded?: (segmentId: string, translation: SegmentTranslation) => void;
}

/** Returns false when `isStopped` cut the write short. */
export async function recordResults(
  repos: Pick<Repositories, "jobs" | "translations">,
  events: JobEventSink | undefined,
  input: RecordInput,
): Promise<boolean> {
  const stopped = () => input.isStopped?.() ?? false;
  await repos.jobs.addUsage(input.jobId, input.usage);
  for (const [segmentId, translation] of input.entries) {
    // A clear or cancel may land during any await; never write after it.
    if (stopped()) return false;
    await repos.translations.put(input.jobId, segmentId, translation);
    input.onRecorded?.(segmentId, translation);
    events?.publish({
      type: "segment.done",
      jobId: input.jobId,
      chapterId: input.chapterId,
      segmentId,
      status: translation.status,
    });
  }
  return true;
}
