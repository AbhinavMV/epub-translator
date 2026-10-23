import { descendants, normalizedText } from "./xml.ts";

export interface MetadataField {
  segmentId: string;
  element: Element;
}

export function metadataFields(root: Element): MetadataField[] {
  const metadata = descendants(root, "metadata")[0];
  if (!metadata) return [];
  const fields: MetadataField[] = [];
  const collect = (name: string, idFor: (index: number) => string, limit = Infinity) => {
    descendants(metadata, name)
      .slice(0, limit)
      .forEach((element, index) => {
        if (normalizedText(element) !== "") fields.push({ segmentId: idFor(index), element });
      });
  };
  collect("creator", (i) => `opf#creator-${i}`);
  collect("publisher", (i) => `opf#publisher-${i}`);
  collect("description", () => "opf#description", 1);
  collect("subject", (i) => `opf#subject-${i}`);
  return fields;
}
