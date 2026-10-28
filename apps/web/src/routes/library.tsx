import { toast } from "sonner";
import { useBooks, useDeleteBook, useUploadBook } from "@/api/queries";
import { UserMenu } from "@/auth/user-menu";
import { AppMark } from "@/components/app-mark";
import { BookCard } from "@/components/book-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { UploadDropzone } from "@/components/upload-dropzone";

export function LibraryPage() {
  const books = useBooks();
  const upload = useUploadBook();
  const remove = useDeleteBook();

  const onUpload = (file: File) => {
    toast.promise(upload.mutateAsync(file), {
      loading: `Importing ${file.name}…`,
      success: (book) => `Imported “${book.title}”`,
      error: () => `Could not import ${file.name}`,
    });
  };

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
      <header className="flex items-center gap-3">
        <AppMark />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-xl font-semibold">EPUB Translator</h1>
          <p className="text-sm text-muted-foreground">
            Your library, translated chapter by chapter.
          </p>
        </div>
        <ThemeToggle />
        <UserMenu />
      </header>

      <UploadDropzone onUpload={onUpload} busy={upload.isPending} />

      <section aria-labelledby="library-heading" className="flex flex-col gap-4">
        <h2
          id="library-heading"
          className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase"
        >
          Library {books.data ? `· ${books.data.length}` : ""}
        </h2>
        {books.isPending ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
            ))}
          </div>
        ) : books.data && books.data.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.data.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                deleting={remove.isPending}
                onDelete={() => remove.mutate(book.id)}
              />
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No books yet. Drop an EPUB above to begin.
          </p>
        )}
      </section>
    </div>
  );
}
