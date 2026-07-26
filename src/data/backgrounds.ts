import type { StatKey } from "../character/stats";

/**
 * A character origin. Pure data: the character module applies statBonuses,
 * the inventory task resolves startingGearIds, and the narrative engine
 * gates dialogue/branches on tags.
 */
export interface Background {
  id: string;
  name: string;
  description: string;
  statBonuses: Partial<Record<StatKey, number>>;
  /** Item ids, resolved by the inventory system. */
  startingGearIds: string[];
  /** Tags the narrative engine gates dialogue and branches on. */
  tags: string[];
}

export const backgrounds: Background[] = [
  {
    id: "gutter-courier",
    name: "Gutter Courier",
    description:
      "You ran contraband through the flooded underlevels of Cinder Row, " +
      "outpacing drones and debt collectors alike. The streets know your " +
      "name — and so do the people you never delivered to.",
    statBonuses: { reflexes: 1, body: 1 },
    startingGearIds: ["wpn-shard-knife", "out-courier-slicker"],
    tags: ["street", "courier"],
  },
  {
    id: "tower-analyst",
    name: "Tower Analyst",
    description:
      "You audited risk ledgers on the ninetieth floor of the Auric Spire " +
      "until you found a line item that wasn't supposed to exist. Now you're " +
      "on the ground with a severance chip and a head full of secrets.",
    statBonuses: { intelligence: 1, cool: 1 },
    startingGearIds: ["wpn-compact-pistol", "out-spire-suit"],
    tags: ["corp", "analyst"],
  },
  {
    id: "grid-diver",
    name: "Grid Diver",
    description:
      "You spent more waking hours inside the Weave than out of it, prying " +
      "open dead archives and selling what crawled out. Your rig is scarred, " +
      "your handle is infamous, and something down there remembers you.",
    statBonuses: { tech: 2 },
    startingGearIds: ["wpn-stun-baton", "out-diver-harness"],
    tags: ["net", "diver"],
  },
];

export const DEFAULT_BACKGROUND_ID = "gutter-courier";

export function getBackground(id: string): Background | undefined {
  return backgrounds.find((b) => b.id === id);
}
