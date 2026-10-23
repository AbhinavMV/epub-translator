import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function BookTitle({
  title,
  translated,
}: {
  title: string | undefined;
  translated: string | null | undefined;
}) {
  const shown = translated || title;
  const original = translated && title && translated !== title ? title : null;
  return (
    <div className="flex min-w-0 flex-1 items-baseline gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <h1 className="min-w-0 truncate font-serif text-base font-semibold">
            {shown ?? "Loading…"}
          </h1>
        </TooltipTrigger>
        {shown && <TooltipContent>{original ? `${shown} — ${original}` : shown}</TooltipContent>}
      </Tooltip>
      {original && (
        <span className="hidden min-w-0 shrink truncate text-xs text-muted-foreground lg:inline">
          {original}
        </span>
      )}
    </div>
  );
}
