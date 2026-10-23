import type { Usage } from "@et/contracts";

/** A book's translation workspace for one target language; chapters are translated on demand. */
export interface Job {
  id: string;
  bookId: string;
  targetLang: string;
  sourceLang: string | null;
  error: string | null;
  usage: Usage;
  createdAt: string;
}
