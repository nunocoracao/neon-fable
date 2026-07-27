import type { Combatant, CombatState } from "./types";

/**
 * Fixture builders for combat tests: hand-rolled combatants and states
 * with every field defaulted, so tests set only what they assert on.
 * Not part of the engine — imported by *.test.ts files only.
 */

export function makeCombatant(
  overrides: Partial<Combatant> & { id: string },
): Combatant {
  return {
    kind: "enemy",
    name: overrides.id,
    stats: { body: 5, reflexes: 5, tech: 5, cool: 5, intelligence: 5 },
    maxHp: 20,
    hp: 20,
    weapon: { name: "Test Blade", damage: 4, rangeType: "melee" },
    armor: 0,
    abilityIds: [],
    position: { x: 0, y: 0 },
    boosts: [],
    stunTurns: 0,
    cooldowns: {},
    consumables: [],
    ...overrides,
  };
}

export function makeCombat(
  combatants: Combatant[],
  overrides: Partial<CombatState> = {},
): CombatState {
  return {
    encounterId: "enc-test",
    grid: { width: 8, height: 8 },
    combatants,
    initiativeOrder: combatants.map((c) => c.id),
    round: 1,
    turnIndex: 0,
    moveRemaining: 3,
    actionUsed: false,
    rng: { seed: 42 },
    status: "active",
    fleeable: true,
    itemsConsumed: [],
    log: [],
    ...overrides,
  };
}
