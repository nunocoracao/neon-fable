/**
 * Day phase — which hour a scene plays at, and where that answer comes
 * from. A map declares its own hour (src/data/maps.ts); a story beat may
 * override it for the scene it plays over (StoryNode.dayPhase), which is
 * how a mission that happens at 3am looks like 3am on the same street
 * the player walked at dusk. Arenas have no hour of their own and take
 * the one the fight was entered under, exactly as they take the weather.
 *
 * Resolution is a pure precedence rule, so what a scene should look like
 * is testable without a canvas. What the phase then *does* is entirely
 * bake-time palette tinting plus a scale on the glow pass — see
 * ./art/tint.ts. Nothing here is reachable from combat, movement,
 * pathfinding, or narrative gating: the hour changes what a scene looks
 * like and never what it rolls.
 */
import { glowIntensityScale } from "./art/tint";
import { DEFAULT_DAY_PHASE, type DayPhaseId, type IsoMap } from "./tilemap";

export { glowIntensityScale };

/**
 * The hour a scene plays at: a story beat's override first, then the
 * map's own declaration, then night — the hour the art is authored at.
 */
export function resolveDayPhase(
  map: IsoMap,
  story?: DayPhaseId | null,
): DayPhaseId {
  return story ?? map.dayPhase ?? DEFAULT_DAY_PHASE;
}
