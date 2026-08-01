import type { CharacterState } from "../character/create";
import { injureCharacter, takeInjury } from "../character/injury";
import { tunedInjuryThreshold } from "../data/difficulty";
import { drawInjury, type InjuryCause } from "../data/injuries";
import { requireItem } from "../data/items";
import type { ItemResolver } from "../inventory/items";
import { equippedItems } from "../inventory/selectors";
import type { GameState } from "../state/gameState";
import { companionInjury, getMember, setCompanionInjury } from "../state/party";
import { rulesModifiers } from "../state/rules";
import { companionIdOf } from "./ally";
import { isPlayerControlled } from "./state";
import type { Combatant, CombatState } from "./types";

/**
 * Who limps out of a won fight, and with what.
 *
 * The rule this file exists to keep is the one in the task it came
 * from: **injuries only come out of fights you win**. Losing already
 * has its own answer (the defeat panel, the autosave, the fight again)
 * and nothing here touches it — `combatInjuries` returns nothing at all
 * unless the status is "victory", so there is no path by which a bad
 * night costs a player twice.
 *
 * Everything is read off the fight's own record. CombatState is
 * complete — the log names every blow, every stun and every body that
 * went down — so this is a pure read over a finished battle with no
 * extra bookkeeping added to the engine, and a saved fight resolves to
 * exactly the same injuries whenever it is resolved.
 */

/**
 * Share of a body's frame it has to finish a fight at or under to count
 * as having been dropped, for a body the rules never actually let drop.
 *
 * A companion going down is literal: the fight carries on without them
 * and the log says `defeated`. The player's is not — the moment they
 * hit zero the fight is *lost*, which is the outcome this file refuses
 * to touch. So the player's version of being dropped is finishing on
 * their feet with almost nothing left, which is the same night from the
 * inside. A fifth of a frame is deliberately tight: nobody picks up a
 * wound for a fight that merely went long.
 */
export const BLOODIED_SHARE = 0.2;

/** One injury a finished fight hands to one body. */
export interface InjuryDraw {
  /** The body that took it. */
  combatantId: string;
  /** Companion content id when it is a companion's; null for the player. */
  companionId: string | null;
  /** Injury id in src/data/injuries.ts. */
  injuryId: string;
}

/** True when the log says this body went down, or was caught falling. */
function wentDown(combat: CombatState, combatantId: string): boolean {
  return combat.log.some(
    (event) =>
      (event.type === "defeated" || event.type === "second-wind") &&
      event.combatantId === combatantId,
  );
}

/**
 * True when the fight left this body at or under the bloodied share.
 * The share is the preset's (see tunedInjuryThreshold): a kinder night
 * marks only somebody who finished closer to nothing, and a share of 0
 * marks nobody this way at all — going *down* still always counts,
 * because that is not frequency, that is what happened.
 */
function bloodied(combatant: Combatant, share: number): boolean {
  if (combatant.maxHp <= 0 || share <= 0) return false;
  return combatant.hp <= combatant.maxHp * share;
}

/** True when a blow to the head is part of this body's account of the fight. */
function tookAKnock(combat: CombatState, combatantId: string): boolean {
  return combat.log.some(
    (event) =>
      (event.type === "stun-skipped" && event.combatantId === combatantId) ||
      (event.type === "ability-used" &&
        event.targetId === combatantId &&
        event.stunTurns > 0),
  );
}

/**
 * True when this character is carrying implants that could seize —
 * cyberware that is actually granting them something. Chrome that
 * grants nothing cannot go offline in any way the player would notice,
 * and an injury nobody can feel is not an injury.
 */
export function hasSeizableChrome(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): boolean {
  const installed = new Set(
    Object.values(character.equipment.enhancements).filter(
      (id): id is string => id != null,
    ),
  );
  return equippedItems(character, resolve).some(
    (item) =>
      installed.has(item.id) &&
      item.kind === "enhancement" &&
      item.effects.some((effect) => effect.type === "grant-ability"),
  );
}

/**
 * The causes a fight matched for one body, in no particular order —
 * which of them wins is content's decision (INJURY_CAUSE_ORDER), not
 * this file's. "shot" is unconditional: whatever else happened, they
 * got hurt, and that is what makes the draw total.
 */
function causesFor(
  combat: CombatState,
  combatant: Combatant,
  chromed: boolean,
): InjuryCause[] {
  const causes: InjuryCause[] = ["shot"];
  if (tookAKnock(combat, combatant.id)) causes.push("concussion");
  if (chromed) causes.push("chrome");
  return causes;
}

/** What a finished fight hands out, and to whom. */
export interface InjuryDrawOptions {
  /** True when the player's own implants could seize (see above). */
  playerChromed?: boolean;
  /**
   * The share of a frame a body has to finish at or under to count as
   * bloodied. Defaults to the authored share; the fold-back passes the
   * run's preset through (see applyCombatInjuries), which is the whole
   * of how difficulty changes how often a night marks you.
   */
  bloodiedShare?: number;
}

/**
 * The injuries a finished fight hands out: one per body on the player's
 * side that was dropped or bled out to nothing, and none at all unless
 * the fight was won.
 *
 * Pure over CombatState. It reports draws rather than applying them so
 * the same read serves the fold-back (resolveCombat), a preview, and a
 * test — and so the worst-replaces rule stays in one place, where the
 * wound is actually written.
 */
export function combatInjuries(
  combat: CombatState,
  options: InjuryDrawOptions = {},
): InjuryDraw[] {
  if (combat.status !== "victory") return [];
  const share = options.bloodiedShare ?? BLOODIED_SHARE;
  const draws: InjuryDraw[] = [];
  for (const combatant of combat.combatants) {
    if (!isPlayerControlled(combatant)) continue;
    if (!wentDown(combat, combatant.id) && !bloodied(combatant, share)) continue;
    const chromed =
      combatant.kind === "player" && options.playerChromed === true;
    const injury = drawInjury(causesFor(combat, combatant, chromed));
    if (!injury) continue;
    draws.push({
      combatantId: combatant.id,
      companionId:
        combatant.kind === "player"
          ? null
          : (combatant.companionId ?? companionIdOf(combatant.id)),
      injuryId: injury.id,
    });
  }
  return draws;
}

/**
 * The state with a finished fight's injuries written on. Applies the
 * worst-replaces rule per character (see takeInjury), skips a companion
 * this run never recruited, and returns the state untouched for a fight
 * that was not won — which is every defeat, by construction.
 */
export function applyCombatInjuries(
  state: GameState,
  combat: CombatState,
  resolve: ItemResolver = requireItem,
): GameState {
  // Asked once, of the character rather than the combatant, because
  // whether the chrome could seize is a fact about what is installed
  // now — and the fight snapshotted figures, not implants.
  const draws = combatInjuries(combat, {
    playerChromed: hasSeizableChrome(state.player, resolve),
    // And how bloodied is bloodied tonight. Read off the run rather
    // than the fight because it is a fact about the playthrough, and
    // asked here — where the wound is actually written — so the whole
    // rule stays in one place.
    bloodiedShare: tunedInjuryThreshold(
      BLOODIED_SHARE,
      rulesModifiers(state.rules).injuryThresholdPct,
    ),
  });
  if (draws.length === 0) return state;

  let player = state.player;
  let party = state.party;
  for (const draw of draws) {
    if (draw.companionId === null) {
      player = injureCharacter(player, draw.injuryId);
      continue;
    }
    if (!getMember(party, draw.companionId)) continue;
    party = setCompanionInjury(
      party,
      draw.companionId,
      takeInjury(companionInjury(party, draw.companionId), draw.injuryId),
    );
  }
  if (player === state.player && party === state.party) return state;
  return { ...state, player, party };
}
