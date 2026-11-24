import { Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeviceStores } from "@/lib/device-stores";

export function GlossaryWarning({
  projectId,
  onSuggest,
}: {
  projectId: string;
  onSuggest: () => void;
}) {
  const { glossarySkip } = useDeviceStores();
  return (
    <section
      aria-label="No glossary yet"
      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5 gap-y-3 rounded-lg bg-flag/15 px-3.5 py-3 text-sm sm:flex sm:flex-wrap sm:items-center sm:gap-3"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-flag sm:mt-0" />
      <p className="min-w-0 [overflow-wrap:anywhere] sm:flex-[1_1_20rem]">
        <b className="font-semibold">Set up the glossary before you translate.</b> This project has
        no glossary, so character names and terms can come out differently from chapter to chapter
        and volume to volume. Suggesting terms takes about a minute, and you review every entry
        before it’s saved.
      </p>
      <div className="col-span-full flex flex-wrap gap-2 max-sm:[&>*]:flex-1">
        <Button variant="outline" size="sm" onClick={() => glossarySkip.skip(projectId)}>
          Skip for now
        </Button>
        <Button size="sm" onClick={onSuggest}>
          <Sparkles aria-hidden />
          Suggest terms
        </Button>
      </div>
    </section>
  );
}
