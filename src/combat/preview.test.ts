import { describe, expect, it } from "vitest";
import { requireAbility } from "../data/abilities";
import { attackDamage, hitChance, weaponRange } from "./damage";
import { attackOptions } from "./legal";
import {
  COMBAT_ACTION_KINDS,
  abilityPreviews,
  actionAvailabilities,
  actionAvailability,
  attackPreview,
  movePreview,
  outcomesFor,
} from "./preview";
import { makeCombat, makeCombatant } from "./testSupport";
import type { CombatActionKind } from "./preview";

/**
 * The figures and reasons the HUD quotes. Two things are being pinned
 * here: that the numbers are the engine's own (never re-derived), and
 * that a blocked action names the *first* thing standing in its way,
 * so a greyed button always tells the player what to change.
 */

const player = (over = {}) =>
  makeCombatant({
    id: "player",
    kind: "player",
    name: "Vex",
    position: { x: 2, y: 2 },
    weapon: { name: "Shard Knife", damage: 5, rangeType: "melee" },
    ...over,
  });

/** The reason one kind reports, for terse assertions. */
function reason(
  state: Parameters<typeof actionAvailability>[0],
  kind: CombatActionKind,
): string | null {
  return actionAvailability(state, kind).reason;
}

describe("attackPreview", () => {
  it("quotes the engine's own odds and damage, hardest hit first", () => {
    const state = makeCombat([
      player(),
      makeCombatant({
        id: "soft",
        position: { x: 2, y: 1 },
        armor: 0,
        maxHp: 10,
        hp: 10,
      }),
      makeCombatant({
        id: "plated",
        position: { x: 1, y: 2 },
        armor: 3,
        maxHp: 10,
        hp: 10,
      }),
    ]);
    const preview = attackPreview(state);

    expect(preview.weaponName).toBe("Shard Knife");
    expect(preview.rangeType).toBe("melee");
    expect(preview.range).toBe(weaponRange("melee"));
    // Same set as the legal query, only ordered for reading.
    expect(preview.options.map((o) => o.targetId).sort()).toEqual(
      attackOptions(state).map((o) => o.targetId).sort(),
    );
    // Plating soaks damage, so the unarmoured body is the better shot.
    expect(preview.best?.targetId).toBe("soft");
    expect(preview.best?.damage).toBe(
      attackDamage(state.combatants[0]!.weapon, 5, 0),
    );
    expect(preview.best?.hitChance).toBe(hitChance(5, 5));
  });

  it("has no best shot when nothing is in reach", () => {
    const state = makeCombat([
      player(),
      makeCombatant({ id: "far", position: { x: 7, y: 7 } }),
    ]);
    expect(attackPreview(state).options).toEqual([]);
    expect(attackPreview(state).best).toBeNull();
  });
});

describe("abilityPreviews", () => {
  it("flattens each ability to its cooldown, reach, and hardest target", () => {
    const stun = requireAbility("ability-stun-strike");
    const state = makeCombat([
      player({ abilityIds: ["ability-stun-strike"] }),
      makeCombatant({ id: "near", position: { x: 2, y: 1 }, armor: 0 }),
    ]);
    const [preview] = abilityPreviews(state);

    expect(preview?.abilityId).toBe("ability-stun-strike");
    expect(preview?.ready).toBe(true);
    expect(preview?.cooldown).toBe(0);
    expect(preview?.range).toBe(stun.range);
    expect(preview?.targetCount).toBe(1);
    expect(preview?.stunTurns).toBe(1);
    expect(preview?.damage).toBeGreaterThan(0);
  });

  it("reports a cooling ability with no targets and its turns remaining", () => {
    const state = makeCombat([
      player({
        abilityIds: ["ability-stun-strike"],
        cooldowns: { "ability-stun-strike": 2 },
      }),
      makeCombatant({ id: "near", position: { x: 2, y: 1 } }),
    ]);
    const [preview] = abilityPreviews(state);
    expect(preview?.cooldown).toBe(2);
    expect(preview?.ready).toBe(false);
    expect(preview?.targetCount).toBe(0);
    expect(preview?.damage).toBe(0);
  });
});

describe("movePreview", () => {
  it("counts the steps left and the ground they cover", () => {
    const state = makeCombat([player()], {
      moveRemaining: 1,
      grid: { width: 5, height: 5 },
    });
    expect(movePreview(state)).toEqual({ stepsLeft: 1, tiles: 4 });
  });

  it("goes to nothing once the fight is over", () => {
    const state = makeCombat([player()], { status: "victory" });
    expect(movePreview(state)).toEqual({ stepsLeft: 0, tiles: 0 });
  });
});

describe("actionAvailability", () => {
  it("opens every action on a fresh player turn with a foe in reach", () => {
    const state = makeCombat([
      player({ consumables: [{ itemId: "con-trauma-patch", quantity: 1 }] }),
      makeCombatant({ id: "near", position: { x: 2, y: 1 } }),
    ]);
    for (const kind of COMBAT_ACTION_KINDS) {
      if (kind === "ability") continue; // no abilities on this fixture
      expect(actionAvailability(state, kind), kind).toEqual({
        kind,
        available: true,
        reason: null,
      });
    }
  });

  it("reports the fight being over ahead of every other reason", () => {
    const state = makeCombat([player(), makeCombatant({ id: "foe", hp: 0 })], {
      status: "victory",
    });
    for (const { reason: why } of actionAvailabilities(state)) {
      expect(why).toBe("combat-over");
    }
  });

  it("reports an enemy's turn as not the player's, whatever the player could do", () => {
    const state = makeCombat(
      [player(), makeCombatant({ id: "foe", position: { x: 2, y: 1 } })],
      { turnIndex: 1 },
    );
    for (const { reason: why } of actionAvailabilities(state)) {
      expect(why).toBe("not-your-turn");
    }
  });

  it("separates a spent action from an empty arena and from a bad angle", () => {
    const near = () => makeCombatant({ id: "foe", position: { x: 2, y: 1 } });
    // Action spent: the target is right there, the turn is not.
    expect(reason(makeCombat([player(), near()], { actionUsed: true }), "attack"))
      .toBe("action-used");
    // Standing, but a room away.
    expect(
      reason(
        makeCombat([
          player(),
          makeCombatant({ id: "foe", position: { x: 7, y: 7 } }),
        ]),
        "attack",
      ),
    ).toBe("out-of-range");
    // Nothing left standing at all.
    expect(
      reason(
        makeCombat([
          player(),
          makeCombatant({ id: "foe", position: { x: 2, y: 1 }, hp: 0 }),
        ]),
        "attack",
      ),
    ).toBe("no-targets");
  });

  it("distinguishes carrying no abilities from every one cooling down", () => {
    const foe = () => makeCombatant({ id: "foe", position: { x: 2, y: 1 } });
    expect(reason(makeCombat([player(), foe()]), "ability")).toBe(
      "no-abilities",
    );
    expect(
      reason(
        makeCombat([
          player({
            abilityIds: ["ability-stun-strike"],
            cooldowns: { "ability-stun-strike": 1 },
          }),
          foe(),
        ]),
        "ability",
      ),
    ).toBe("on-cooldown");
    // Off cooldown but the target is five tiles past melee reach.
    expect(
      reason(
        makeCombat([
          player({ abilityIds: ["ability-stun-strike"] }),
          makeCombatant({ id: "foe", position: { x: 7, y: 7 } }),
        ]),
        "ability",
      ),
    ).toBe("out-of-range");
  });

  it("lets a self-buff fire with nothing in reach", () => {
    // Combat Focus boosts the caster, so distance is beside the point.
    const state = makeCombat([
      player({ abilityIds: ["ability-combat-focus"] }),
      makeCombatant({ id: "foe", position: { x: 7, y: 7 } }),
    ]);
    expect(reason(state, "ability")).toBeNull();
  });

  it("names an empty pack before a spent action, and the reverse once it is stocked", () => {
    expect(
      reason(makeCombat([player()], { actionUsed: true }), "item"),
    ).toBe("no-items");
    expect(
      reason(
        makeCombat(
          [player({ consumables: [{ itemId: "con-trauma-patch", quantity: 1 }] })],
          { actionUsed: true },
        ),
        "item",
      ),
    ).toBe("action-used");
  });

  it("separates a spent step budget from having nowhere to put it", () => {
    expect(reason(makeCombat([player()], { moveRemaining: 0 }), "move")).toBe(
      "no-steps",
    );
    // Boxed into a 1×1 arena: steps remain, ground does not.
    expect(
      reason(
        makeCombat([player({ position: { x: 0, y: 0 } })], {
          grid: { width: 1, height: 1 },
        }),
        "move",
      ),
    ).toBe("no-room");
  });

  it("says a fight cannot be walked away from, and never blames the action", () => {
    expect(reason(makeCombat([player()], { fleeable: false }), "flee")).toBe(
      "cannot-flee",
    );
    expect(
      reason(makeCombat([player()], { actionUsed: true }), "flee"),
    ).toBe("action-used");
  });

  it("keeps End Turn open for as long as the turn is the player's", () => {
    const state = makeCombat([player()], {
      actionUsed: true,
      moveRemaining: 0,
    });
    expect(actionAvailability(state, "end-turn").available).toBe(true);
  });

  it("answers for every kind, in bar order", () => {
    const state = makeCombat([player()]);
    expect(actionAvailabilities(state).map((a) => a.kind)).toEqual([
      ...COMBAT_ACTION_KINDS,
    ]);
  });
});

describe("outcomesFor", () => {
  it("prices a weapon shot as a span, because it can miss", () => {
    const state = makeCombat([
      player(),
      makeCombatant({ id: "thug", position: { x: 3, y: 2 }, armor: 1 }),
    ]);
    const [outcome] = outcomesFor(state, { kind: "attack" }, "thug");
    const option = attackOptions(state).find((o) => o.targetId === "thug");
    expect(outcome?.primary).toBe(true);
    expect(outcome?.hitChance).toBe(option?.hitChance);
    expect(outcome?.damageMax).toBe(option?.damage);
    // Nothing lands on the turns it misses, and the chip must say so.
    expect(outcome?.damageMin).toBe(0);
    expect(outcome?.statuses).toEqual([]);
  });

  it("prices an ability as a certainty, because it cannot miss", () => {
    const state = makeCombat([
      player({ abilityIds: ["ability-shock-dart"] }),
      makeCombatant({ id: "thug", position: { x: 5, y: 2 }, armor: 1 }),
    ]);
    const [outcome] = outcomesFor(
      state,
      { kind: "ability", abilityId: "ability-shock-dart" },
      "thug",
    );
    expect(outcome?.hitChance).toBeNull();
    expect(outcome?.damageMin).toBe(outcome?.damageMax);
    const effect = requireAbility("ability-shock-dart").effect;
    expect(outcome?.damageMax).toBe(
      effect.type === "damage" ? effect.amount - 1 : 0,
    );
  });

  it("prices every body an area ability reaches, the aimed one first", () => {
    const state = makeCombat([
      player({ abilityIds: ["ability-stun-strike"] }),
      makeCombatant({ id: "aimed", position: { x: 3, y: 2 } }),
      makeCombatant({ id: "beside", position: { x: 3, y: 3 }, armor: 1 }),
      makeCombatant({ id: "clear", position: { x: 7, y: 7 } }),
    ]);
    const outcomes = outcomesFor(
      state,
      { kind: "ability", abilityId: "ability-stun-strike" },
      "aimed",
    );
    expect(outcomes.map((o) => o.targetId)).toEqual(["aimed", "beside"]);
    expect(outcomes.map((o) => o.primary)).toEqual([true, false]);
    // Armor is read per body, not once for the whole blast.
    expect(outcomes[0]?.damageMax).toBe(2);
    expect(outcomes[1]?.damageMax).toBe(1);
    for (const outcome of outcomes) {
      expect(outcome.statuses, outcome.targetId).toEqual([
        { kind: "stun", turns: 1 },
      ]);
    }
  });

  it("prices a self-boost as the boost it grants, aimed at nobody else", () => {
    const state = makeCombat([
      player({ abilityIds: ["ability-combat-focus"] }),
      makeCombatant({ id: "thug", position: { x: 3, y: 2 } }),
    ]);
    const intent = { kind: "ability", abilityId: "ability-combat-focus" } as const;
    expect(outcomesFor(state, intent, "thug")).toEqual([]);
    const [outcome] = outcomesFor(state, intent, "player");
    expect(outcome?.damageMax).toBe(0);
    expect(outcome?.statuses).toEqual([
      { kind: "boost", stat: "reflexes", amount: 2, turns: 2 },
    ]);
  });

  it("prices nothing the engine would refuse", () => {
    const far = makeCombatant({ id: "far", position: { x: 7, y: 7 } });
    const near = makeCombatant({ id: "near", position: { x: 3, y: 2 } });
    // Out of the weapon's reach.
    expect(
      outcomesFor(makeCombat([player(), far]), { kind: "attack" }, "far"),
    ).toEqual([]);
    // The turn's action already spent.
    expect(
      outcomesFor(
        makeCombat([player(), near], { actionUsed: true }),
        { kind: "attack" },
        "near",
      ),
    ).toEqual([]);
    // An ability the actor does not carry, and one still cooling down.
    expect(
      outcomesFor(
        makeCombat([player(), near]),
        { kind: "ability", abilityId: "ability-shock-dart" },
        "near",
      ),
    ).toEqual([]);
    expect(
      outcomesFor(
        makeCombat([
          player({
            abilityIds: ["ability-shock-dart"],
            cooldowns: { "ability-shock-dart": 1 },
          }),
          near,
        ]),
        { kind: "ability", abilityId: "ability-shock-dart" },
        "near",
      ),
    ).toEqual([]);
    // And nothing at all once the fight is over.
    expect(
      outcomesFor(
        makeCombat([player(), near], { status: "victory" }),
        { kind: "attack" },
        "near",
      ),
    ).toEqual([]);
  });

  it("is the one source the action bar's own figures come from", () => {
    // abilityPreviews feeds the tooltips; if it ever stops reading
    // outcomesFor, a chip and a tooltip can disagree about one aim.
    const state = makeCombat([
      player({ abilityIds: ["ability-stun-strike"] }),
      makeCombatant({ id: "aimed", position: { x: 3, y: 2 } }),
      makeCombatant({ id: "beside", position: { x: 3, y: 3 } }),
    ]);
    const preview = abilityPreviews(state).find(
      (p) => p.abilityId === "ability-stun-strike",
    );
    const outcomes = outcomesFor(
      state,
      { kind: "ability", abilityId: "ability-stun-strike" },
      "aimed",
    );
    expect(preview?.bodies).toBe(outcomes.length);
    expect(preview?.damage).toBe(outcomes[0]?.damageMax);
    expect(preview?.stunTurns).toBe(1);
  });
});
