/**
 * What a district looks like after the story has been through it.
 *
 * Maps in ./maps.ts are authored once and never mutate; a run's state
 * lives in GameState. This is the pure join between them: a table of
 * flag-conditional rewrites of a map's interactables, applied on the
 * way into the scene, so a settled quest can change who is standing
 * where and what talking to them opens — permanently, and without any
 * of the iso layer learning what a flag is.
 *
 * A rewrite may re-label an interactable, point it at a different story
 * node, or put a different face on it. It deliberately cannot move,
 * add, or delete one: position, sprite kind, and exits are what the
 * map's own lint (reachability, walkability, minimap pips, arena rules)
 * is written against, so leaving them alone keeps every one of those
 * guarantees true of the dressed map for free.
 *
 * Applied at scene mount (see ui/gameScreen.ts), which means a change
 * earned in a conversation lands the next time the map is entered
 * rather than under the player's feet mid-scene — the district is
 * different when you next come down the stair, which is when a place
 * being different is legible anyway.
 */
import type { CharacterVisual } from "../character/appearance";
import type { Interactable, IsoMap } from "../iso/tilemap";
import type { FlagMap, FlagValue } from "../state/flags";
import { castVisual } from "./cast";
import { UNDER_WATERLINE_OUTCOMES } from "./story/underWaterline";

/** One flag-conditional rewrite of one interactable on one map. */
export interface InteractableDressing {
  mapId: string;
  /** Interactable id on that map; anything else is an authoring bug. */
  interactableId: string;
  /** The rewrite applies while this flag holds this exact value. */
  when: { key: string; value: FlagValue };
  /** Replacement prompt/minimap label. */
  label?: string;
  /** Replacement dialogue node — only ever a dialogue interaction. */
  nodeId?: string;
  /** Replacement authored look, for "npc" sprites. */
  visual?: CharacterVisual;
}

/**
 * The Flooded Quays' working platform, after "Under the Waterline".
 *
 * Derived from the chain's own outcome table rather than restated here:
 * each settlement declares who is on the platform and what they open,
 * so the district's lasting change cannot drift from the ending that
 * earned it. Every settlement flag is a terminal the chain writes
 * exactly once and never together with another, so at most one of these
 * is ever live.
 */
const QUAYS_PLATFORM_DRESSINGS: InteractableDressing[] = Object.values(
  UNDER_WATERLINE_OUTCOMES,
).map((outcome) => ({
  mapId: "flooded-quays",
  interactableId: "quays-diver",
  when: { key: outcome.flag, value: true },
  label: outcome.platform.label,
  nodeId: outcome.platform.nodeId,
  visual: castVisual(outcome.platform.label),
}));

/**
 * What a breached terminal leaves behind.
 *
 * A run at Breach writes a flag (see src/data/breach.ts) and this is
 * where the flag becomes something you can walk up to: the gallery
 * locker whose hasp the boards' own register released, and the salvage
 * cage the lockgate hoists have walked up out of the basin. Both
 * re-point a fixture that already had its own authored keys at a scene
 * in ./story/breach.ts — a third way in, never the only one.
 */
const BREACH_DRESSINGS: InteractableDressing[] = [
  {
    mapId: "vertical-market",
    interactableId: "market-consignment",
    when: { key: "market-hasp-cut", value: true },
    label: "Consignment locker — hasp released",
    nodeId: "bz-market-locker",
  },
  {
    mapId: "flooded-quays",
    interactableId: "quays-cage",
    when: { key: "quays-hoist-cut", value: true },
    label: "Salvage cage — on the hoist",
    nodeId: "bz-quays-cage",
  },
];

/** Every registered dressing; validated map-by-map in tests. */
export const mapDressings: InteractableDressing[] = [
  ...QUAYS_PLATFORM_DRESSINGS,
  ...BREACH_DRESSINGS,
];

/** Rewrites one interactable, leaving everything the lint cares about alone. */
function dress(
  thing: Interactable,
  dressing: InteractableDressing,
): Interactable {
  return {
    ...thing,
    label: dressing.label ?? thing.label,
    visual: dressing.visual ?? thing.visual,
    interaction:
      dressing.nodeId !== undefined
        ? { kind: "dialogue", nodeId: dressing.nodeId }
        : thing.interaction,
  };
}

/**
 * The map as this run has left it. Returns the authored map unchanged
 * when nothing applies, so the common case allocates nothing and the
 * scene keeps its identity between mounts. Where two dressings could
 * both apply to one interactable the first registered wins.
 */
export function dressMap(map: IsoMap, flags: FlagMap): IsoMap {
  const live = mapDressings.filter(
    (dressing) =>
      dressing.mapId === map.id && flags[dressing.when.key] === dressing.when.value,
  );
  if (live.length === 0) return map;
  let changed = false;
  const interactables = map.interactables.map((thing) => {
    const dressing = live.find((d) => d.interactableId === thing.id);
    if (!dressing) return thing;
    changed = true;
    return dress(thing, dressing);
  });
  return changed ? { ...map, interactables } : map;
}
