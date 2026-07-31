import type { Ability, AbilityArea } from "../data/abilities";
import { inBounds, manhattan } from "./grid";
import { manhattanPath } from "./legal";
import { isAlive } from "./state";
import type { Combatant, CombatState, GridPosition, GridSize } from "./types";

/**
 * Where an ability actually lands. An ability with no area touches the
 * one tile it was aimed at; one with an area covers the tiles its shape
 * names, and every hostile body standing on them takes the whole effect.
 *
 * Pure grid math. This is the single resolution both sides read: the
 * engine damages exactly these bodies (see ./actions.ts) and the grid
 * telegraph tints exactly these tiles (see ./telegraph.ts), so what the
 * player is shown and what the fight resolves cannot drift apart.
 */

/** Tile-order key, for membership tests. */
function key(tile: GridPosition): string {
  return `${tile.x},${tile.y}`;
}

/**
 * The tiles an ability aimed from `from` at `impact` would cover, in a
 * fixed order: row-major for a blast, launch-to-landing for a lane.
 * Anything off the grid is dropped — an arena has edges, and a shape
 * that spills over one covers nothing there.
 */
export function areaTiles(
  grid: GridSize,
  area: AbilityArea | undefined,
  from: GridPosition,
  impact: GridPosition,
): GridPosition[] {
  const covered: GridPosition[] = [];
  if (!area) {
    covered.push({ ...impact });
  } else if (area.shape === "line") {
    // manhattanPath excludes the caster's own tile and includes the
    // target's: the lane the shot walks, and nothing behind the gun.
    covered.push(...manhattanPath(from, impact));
  } else {
    const radius = Math.max(0, Math.floor(area.radius));
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tile = { x: impact.x + dx, y: impact.y + dy };
        if (manhattan(impact, tile) <= radius) covered.push(tile);
      }
    }
  }
  return covered.filter((tile) => inBounds(grid, tile));
}

/** The tiles this ability would cover, aimed by `actor` at `impact`. */
export function abilityAreaTiles(
  state: CombatState,
  actor: Combatant,
  ability: Ability,
  impact: GridPosition,
): GridPosition[] {
  return areaTiles(state.grid, ability.area, actor.position, impact);
}

/**
 * Every living body the ability would reach, the one aimed at first and
 * the rest in combatant order. Only the caster's opponents are caught:
 * a blast is not friendly fire, however wide it is.
 */
export function abilityImpact(
  state: CombatState,
  actor: Combatant,
  ability: Ability,
  target: Combatant,
): Combatant[] {
  const covered = new Set(
    abilityAreaTiles(state, actor, ability, target.position).map(key),
  );
  return [
    target,
    ...state.combatants.filter(
      (c) =>
        c.id !== target.id &&
        c.kind !== actor.kind &&
        isAlive(c) &&
        covered.has(key(c.position)),
    ),
  ];
}
