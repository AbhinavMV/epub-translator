import { Link } from "@tanstack/react-router";
import { BookOpenText } from "lucide-react";

export function AppMark() {
  return (
    <Link
      to="/"
      aria-label="Library"
      className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring coarse:size-11"
    >
      <BookOpenText className="size-4" />
    </Link>
  );
}
