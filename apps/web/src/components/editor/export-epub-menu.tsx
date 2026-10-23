import { ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ExportEpubMenu({
  translationHref,
  bilingualHref,
  disabled,
  hint,
}: {
  translationHref: string | undefined;
  bilingualHref: string | undefined;
  disabled: boolean;
  hint: string;
}) {
  if (disabled || !translationHref || !bilingualHref) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: disabled buttons cannot take focus; the tooltip needs a focusable wrapper */}
          <span tabIndex={0} className="inline-flex">
            <Button variant="secondary" size="sm" disabled className="rounded-r-none">
              <Download />
              <span className="hidden sm:inline">Export EPUB</span>
            </Button>
            <Button
              variant="secondary"
              size="icon-sm"
              disabled
              aria-label="Export options"
              className="rounded-l-none border-l border-border/60"
            >
              <ChevronDown />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <div className="inline-flex">
      <Button variant="secondary" size="sm" asChild className="rounded-r-none">
        <a href={translationHref} download aria-label="Export EPUB">
          <Download />
          <span className="hidden sm:inline">Export EPUB</span>
        </a>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="Export options"
            className="rounded-l-none border-l border-border/60"
          >
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem asChild>
            <a href={translationHref} download>
              Translation only
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={bilingualHref} download>
              Bilingual
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
