import type { BookSummary } from "@et/contracts";
import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import { useProject } from "@/api/queries";
import { AppMark } from "@/components/app-mark";
import { SettingsMenu } from "@/components/settings-menu";
import { cn } from "@/lib/utils";

export type Crumb =
  | { kind: "library" }
  | { kind: "project"; projectId: string; name: string }
  | { kind: "book"; bookId: string; label: string }
  | { kind: "current"; label: string; lang?: string; hint?: string };

export function volumeLabel(
  book: Pick<BookSummary, "volumeNumber" | "title" | "translatedTitle">,
): string {
  if (book.volumeNumber != null) return `Vol. ${book.volumeNumber}`;
  return book.translatedTitle || book.title;
}

export function useVolumeCrumbs(
  book:
    | Pick<
        BookSummary,
        "id" | "projectId" | "volumeNumber" | "title" | "translatedTitle" | "sourceLang"
      >
    | undefined,
  translatedTitle?: string | null,
  chapter?: { label: string; lang?: string },
): Crumb[] {
  const project = useProject(book?.projectId);
  const crumbs: Crumb[] = [{ kind: "library" }];
  if (project.data) {
    crumbs.push({ kind: "project", projectId: project.data.id, name: project.data.name });
  }
  if (!book) return [...crumbs, { kind: "current", label: chapter?.label ?? "…" }];
  const title = translatedTitle || book.translatedTitle || book.title;
  const label = volumeLabel({ ...book, translatedTitle: title });
  if (chapter) {
    crumbs.push({ kind: "book", bookId: book.id, label });
    crumbs.push({ kind: "current", ...chapter, hint: `${label} · ${chapter.label}` });
    return crumbs;
  }
  crumbs.push({
    kind: "current",
    label,
    lang: label === book.title ? (book.sourceLang ?? undefined) : undefined,
    hint: title === book.title ? title : `${title} — ${book.title}`,
  });
  return crumbs;
}

function labelOf(crumb: Crumb): string {
  switch (crumb.kind) {
    case "library":
      return "Library";
    case "project":
      return crumb.name;
    default:
      return crumb.label;
  }
}

const LINK =
  "block min-w-0 truncate rounded-md px-1.5 py-2 leading-5 text-muted-foreground coarse:py-3 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring";

const SEPARATOR = "shrink-0 px-0.5 text-border";

function CrumbLink({ crumb, className }: { crumb: Crumb; className: string }) {
  const label = labelOf(crumb);
  const props = { className, title: label, "data-overflow": "clip" as const };
  const exact = { exact: true };
  switch (crumb.kind) {
    case "library":
      return (
        <Link to="/" activeOptions={exact} {...props}>
          {label}
        </Link>
      );
    case "project":
      return (
        <Link
          to="/projects/$projectId"
          params={{ projectId: crumb.projectId }}
          activeOptions={exact}
          {...props}
        >
          {label}
        </Link>
      );
    case "book":
      return (
        <Link
          to="/books/$bookId"
          params={{ bookId: crumb.bookId }}
          activeOptions={exact}
          {...props}
        >
          {label}
        </Link>
      );
    default:
      return <span {...props}>{label}</span>;
  }
}

export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const current = crumbs.at(-1);
  if (!current) return <nav aria-label="Breadcrumb" className="min-w-0 flex-1" />;
  const parent = crumbs.at(-2);
  const earlier = crumbs.slice(0, -2);
  const label = labelOf(current);
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center text-sm">
      {earlier.map((crumb) => (
        <Fragment key={`${crumb.kind}-${labelOf(crumb)}`}>
          <CrumbLink
            crumb={crumb}
            className={cn(
              LINK,
              "max-sm:hidden",
              crumb.kind === "library" ? "shrink-0" : "min-w-8 shrink-[20]",
            )}
          />
          <span aria-hidden className={cn(SEPARATOR, "max-sm:hidden")}>
            /
          </span>
        </Fragment>
      ))}
      {parent && (
        <>
          <CrumbLink crumb={parent} className={cn(LINK, "max-w-[max(45%,5rem)] shrink-0")} />
          <span aria-hidden className={SEPARATOR}>
            /
          </span>
        </>
      )}
      <span
        aria-current="page"
        title={current.kind === "current" && current.hint ? current.hint : label}
        data-overflow="clip"
        lang={current.kind === "current" ? current.lang : undefined}
        className="block min-w-0 truncate px-1.5 py-2 leading-5 font-medium text-foreground"
      >
        {label}
      </span>
    </nav>
  );
}

export function AppHeader({
  crumbs,
  leading,
  actions,
  className,
}: {
  crumbs: Crumb[];
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex min-h-14 min-w-0 shrink-0 items-center gap-1 border-b bg-background/90 px-2 backdrop-blur sm:gap-2 sm:px-4",
        className,
      )}
    >
      {leading}
      <AppMark />
      <Breadcrumb crumbs={crumbs} />
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      <SettingsMenu />
    </header>
  );
}
