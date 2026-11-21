export const keys = {
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  projectSettings: (id: string) => ["project-settings", id] as const,
  books: ["books"] as const,
  book: (id: string) => ["book", id] as const,
  providers: ["providers"] as const,
  glossaryPlan: (bookId: string, size: string) => ["glossary-plan", bookId, size] as const,
  workspace: (bookId: string, lang: string) => ["workspace", bookId, lang] as const,
  job: (id: string) => ["job", id] as const,
  chapter: (jobId: string, chapterId: string) => ["chapter", jobId, chapterId] as const,
  proofreads: (jobId: string) => ["proofreads", jobId] as const,
  proofread: (jobId: string, chapterId: string) => ["proofread", jobId, chapterId] as const,
};
