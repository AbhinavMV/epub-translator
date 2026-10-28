import type { ChapterProofread, ProofreadDecisionBody, ProofreadSummary } from "@et/contracts";
import { NotFoundError } from "../../domain/errors.ts";
import type { Repositories } from "../../ports/stores.ts";

export async function decideProofread(
  repos: Repositories,
  jobId: string,
  chapterId: string,
  decision: ProofreadDecisionBody,
): Promise<ChapterProofread> {
  const proofread = await repos.proofreads.get(jobId, chapterId);
  if (!proofread) throw new NotFoundError("Proofread", `${jobId}/${chapterId}`);
  const accept = new Set(decision.accept ?? []);
  const reject = new Set(decision.reject ?? []);
  const current = await repos.translations.forSegments(
    jobId,
    proofread.suggestions.filter((s) => accept.has(s.segmentId)).map((s) => s.segmentId),
  );

  for (const s of proofread.suggestions) {
    if (s.state !== "pending") continue;
    if (reject.has(s.segmentId)) {
      s.state = "rejected";
    } else if (accept.has(s.segmentId)) {
      if (current.get(s.segmentId)?.text !== s.before) {
        s.state = "outdated";
        continue;
      }
      await repos.translations.put(jobId, s.segmentId, { text: s.after, status: "done" });
      s.state = "accepted";
    }
  }
  await repos.proofreads.put(proofread);
  return proofread;
}

export async function proofreadSummaries(
  repos: Repositories,
  jobId: string,
): Promise<ProofreadSummary[]> {
  return (await repos.proofreads.listForJob(jobId)).map((p) => ({
    chapterId: p.chapterId,
    createdAt: p.createdAt,
    pending: p.suggestions.filter((s) => s.state === "pending").length,
    total: p.suggestions.length,
  }));
}
