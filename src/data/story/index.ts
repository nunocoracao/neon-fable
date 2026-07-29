import type { StoryArc } from "../../narrative/types";
import { act1Arc } from "./act1";
import { act2Arc } from "./act2";
import { act3Arc } from "./act3";
import { chapelArc } from "./chapel";
import { introArc } from "./intro";

/** Every authored story arc; validated arc-by-arc in tests. */
export const storyArcs: StoryArc[] = [
  introArc,
  act1Arc,
  act2Arc,
  act3Arc,
  chapelArc,
];

export function getArc(id: string): StoryArc | undefined {
  return storyArcs.find((arc) => arc.id === id);
}

/** The arc containing a node id — how map interactions route into dialogue. */
export function findArcByNode(nodeId: string): StoryArc | undefined {
  return storyArcs.find((arc) => arc.nodes.some((node) => node.id === nodeId));
}

export { introArc, act1Arc, act2Arc, act3Arc, chapelArc };
