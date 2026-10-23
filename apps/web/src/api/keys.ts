export const keys = {
  books: ["books"] as const,
  book: (id: string) => ["book", id] as const,
  providers: ["providers"] as const,
  workspace: (bookId: string, lang: string) => ["workspace", bookId, lang] as const,
  job: (id: string) => ["job", id] as const,
  chapter: (jobId: string, chapterId: string) => ["chapter", jobId, chapterId] as const,
};
