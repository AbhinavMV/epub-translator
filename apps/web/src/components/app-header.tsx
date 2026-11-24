import type { BookSummary } from "@et/contracts";
import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import { useProject } from "@/api/queries";
import { AppMark } from "@/components/app-mark";
import { SettingsMenu } from "@/components/settings-menu";
import { cn } from "@/lib/utils";

/** One breadcrumb level. The last crumb is always shown as the current page, whatever its kind. */
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

/**
 * Library / Project / Vol. N for a volume's editor and reader. The project level appears once the
 * book's project has loaded; the volume level hints at the full title.
 */
export function useVolumeCrumbs(
  book:
    | Pick<BookSummary, "projectId" | "volumeNumber" | "title" | "translatedTitle" | "sourceLang">
    | undefined,
  translatedTitle?: string | null,
): Crumb[] {
  const project = useProject(book?.projectId);
  const crumbs: Crumb[] = [{ kind: "library" }];
  if (project.data) {
    crumbs.push({ kind: "project", projectId: project.data.id, name: project.data.name });
  }
  if (!book) return [...crumbs, { kind: "current", label: "…" }];
  const title = translatedTitle || book.translatedTitle || book.title;
  const label = volumeLabel({ ...book, translatedTitle: title });
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

function CrumbLink({ crumb, className }: { crumb: Crumb; className: string }) {
  const label = labelOf(crumb);
  const props = { className, title: label, "data-overflow": "clip" as const };
  switch (crumb.kind) {
    case "library":
      return (
        <Link to="/" {...props}>
          {label}
        </Link>
      );
    case "project":
      return (
        <Link to="/projects/$projectId" params={{ projectId: crumb.projectId }} {...props}>
          {label}
        </Link>
      );
    case "book":
      return (
        <Link to="/books/$bookId" params={{ bookId: crumb.bookId }} {...props}>
          {label}
        </Link>
      );
    default:
      return <span {...props}>{label}</span>;
  }
}

export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const last = crumbs.length - 1;
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center text-sm">
      {crumbs.map((crumb, i) => {
        const current = i === last;
        // On a phone the Library level gives way when there are deeper levels to show.
        const phoneHidden = crumb.kind === "library" && !current && last >= 2;
        const afterHidden = i === 1 && crumbs[0]?.kind === "library" && last >= 2;
        const label = labelOf(crumb);
        return (
          <Fragment key={`${crumb.kind}-${label}`}>
            {i > 0 && (
              <span
                aria-hidden
                className={cn("shrink-0 px-0.5 text-border", afterHidden && "max-sm:hidden")}
              >
                /
              </span>
            )}
            {current ? (
              <span
                aria-current="page"
                title={crumb.kind === "current" && crumb.hint ? crumb.hint : label}
                data-overflow="clip"
                lang={crumb.kind === "current" ? crumb.lang : undefined}
                className="block min-w-0 shrink truncate px-1.5 py-2 leading-5 font-medium text-foreground"
              >
                {label}
              </span>
            ) : (
              <CrumbLink
                crumb={crumb}
                className={cn(LINK, "shrink-[4]", phoneHidden && "max-sm:hidden")}
              />
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

/** The header on every signed-in page: app mark, breadcrumb, page actions, Settings. */
export function AppHeader({
  crumbs,
  leading,
  actions,
  className,
}: {
  crumbs: Crumb[];
  /** Before the app mark, such as the button that opens the chapter list on a phone. */
  leading?: ReactNode;
  /** Before Settings, such as the editor's Read link. */
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
