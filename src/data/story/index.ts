import type { StoryArc } from "../../narrative/types";
import { introArc } from "./intro";

/** Every authored story arc; validated arc-by-arc in tests. */
export const storyArcs: StoryArc[] = [introArc];

export function getArc(id: string): StoryArc | undefined {
  return storyArcs.find((arc) => arc.id === id);
}

export { introArc };
