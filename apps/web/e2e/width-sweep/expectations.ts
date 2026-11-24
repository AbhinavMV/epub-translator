export type Theme = "light" | "dark";

export type OffenderKind = "page-scroll" | "past-viewport" | "overflows";

export interface Offender {
  kind: OffenderKind;
  path: string;
  detail: string;
}

export interface Observation {
  width: number;
  offenders: readonly Offender[];
}

export type Band = readonly [number, number];

export interface ExpectedFailure {
  screen: string;
  /** Substring of the reported "kind: path", e.g. `overflows: header > h1 "EPUB Translator"`. */
  offender: string;
  widths: Band;
  theme?: Theme;
  /** Finding id in docs/design/ui-review.md, or the ticket that will fix it. */
  review?: string;
}

export interface Verdict {
  screen: string;
  theme: Theme;
  ok: boolean;
  unexpected: { width: number; offender: Offender }[];
  stale: ExpectedFailure[];
}

const BANDS: readonly Band[] = [
  [280, 639],
  [640, 1023],
  [1024, 1920],
];

/** Coarse bands, so font metrics that differ between macOS and the Linux CI runner don't flip entries. */
export function bandOf(width: number): Band {
  return BANDS.find(([, max]) => width <= max) ?? (BANDS[BANDS.length - 1] as Band);
}

export const offenderText = (o: Offender) => `${o.kind}: ${o.path}`;

const covers = (entry: ExpectedFailure, width: number, offender: Offender) =>
  width >= entry.widths[0] &&
  width <= entry.widths[1] &&
  offenderText(offender).includes(entry.offender);

export function judge(
  screen: string,
  theme: Theme,
  observations: readonly Observation[],
  expected: readonly ExpectedFailure[],
): Verdict {
  const entries = expected.filter((e) => e.screen === screen && (e.theme ?? theme) === theme);
  const hits = new Set<ExpectedFailure>();
  const unexpected: Verdict["unexpected"] = [];
  for (const { width, offenders } of observations) {
    for (const offender of offenders) {
      const matching = entries.filter((e) => covers(e, width, offender));
      for (const e of matching) hits.add(e);
      if (matching.length === 0) unexpected.push({ width, offender });
    }
  }
  const stale = entries.filter((e) => !hits.has(e));
  return { screen, theme, ok: unexpected.length === 0 && stale.length === 0, unexpected, stale };
}

function suggestion(screen: string, offender: string, widths: number[]): string {
  const from = bandOf(Math.min(...widths))[0];
  const to = bandOf(Math.max(...widths))[1];
  return `{ screen: ${JSON.stringify(screen)}, offender: ${JSON.stringify(offender)}, widths: [${from}, ${to}] }`;
}

export function formatVerdict(verdict: Verdict): string {
  const lines = [`${verdict.screen} (${verdict.theme})`];
  if (verdict.unexpected.length > 0) {
    lines.push("  Elements past the viewport or overflowing their box:");
    for (const { width, offender } of verdict.unexpected) {
      lines.push(`    ${width}px  ${offenderText(offender)}`, `           ${offender.detail}`);
    }
    const byOffender = new Map<string, number[]>();
    for (const { width, offender } of verdict.unexpected) {
      const key = offenderText(offender);
      byOffender.set(key, [...(byOffender.get(key) ?? []), width]);
    }
    lines.push(
      "  Fix the layout. Only if this is a known finding of a screen not yet redesigned, add to expected-failures.ts:",
    );
    for (const [offender, widths] of byOffender) {
      lines.push(`    ${suggestion(verdict.screen, offender, widths)},`);
    }
  }
  if (verdict.stale.length > 0) {
    lines.push(
      "  Expected failures that no longer happen (fixed?); remove them from expected-failures.ts:",
    );
    for (const e of verdict.stale) {
      const theme = e.theme ? `, theme: "${e.theme}"` : "";
      lines.push(
        `    { screen: ${JSON.stringify(e.screen)}, offender: ${JSON.stringify(e.offender)}, widths: [${e.widths[0]}, ${e.widths[1]}]${theme} }`,
      );
    }
  }
  return lines.join("\n");
}
