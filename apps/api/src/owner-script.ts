import type { Repositories, StoreFactory } from "@et/core";

export interface ScriptTarget {
  factory: StoreFactory;
  ownerIds(): Promise<string[]>;
  close(): Promise<void>;
}

export interface ScriptOptions {
  apply: boolean;
  log: (line: string) => void;
}

export async function runPerOwner(
  target: ScriptTarget,
  options: ScriptOptions,
  step: (repos: Repositories) => Promise<string[]>,
): Promise<void> {
  try {
    for (const ownerId of await target.ownerIds()) {
      options.log(`Owner ${ownerId}`);
      for (const line of await step(target.factory.forOwner(ownerId))) options.log(line);
    }
    options.log(
      options.apply ? "Applied." : "Dry run: nothing was written. Re-run with --apply to write.",
    );
  } finally {
    await target.close();
  }
}
