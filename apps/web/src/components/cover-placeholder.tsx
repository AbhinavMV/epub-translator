export function CoverPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex size-full items-center justify-center bg-cover-fallback p-4 text-center font-serif text-lg text-cover-fallback-foreground">
      {title.slice(0, 2)}
    </div>
  );
}
