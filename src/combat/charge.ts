import type { Ability } from "../data/abilities";
import { bodyCovers } from "./footprint";
import { areOpposed, isAlive } from "./state";
import type {
  ChargedAction,
  Combatant,
  CombatState,
  GridPosition,
} from "./types";

/**
 * Charged attacks: the wind-up that makes a heavy blow answerable.
 *
 * An ability with `windUp` turns is not resolved when it is used. It is
 * *declared*: the shape is worked out once, against the board as it
 * stands, and frozen onto the caster as a `ChargedAction`. The tiles it
 * will land on are marked from that instant (see threatTiles in
 * ./telegraph.ts), and the blow itself lands at the start of the
 * caster's next turn — wherever everyone is standing by then.
 *
 * Two things follow from freezing the *tiles* rather than the target,
 * and both are the point:
 *
 * - **Walking out of it works.** The lane does not follow the body it
 *   was aimed at. A player who reads the marked ground and steps off it
 *   takes nothing, and the log says so (`charge-released` with no
 *   bodies).
 * - **Walking into it works too.** Anything standing in the shape when
 *   it goes off is caught, aimed at or not.
 *
 * Everything here is pure over CombatState. Resolution lives in
 * ./actions.ts, which owns the event log; this module owns the queries
 * and the shape of the thing.
 */

/** Whether an ability is thrown a turn after it is chosen. */
export function windUpTurns(ability: Ability): number {
  return Math.max(0, Math.trunc(ability.windUp ?? 0));
}

export function isCharged(ability: Ability): boolean {
  return windUpTurns(ability) > 0;
}

/** The wind-up a combatant is holding, or null when it is holding none. */
export function pendingCharge(combatant: Combatant): ChargedAction | null {
  return combatant.charge ?? null;
}

/**
 * Every wind-up in flight right now: the living body holding it and the
 * ground it has promised. Dead casters are dropped — a chassis that goes
 * down mid-charge takes its volley with it.
 */
export function pendingCharges(
  state: CombatState,
): ReadonlyArray<{ combatant: Combatant; charge: ChargedAction }> {
  const found: Array<{ combatant: Combatant; charge: ChargedAction }> = [];
  for (const combatant of state.combatants) {
    const charge = pendingCharge(combatant);
    if (charge && isAlive(combatant)) found.push({ combatant, charge });
  }
  return found;
}

/** Every tile any pending wind-up will land on, without repeats. */
export function threatenedTiles(state: CombatState): GridPosition[] {
  const seen = new Set<string>();
  const tiles: GridPosition[] = [];
  for (const { charge } of pendingCharges(state)) {
    for (const tile of charge.tiles) {
      const key = `${tile.x},${tile.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tiles.push({ x: tile.x, y: tile.y });
    }
  }
  return tiles;
}

/** True when a body is standing on ground some wind-up has promised. */
export function isUnderThreat(state: CombatState, combatant: Combatant): boolean {
  return pendingCharges(state).some(
    ({ combatant: caster, charge }) =>
      areOpposed(caster, combatant) &&
      charge.tiles.some((tile) => bodyCovers(combatant, tile)),
  );
}

/**
 * Who a released wind-up catches: the caster's living opponents standing
 * on any of the frozen tiles, the body it was originally aimed at first
 * (when it is still in it) and the rest in combatant order — the same
 * ordering rule an area ability resolves by, so a charge and an ordinary
 * blast report their casualties the same way round.
 */
export function chargeImpact(
  state: CombatState,
  caster: Combatant,
  charge: ChargedAction,
): Combatant[] {
  const caught = state.combatants.filter(
    (c) =>
      areOpposed(c, caster) &&
      isAlive(c) &&
      charge.tiles.some((tile) => bodyCovers(c, tile)),
  );
  const aimed = caught.find((c) => c.id === charge.targetId);
  return aimed ? [aimed, ...caught.filter((c) => c !== aimed)] : caught;
}
