import type { StoryArc } from "../../narrative/types";
import { introArc } from "./intro";

/** Every authored story arc; validated arc-by-arc in tests. */
export const storyArcs: StoryArc[] = [introArc];

export function getArc(id: string): StoryArc | undefined {
  return storyArcs.find((arc) => arc.id === id);
}

/** The arc containing a node id — how map interactions route into dialogue. */
export function findArcByNode(nodeId: string): StoryArc | undefined {
  return storyArcs.find((arc) => arc.nodes.some((node) => node.id === nodeId));
}

export { introArc };
