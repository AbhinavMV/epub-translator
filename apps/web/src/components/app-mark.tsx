import { Link } from "@tanstack/react-router";
import { BookOpenText } from "lucide-react";

export function AppMark() {
  return (
    <Link
      to="/"
      aria-label="Library"
      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
    >
      <BookOpenText className="size-4" />
    </Link>
  );
}
