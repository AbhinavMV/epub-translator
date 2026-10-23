import { z } from "zod";
import { ChapterProgressSchema, JobSummarySchema, SegmentStatusSchema } from "./api.ts";

export const JobEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("job.status"), job: JobSummarySchema }),
  z.object({
    type: z.literal("chapter.progress"),
    jobId: z.string(),
    progress: ChapterProgressSchema,
  }),
  z.object({
    type: z.literal("segment.done"),
    jobId: z.string(),
    chapterId: z.string(),
    segmentId: z.string(),
    status: SegmentStatusSchema,
  }),
]);
export type JobEvent = z.infer<typeof JobEventSchema>;
