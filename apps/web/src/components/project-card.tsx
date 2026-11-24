import type { ProjectSummary } from "@et/contracts";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { CoverPlaceholder } from "@/components/cover-placeholder";
import { StatusLine } from "@/components/status-line";
import { projectProgress } from "@/lib/progress-status";

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="group flex h-full min-w-0 flex-col gap-2.5 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <div className="aspect-[2/3] w-full overflow-hidden rounded-r-lg rounded-l-sm bg-muted shadow-sm transition-[transform,box-shadow] group-hover:-translate-y-0.5 group-hover:shadow-md">
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
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3
          title={project.name}
          className="line-clamp-2 min-h-[2lh] text-sm leading-snug font-semibold break-words"
        >
          {project.name}
        </h3>
        <StatusLine status={projectProgress(project)} className="mt-auto" />
      </div>
    </Link>
  );
}
