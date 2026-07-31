import { requireAbility } from "../data/abilities";
import { requireItem } from "../data/items";
import type { ItemResolver } from "../inventory/items";
import { nextFloat } from "../state/rng";
import { abilityAreaTiles, abilityImpact } from "./area";
import { chargeImpact, windUpTurns } from "./charge";
import {
  abilityHit,
  attackDamage,
  attackHitChance,
  attackStatKey,
  fleeChance,
  weaponReach,
} from "./damage";
import { bodyGap } from "./footprint";
import { canStand, manhattan, moveSpeed } from "./grid";
import {
  activeCombatant,
  areOpposed,
  combatStat,
  getCombatant,
  isAlive,
  livingEnemies,
  playerCombatant,
  requireCombatant,
} from "./state";
import {
  CombatError,
  type ChargedAction,
  type Combatant,
  type CombatAction,
  type CombatEvent,
  type CombatState,
  type GridPosition,
} from "./types";

/**
 * Action resolution: every player and enemy action goes through
 * takeAction, which returns a new CombatState with events appended. All
 * randomness (hit rolls, flee rolls) advances the state's seeded RNG, so
 * the whole fight is deterministic given the seed and the action sequence.
 */

function withCombatant(
  state: CombatState,
  id: string,
  update: (c: Combatant) => Combatant,
): CombatState {
  return {
    ...state,
    combatants: state.combatants.map((c) => (c.id === id ? update(c) : c)),
  };
}

function pushEvents(state: CombatState, ...events: CombatEvent[]): CombatState {
  return { ...state, log: [...state.log, ...events] };
}

/** Ends the fight if either side is wiped out. */
function settleOutcome(state: CombatState): CombatState {
  if (state.status !== "active") return state;
  if (!isAlive(playerCombatant(state))) {
    return pushEvents(
      { ...state, status: "defeat" },
      { type: "combat-ended", result: "defeat" },
    );
  }
  if (livingEnemies(state).length === 0) {
    return pushEvents(
      { ...state, status: "victory" },
      { type: "combat-ended", result: "victory" },
    );
  }
  return state;
}

function requireActionAvailable(state: CombatState): void {
  if (state.actionUsed) {
    throw new CombatError("action-used", "Main action already spent this turn");
  }
}

/** The target must exist, be alive, and stand on the opposite side. */
function requireOpponent(
  state: CombatState,
  actor: Combatant,
  targetId: string,
): Combatant {
  const target = requireCombatant(state, targetId);
  if (!isAlive(target) || !areOpposed(target, actor)) {
    throw new CombatError(
      "invalid-target",
      `"${targetId}" is not a living opponent of "${actor.id}"`,
    );
  }
  return target;
}

function doMove(state: CombatState, to: GridPosition): CombatState {
  const actor = activeCombatant(state);
  // A step costs the distance between anchors, but legality is asked of
  // the whole block: a 2×2 body needs all four of its tiles free and on
  // the grid, however open the corner it is aimed at happens to be.
  const cost = manhattan(actor.position, to);
  if (
    cost === 0 ||
    cost > state.moveRemaining ||
    !canStand(state.grid, state.combatants, to, actor.footprint, actor.id)
  ) {
    throw new CombatError(
      "invalid-move",
      `Cannot move to (${to.x}, ${to.y}): out of bounds, occupied, or ` +
        `beyond the ${state.moveRemaining} steps remaining`,
    );
  }
  const from = { ...actor.position };
  const next = withCombatant(
    { ...state, moveRemaining: state.moveRemaining - cost },
    actor.id,
    (c) => ({ ...c, position: { x: to.x, y: to.y } }),
  );
  return pushEvents(next, {
    type: "moved",
    combatantId: actor.id,
    from,
    to: { x: to.x, y: to.y },
  });
}

function doAttack(state: CombatState, targetId: string): CombatState {
  requireActionAvailable(state);
  const actor = activeCombatant(state);
  const target = requireOpponent(state, actor, targetId);
  const distance = bodyGap(actor, target);
  const range = weaponReach(actor.weapon);
  if (distance > range) {
    throw new CombatError(
      "out-of-range",
      `${actor.weapon.name} reaches ${range}, target is ${distance} away`,
    );
  }

  const attackStat = combatStat(actor, attackStatKey(actor.weapon.rangeType));
  const chance = attackHitChance(
    actor.weapon,
    attackStat,
    combatStat(target, "reflexes"),
  );
  const roll = nextFloat(state.rng);
  const hit = roll.value < chance;
  const damage = hit ? attackDamage(actor.weapon, attackStat, target.armor) : 0;

  let next: CombatState = { ...state, rng: roll.state, actionUsed: true };
  if (hit) {
    next = withCombatant(next, target.id, (c) => ({ ...c, hp: c.hp - damage }));
  }
  next = pushEvents(next, {
    type: "attacked",
    attackerId: actor.id,
    targetId: target.id,
    hit,
    damage,
  });
  if (hit && getCombatant(next, target.id)!.hp <= 0) {
    next = pushEvents(next, { type: "defeated", combatantId: target.id });
  }
  return settleOutcome(next);
}

function doUseItem(
  state: CombatState,
  itemId: string,
  resolve: ItemResolver,
): CombatState {
  const actor = activeCombatant(state);
  if (actor.kind !== "player") {
    throw new CombatError("player-only", "Only the player carries items");
  }
  requireActionAvailable(state);
  const carried = actor.consumables.find((c) => c.itemId === itemId);
  const item = resolve(itemId);
  if (!carried || carried.quantity < 1 || item.kind !== "consumable") {
    throw new CombatError("no-item", `No usable consumable "${itemId}"`);
  }

  let next = withCombatant({ ...state, actionUsed: true }, actor.id, (c) => ({
    ...c,
    consumables: c.consumables
      .map((s) => (s.itemId === itemId ? { ...s, quantity: s.quantity - 1 } : s))
      .filter((s) => s.quantity > 0),
  }));
  const consumed = next.itemsConsumed.find((s) => s.itemId === itemId);
  next = {
    ...next,
    itemsConsumed: consumed
      ? next.itemsConsumed.map((s) =>
          s.itemId === itemId ? { ...s, quantity: s.quantity + 1 } : s,
        )
      : [...next.itemsConsumed, { itemId, quantity: 1 }],
  };
  next = pushEvents(next, {
    type: "item-used",
    combatantId: actor.id,
    itemId,
  });

  const effect = item.effect;
  if (effect.type === "heal") {
    const healed = Math.min(effect.amount, actor.maxHp - actor.hp);
    next = withCombatant(next, actor.id, (c) => ({
      ...c,
      hp: c.hp + healed,
    }));
    return pushEvents(next, {
      type: "healed",
      combatantId: actor.id,
      amount: healed,
    });
  }
  next = withCombatant(next, actor.id, (c) => ({
    ...c,
    boosts: [
      ...c.boosts,
      { stat: effect.stat, amount: effect.amount, turnsLeft: effect.turns },
    ],
  }));
  return pushEvents(next, {
    type: "boosted",
    combatantId: actor.id,
    stat: effect.stat,
    amount: effect.amount,
    turns: effect.turns,
  });
}

function doUseAbility(
  state: CombatState,
  abilityId: string,
  targetId: string,
): CombatState {
  requireActionAvailable(state);
  const actor = activeCombatant(state);
  if (!actor.abilityIds.includes(abilityId)) {
    throw new CombatError(
      "unknown-ability",
      `"${actor.id}" does not have ability "${abilityId}"`,
    );
  }
  if ((actor.cooldowns[abilityId] ?? 0) > 0) {
    throw new CombatError(
      "ability-on-cooldown",
      `"${abilityId}" is on cooldown for ${actor.cooldowns[abilityId]} more turns`,
    );
  }
  const ability = requireAbility(abilityId);

  let next = withCombatant({ ...state, actionUsed: true }, actor.id, (c) => ({
    ...c,
    cooldowns: { ...c.cooldowns, [abilityId]: ability.cooldown },
  }));

  if (ability.effect.type === "boost") {
    if (targetId !== actor.id) {
      throw new CombatError(
        "invalid-target",
        `"${abilityId}" targets self, not "${targetId}"`,
      );
    }
    const { stat, amount, turns } = ability.effect;
    next = withCombatant(next, actor.id, (c) => ({
      ...c,
      boosts: [...c.boosts, { stat, amount, turnsLeft: turns }],
    }));
    return pushEvents(
      next,
      {
        type: "ability-used",
        combatantId: actor.id,
        abilityId,
        targetId: actor.id,
        damage: 0,
        stunTurns: 0,
      },
      { type: "boosted", combatantId: actor.id, stat, amount, turns },
    );
  }

  const target = requireOpponent(state, actor, targetId);
  const distance = bodyGap(actor, target);
  if (distance > ability.range) {
    throw new CombatError(
      "out-of-range",
      `"${abilityId}" reaches ${ability.range}, target is ${distance} away`,
    );
  }

  // A charged ability is not thrown now: the shape is resolved against
  // the board as it stands, frozen onto the caster, and marked on the
  // ground for a turn (see ./charge.ts). What lands is whatever is
  // standing in it when the caster's next turn comes round.
  if (windUpTurns(ability) > 0) {
    const charge: ChargedAction = {
      abilityId,
      targetId: target.id,
      tiles: abilityAreaTiles(state, actor, ability, target.position),
      turnsLeft: windUpTurns(ability),
    };
    next = withCombatant(next, actor.id, (c) => ({ ...c, charge }));
    return pushEvents(next, {
      type: "charge-started",
      combatantId: actor.id,
      abilityId,
      targetId: target.id,
      turns: charge.turnsLeft,
    });
  }

  // Whoever the shape actually reaches — the body aimed at, plus anyone
  // else standing under it. Resolved by the same function the telegraph
  // tinted the tiles with, so the blast catches exactly what was shown.
  for (const caught of abilityImpact(state, actor, ability, target)) {
    const { damage, stunTurns } = abilityHit(ability.effect, caught.armor);
    next = withCombatant(next, caught.id, (c) => ({
      ...c,
      hp: c.hp - damage,
      stunTurns: c.stunTurns + stunTurns,
    }));
    // One event per body: the log, the floating figures, and the hit
    // reactions all read a blast as the several blows it is.
    next = pushEvents(next, {
      type: "ability-used",
      combatantId: actor.id,
      abilityId,
      targetId: caught.id,
      damage,
      stunTurns,
    });
    if (getCombatant(next, caught.id)!.hp <= 0) {
      next = pushEvents(next, { type: "defeated", combatantId: caught.id });
    }
  }
  return settleOutcome(next);
}

function doFlee(state: CombatState): CombatState {
  const actor = activeCombatant(state);
  if (actor.kind !== "player") {
    throw new CombatError("player-only", "Only the player can flee");
  }
  if (!state.fleeable) {
    throw new CombatError("cannot-flee", "There is no way out of this fight");
  }
  requireActionAvailable(state);

  const chance = fleeChance(
    combatStat(actor, "reflexes"),
    livingEnemies(state).map((e) => combatStat(e, "reflexes")),
  );
  const roll = nextFloat(state.rng);
  const success = roll.value < chance;
  let next: CombatState = { ...state, rng: roll.state, actionUsed: true };
  next = pushEvents(next, {
    type: "flee-attempted",
    combatantId: actor.id,
    success,
  });
  if (!success) return next;
  return pushEvents(
    { ...next, status: "fled" },
    { type: "combat-ended", result: "fled" },
  );
}

/**
 * Throws whatever the combatant now acting has been winding up. The
 * frozen tiles are what lands — nothing re-aims, so a body that walked
 * off the marked ground takes nothing and the release says so. Firing
 * spends the turn's main action: a charge is one action paid for over
 * two turns, not a free blow on top of a fresh one.
 */
function releaseCharge(
  state: CombatState,
  actor: Combatant,
  charge: ChargedAction,
): CombatState {
  const ability = requireAbility(charge.abilityId);
  const caught = chargeImpact(state, actor, charge);
  let next = withCombatant({ ...state, actionUsed: true }, actor.id, (c) => ({
    ...c,
    charge: null,
  }));
  next = pushEvents(next, {
    type: "charge-released",
    combatantId: actor.id,
    abilityId: charge.abilityId,
    bodies: caught.length,
  });
  // Reported as the ability it is, body by body: the log line, the
  // effect archetype, the floating figure, and the hit reaction all come
  // off these entries, so a released charge needs no second UI path.
  for (const body of caught) {
    const { damage, stunTurns } = abilityHit(ability.effect, body.armor);
    next = withCombatant(next, body.id, (c) => ({
      ...c,
      hp: c.hp - damage,
      stunTurns: c.stunTurns + stunTurns,
    }));
    next = pushEvents(next, {
      type: "ability-used",
      combatantId: actor.id,
      abilityId: charge.abilityId,
      targetId: body.id,
      damage,
      stunTurns,
    });
    if (getCombatant(next, body.id)!.hp <= 0) {
      next = pushEvents(next, { type: "defeated", combatantId: body.id });
    }
  }
  return settleOutcome(next);
}

/**
 * The start of a turn, for a combatant holding a wind-up: one turn
 * closer, or thrown. A stunned combatant never reaches here (its turn is
 * skipped before this runs), which is exactly right — stunning a chassis
 * mid-charge holds its volley back rather than cancelling it.
 */
function tickCharge(state: CombatState): CombatState {
  if (state.status !== "active") return state;
  const actor = activeCombatant(state);
  const charge = actor.charge;
  if (!charge) return state;
  if (charge.turnsLeft > 1) {
    return withCombatant(state, actor.id, (c) => ({
      ...c,
      charge: { ...charge, turnsLeft: charge.turnsLeft - 1 },
    }));
  }
  return releaseCharge(state, actor, charge);
}

/**
 * Passes the turn: ticks the outgoing combatant's boosts and cooldowns,
 * then advances to the next living combatant, burning stun turns (each
 * stunned combatant loses its whole turn per stun point), and finally
 * throws whatever that combatant had been winding up.
 */
function advanceTurn(state: CombatState): CombatState {
  const actor = activeCombatant(state);
  let next = withCombatant(state, actor.id, (c) => ({
    ...c,
    boosts: c.boosts
      .map((b) => ({ ...b, turnsLeft: b.turnsLeft - 1 }))
      .filter((b) => b.turnsLeft > 0),
    cooldowns: Object.fromEntries(
      Object.entries(c.cooldowns).map(([id, turns]) => [
        id,
        Math.max(0, turns - 1),
      ]),
    ),
  }));

  const events: CombatEvent[] = [];
  let index = next.turnIndex;
  let round = next.round;
  for (;;) {
    index = (index + 1) % next.initiativeOrder.length;
    if (index === 0) {
      round += 1;
      events.push({ type: "round-started", round });
    }
    const candidate = getCombatant(next, next.initiativeOrder[index] ?? "")!;
    if (!isAlive(candidate)) continue;
    if (candidate.stunTurns > 0) {
      next = withCombatant(next, candidate.id, (c) => ({
        ...c,
        stunTurns: c.stunTurns - 1,
      }));
      events.push({ type: "stun-skipped", combatantId: candidate.id });
      continue;
    }
    events.push({ type: "turn-started", combatantId: candidate.id });
    next = {
      ...next,
      turnIndex: index,
      round,
      moveRemaining: moveSpeed(combatStat(candidate, "reflexes")),
      actionUsed: false,
    };
    break;
  }
  return tickCharge(pushEvents(next, ...events));
}

/** Resolves one action for the active combatant. Pure — returns new state. */
export function takeAction(
  state: CombatState,
  action: CombatAction,
  resolve: ItemResolver = requireItem,
): CombatState {
  if (state.status !== "active") {
    throw new CombatError("combat-over", "Combat has already ended");
  }
  switch (action.type) {
    case "move":
      return doMove(state, action.to);
    case "attack":
      return doAttack(state, action.targetId);
    case "use-item":
      return doUseItem(state, action.itemId, resolve);
    case "use-ability":
      return doUseAbility(state, action.abilityId, action.targetId);
    case "flee":
      return doFlee(state);
    case "end-turn":
      return advanceTurn(state);
  }
}
