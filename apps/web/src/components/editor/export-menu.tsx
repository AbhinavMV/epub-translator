import { BookDown, ChevronDown, Download, FileText } from "lucide-react";
import { interceptExport } from "@/components/editor/intercept-export";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ExportMenu({
  translationHref,
  bilingualHref,
  txtHref,
  onExport,
  disabled,
  hint,
}: {
  translationHref: string | undefined;
  bilingualHref: string | undefined;
  txtHref: string | undefined;
  onExport?: ((href: string) => void) | undefined;
  disabled: boolean;
  hint: string;
}) {
  const trigger = (off: boolean) => (
    <Button variant="ghost" size="sm" disabled={off} aria-label="Export" title="Export">
      <Download />
      <span className="max-xl:hidden">Export</span>
      <ChevronDown className="opacity-60" />
    </Button>
  );

  if (disabled || !translationHref || !bilingualHref || !txtHref) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: disabled buttons cannot take focus; the tooltip needs a focusable wrapper */}
          <span tabIndex={0} className="inline-flex">
            {trigger(true)}
          </span>
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
    );
  }

  const item = (href: string, icon: React.ReactNode, label: React.ReactNode) => (
    <DropdownMenuItem asChild>
      <a href={href} download onClick={interceptExport(href, onExport)}>
        {icon}
        {label}
      </a>
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger(false)}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="text-xs font-normal whitespace-normal text-muted-foreground">
          Untranslated chapters stay in the original language.
        </DropdownMenuLabel>
        {item(
          translationHref,
          <BookDown />,
          <>
            EPUB <span className="ml-auto text-xs text-muted-foreground">Translation</span>
          </>,
        )}
        {item(
          bilingualHref,
          <BookDown />,
          <>
            EPUB <span className="ml-auto text-xs text-muted-foreground">Bilingual</span>
          </>,
        )}
        {item(txtHref, <FileText />, "Plain text (.txt)")}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
