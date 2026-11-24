import { cn } from "@/lib/utils";

export function CoverPlaceholder({ title, className }: { title: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex size-full items-center justify-center bg-cover-fallback p-4 text-center font-serif text-lg text-cover-fallback-foreground",
        className,
      )}
    >
      {title.slice(0, 2)}
    </div>
  );
}
