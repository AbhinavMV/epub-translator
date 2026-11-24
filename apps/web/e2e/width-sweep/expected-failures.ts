import type { ExpectedFailure } from "./expectations";

/**
 * Overflow the sweep finds today on screens not yet redesigned. A screen's ticket removes its
 * entries when it fixes them; the sweep fails while an entry here no longer happens.
 * `review` is the finding in docs/design/ui-review.md, or "sweep" for one only the sweep found.
 */
export const EXPECTED_FAILURES: readonly ExpectedFailure[] = [];
