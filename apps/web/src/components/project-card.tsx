import type { ProjectSummary } from "@et/contracts";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { CoverPlaceholder } from "@/components/cover-placeholder";
import { FullyTranslatedBadge } from "@/components/fully-translated-badge";

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow outline-none hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <div className="aspect-[2/3] w-full overflow-hidden bg-muted">
        {project.coverUrl && !coverFailed ? (
          <img
            src={project.coverUrl}
            alt=""
            loading="lazy"
            onError={() => setCoverFailed(true)}
            className="size-full object-cover"
          />
        ) : (
          <CoverPlaceholder title={project.name} />
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm leading-tight font-semibold">
          {project.name}
        </h3>
        <p className="font-mono text-[11px] text-muted-foreground">
          {project.volumeCount === 1 ? "1 volume" : `${project.volumeCount} volumes`}
        </p>
        <FullyTranslatedBadge lang={project.fullyTranslatedLang} />
      </div>
    </Link>
  );
}
