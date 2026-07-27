import type { GameState } from "../state/gameState";
import { checkRequirements } from "./requirements";
import type { Requirement } from "./types";

/**
 * Epilogue vignettes: short outcome paragraphs shown after a final ending
 * — what became of each faction and ally given this playthrough. Content
 * lives in src/data/epilogues.ts; this module is the pure selection
 * logic the epilogue screen renders from.
 */
export interface EpilogueVignette {
  id: string;
  /**
   * Subject slot (e.g. "undercroft", "voss"). Exactly one vignette per
   * subject is selected; a subject with no matching vignette is omitted.
   */
  subject: string;
  /** Short heading shown over the vignette. */
  title: string;
  text: string;
  /** All must pass against the finished state; omit for a fallback. */
  requires?: Requirement[];
}

/**
 * Picks at most one vignette per subject: the first in authored order
 * whose requirements pass. Result order follows the authored list, so
 * content controls both variant priority and render order.
 */
export function selectVignettes(
  state: GameState,
  vignettes: readonly EpilogueVignette[],
): EpilogueVignette[] {
  const covered = new Set<string>();
  const selected: EpilogueVignette[] = [];
  for (const vignette of vignettes) {
    if (covered.has(vignette.subject)) continue;
    if (!checkRequirements(state, vignette.requires)) continue;
    covered.add(vignette.subject);
    selected.push(vignette);
  }
  return selected;
}
