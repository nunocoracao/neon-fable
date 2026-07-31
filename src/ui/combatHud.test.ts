import { describe, expect, it } from "vitest";
import {
  COMBAT_ACTION_KINDS,
  TELEGRAPH_REASONS,
  TELEGRAPH_ROLES,
  movePreview,
  telegraphHover,
  SURGE_ARM_TURNS,
  type CombatActionKind,
  type CombatState,
} from "../combat";
import { makeCombat, makeCombatant } from "../combat/testSupport";
import { requireAbility } from "../data/abilities";
import { TELEGRAPH_TINT_IDS } from "../iso";
import {
  TELEGRAPH_TINT_BY_ROLE,
  actionButtons,
  actionForHotkey,
  actionHotkey,
  blockReasonText,
  damageRangeLabel,
  hpLabel,
  initiativeChips,
  staticSurgeWarning,
  targetCard,
  telegraphChip,
  telegraphReasonText,
  telegraphTileViews,
} from "./combatHud";

/**
 * The HUD's model layer, exercised without a DOM. What the rail claims
 * about turn order, what a button's tooltip says, and what the target
 * card reads off a body are all plain data here — so the screen test
 * only has to prove the data reaches the page.
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

const foe = (id: string, over = {}) =>
  makeCombatant({ id, name: id, enemyId: "nme-rustyard-bruiser", ...over });

describe("initiativeChips", () => {
  it("keeps the rail in fixed initiative order and counts the turns ahead", () => {
    const state = makeCombat([
      player(),
      foe("a", { position: { x: 4, y: 2 } }),
      foe("b", { position: { x: 5, y: 2 } }),
    ]);
    const chips = initiativeChips(state);

    expect(chips.map((c) => c.combatantId)).toEqual(["player", "a", "b"]);
    expect(chips.map((c) => c.turnsAway)).toEqual([0, 1, 2]);
    expect(chips.map((c) => c.active)).toEqual([true, false, false]);
  });

  it("holds the rail's order while the highlight walks it", () => {
    const state = makeCombat(
      [player(), foe("a"), foe("b")],
      { turnIndex: 2 },
    );
    const chips = initiativeChips(state);
    // Order never re-sorts; only who is up and how far off the rest are.
    expect(chips.map((c) => c.combatantId)).toEqual(["player", "a", "b"]);
    expect(chips.map((c) => c.turnsAway)).toEqual([1, 2, 0]);
    expect(chips.find((c) => c.active)?.combatantId).toBe("b");
  });

  it("skips the defeated in the queue but keeps their place in the rail", () => {
    const state = makeCombat([player(), foe("down", { hp: 0 }), foe("up")]);
    const chips = initiativeChips(state);

    expect(chips.map((c) => c.combatantId)).toEqual(["player", "down", "up"]);
    const down = chips[1];
    expect(down?.alive).toBe(false);
    expect(down?.turnsAway).toBeNull();
    // The living body behind it moves up a place in the queue.
    expect(chips[2]?.turnsAway).toBe(1);
  });

  it("gives nobody a turn once the fight is over", () => {
    const state = makeCombat([player(), foe("a")], { status: "victory" });
    for (const chip of initiativeChips(state)) {
      expect(chip.turnsAway).toBeNull();
      expect(chip.active).toBe(false);
    }
  });

  it("carries the portrait key, the HP bar, and the conditions on the body", () => {
    const state = makeCombat([
      player({ hp: 9, maxHp: 18, stunTurns: 1 }),
      foe("a", { hp: 0, maxHp: 20, boosts: [{ stat: "body", amount: 2, turnsLeft: 1 }] }),
    ]);
    const [me, them] = initiativeChips(state, { player: "Vex", a: "Bruiser 1" });

    expect(me?.name).toBe("Vex");
    expect(me?.kind).toBe("player");
    expect(me?.enemyId).toBeNull();
    expect(me?.hpFraction).toBe(0.5);
    expect(me?.statuses).toEqual(["stunned"]);

    expect(them?.name).toBe("Bruiser 1");
    expect(them?.enemyId).toBe("nme-rustyard-bruiser");
    // A body at zero reads as zero, never as a negative sliver of bar.
    expect(them?.hp).toBe(0);
    expect(them?.hpFraction).toBe(0);
    expect(them?.statuses).toEqual(["guarded"]);
  });
});

describe("actionButtons", () => {
  const stocked = () =>
    makeCombat([
      player({
        abilityIds: ["ability-stun-strike"],
        consumables: [{ itemId: "con-trauma-patch", quantity: 2 }],
      }),
      foe("near", { position: { x: 2, y: 1 }, armor: 0 }),
    ]);

  it("offers every action, in bar order, each with its own hotkey", () => {
    const buttons = actionButtons(stocked());
    expect(buttons.map((b) => b.kind)).toEqual([...COMBAT_ACTION_KINDS]);
    expect(buttons.map((b) => b.hotkey)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(buttons.map((b) => b.iconId)).toEqual([...COMBAT_ACTION_KINDS]);
    expect(buttons.every((b) => b.enabled)).toBe(true);
  });

  it("hotkeys round-trip to the action they run, and ignore other keys", () => {
    for (const kind of COMBAT_ACTION_KINDS) {
      expect(actionForHotkey(actionHotkey(kind))).toBe(kind);
    }
    expect(actionForHotkey("0")).toBeNull();
    expect(actionForHotkey("9")).toBeNull();
    expect(actionForHotkey("Escape")).toBeNull();
  });

  it("quotes the engine's figures in the tooltip of an available action", () => {
    const state = stocked();
    const buttons = actionButtons(state);
    const tooltip = (kind: CombatActionKind): string =>
      buttons.find((b) => b.kind === kind)?.tooltip ?? "";

    expect(tooltip("attack")).toMatch(/^Shard Knife — \d+ dmg · \d+% to hit · 1 in range$/);
    expect(tooltip("ability")).toBe(
      `${requireAbility("ability-stun-strike").name} — 2 dmg · stuns 1`,
    );
    expect(tooltip("item")).toBe("Trauma Patch ×2");
    // The ground count is the engine's, not a number this test invents.
    const { stepsLeft, tiles } = movePreview(state);
    expect(tooltip("move")).toBe(
      `${stepsLeft} steps left · ${tiles} tiles in reach`,
    );
    expect(tooltip("flee")).toMatch(/^\d+% to break contact/);
    expect(tooltip("end-turn")).toMatch(/^Pass the turn/);
  });

  it("prints the flee odds on the button face, since they move every turn", () => {
    const label = actionButtons(stocked()).find((b) => b.kind === "flee")?.label;
    expect(label).toMatch(/^Flee \(\d+%\)$/);
  });

  it("explains every disabled button rather than just greying it", () => {
    const state = makeCombat(
      [player(), foe("far", { position: { x: 7, y: 7 } })],
      { actionUsed: true, moveRemaining: 0 },
    );
    const byKind = new Map(actionButtons(state).map((b) => [b.kind, b]));

    expect(byKind.get("attack")?.enabled).toBe(false);
    expect(byKind.get("attack")?.tooltip).toBe(
      "No AP — this turn's action is spent.",
    );
    expect(byKind.get("move")?.tooltip).toBe("No steps left this turn.");
    expect(byKind.get("ability")?.tooltip).toBe("No abilities installed.");
    expect(byKind.get("item")?.tooltip).toBe("No usable items carried.");
    // End Turn is the one thing always still on the table.
    expect(byKind.get("end-turn")?.enabled).toBe(true);
  });

  it("reads out-of-range as the thing to fix when the action is still in hand", () => {
    const state = makeCombat([
      player(),
      foe("far", { position: { x: 7, y: 7 } }),
    ]);
    const attack = actionButtons(state).find((b) => b.kind === "attack");
    expect(attack?.enabled).toBe(false);
    expect(attack?.tooltip).toBe("Out of range — move closer.");
  });

  it("locks the whole bar while the enemy phase plays out", () => {
    const state = makeCombat([
      player(),
      foe("near", { position: { x: 2, y: 1 } }),
    ]);
    for (const button of actionButtons(state, { busy: true })) {
      expect(button.enabled, button.kind).toBe(false);
      expect(button.tooltip).toBe("Not your turn.");
    }
  });

  it("has a sentence for every reason code", () => {
    const reasons = [
      "combat-over",
      "not-your-turn",
      "action-used",
      "no-targets",
      "out-of-range",
      "no-abilities",
      "on-cooldown",
      "no-items",
      "no-steps",
      "no-room",
      "cannot-flee",
      "player-only",
    ] as const;
    for (const reason of reasons) {
      expect(blockReasonText(reason).length, reason).toBeGreaterThan(0);
    }
  });
});

describe("targetCard", () => {
  it("reads a body's plating, weapon, distance, and what your shot would do", () => {
    const state = makeCombat([
      player(),
      foe("near", {
        position: { x: 2, y: 1 },
        hp: 8,
        maxHp: 16,
        armor: 2,
        weapon: { name: "Pipe Length", damage: 3, rangeType: "melee" },
        stunTurns: 1,
      }),
    ]);
    const card = targetCard(state, "near", { near: "Rustyard Bruiser 1" });

    expect(card?.name).toBe("Rustyard Bruiser 1");
    expect(card?.kind).toBe("enemy");
    expect(card?.enemyId).toBe("nme-rustyard-bruiser");
    expect(card?.hp).toBe(8);
    expect(card?.hpFraction).toBe(0.5);
    expect(card?.armor).toBe(2);
    expect(card?.weaponName).toBe("Pipe Length");
    expect(card?.distance).toBe(1);
    expect(card?.statuses).toEqual(["stunned"]);
    expect(card?.attack?.damage).toBeGreaterThan(0);
    expect(card?.attack?.hitChance).toBeGreaterThan(0);
  });

  it("drops the shot line for a body your weapon cannot reach", () => {
    const state = makeCombat([
      player(),
      foe("far", { position: { x: 7, y: 7 } }),
    ]);
    const card = targetCard(state, "far");
    expect(card?.distance).toBe(10);
    expect(card?.attack).toBeNull();
  });

  it("quotes no shot while an enemy is the one acting", () => {
    // The legal queries answer for whoever is up; mid-enemy-turn that is
    // not the player, and the card must not print the enemy's own odds.
    const state = makeCombat(
      [player(), foe("near", { position: { x: 2, y: 1 } })],
      { turnIndex: 1 },
    );
    expect(targetCard(state, "near")?.attack).toBeNull();
  });

  it("has nothing to show for an unknown id, no id, or a body on the floor", () => {
    const state = makeCombat([player(), foe("down", { hp: 0 })]);
    expect(targetCard(state, null)).toBeNull();
    expect(targetCard(state, "ghost")).toBeNull();
    expect(targetCard(state, "down")).toBeNull();
  });
});

describe("hpLabel", () => {
  it("never reads a body below zero", () => {
    expect(hpLabel(12, 18)).toBe("HP 12/18");
    expect(hpLabel(-4, 18)).toBe("HP 0/18");
  });
});

describe("telegraph tint mapping", () => {
  it("paints every role the engine can produce", () => {
    // Two vocabularies meet in this table — the combat layer's reasons
    // and the iso layer's tints. Either drifting silently would leave a
    // tinted tile painted as undefined.
    for (const role of TELEGRAPH_ROLES) {
      const tint = TELEGRAPH_TINT_BY_ROLE[role];
      expect(TELEGRAPH_TINT_IDS, role).toContain(tint);
    }
    expect(Object.keys(TELEGRAPH_TINT_BY_ROLE).sort()).toEqual(
      [...TELEGRAPH_ROLES].sort(),
    );
  });

  it("hands the scene one entry per tile, overlaps already settled", () => {
    const views = telegraphTileViews([
      { x: 1, y: 1, role: "reach" },
      { x: 2, y: 1, role: "reach" },
      { x: 1, y: 1, role: "path" },
    ]);
    expect(views).toHaveLength(2);
    expect(views.find((v) => v.x === 1 && v.y === 1)?.tint).toBe("path");
  });
});

describe("telegraphChip", () => {
  const at = (x: number, y: number) => ({ x, y });

  it("says nothing at all with no intent open", () => {
    const state = makeCombat([player(), foe("thug", { position: { x: 3, y: 2 } })]);
    const hover = telegraphHover(state, { kind: "none" }, at(3, 2));
    expect(telegraphChip(state, { kind: "none" }, hover)).toBeNull();
    expect(telegraphChip(state, { kind: "attack" }, null)).toBeNull();
  });

  it("prices a walk in steps, and what is left after it", () => {
    const state = makeCombat([player(), foe("thug", { position: { x: 7, y: 7 } })], {
      moveRemaining: 3,
    });
    const intent = { kind: "move" } as const;
    const chip = telegraphChip(
      state,
      intent,
      telegraphHover(state, intent, at(4, 2)),
    );
    expect(chip?.title).toBe("Move");
    expect(chip?.cost).toBe("2 steps · 1 left after");
    expect(chip?.denial).toBeNull();
    expect(chip?.outcomes).toEqual([]);
  });

  it("counts a single step in the singular", () => {
    const state = makeCombat([player(), foe("thug", { position: { x: 7, y: 7 } })], {
      moveRemaining: 3,
    });
    const intent = { kind: "move" } as const;
    expect(
      telegraphChip(state, intent, telegraphHover(state, intent, at(3, 2)))?.cost,
    ).toBe("1 step · 2 left after");
  });

  it("quotes a shot's odds and its span under the weapon's own name", () => {
    const state = makeCombat([
      player(),
      foe("thug", { position: { x: 3, y: 2 }, armor: 1 }),
    ]);
    const intent = { kind: "attack" } as const;
    const chip = telegraphChip(
      state,
      intent,
      telegraphHover(state, intent, at(3, 2)),
      { thug: "Rustyard Bruiser" },
    );
    expect(chip?.title).toBe("Shard Knife");
    expect(chip?.outcomes).toHaveLength(1);
    expect(chip?.outcomes[0]?.name).toBe("Rustyard Bruiser");
    expect(chip?.outcomes[0]?.primary).toBe(true);
    expect(chip?.outcomes[0]?.text).toContain("to hit");
    // A weapon can miss, so its damage reads as the span it can land in.
    expect(chip?.outcomes[0]?.text).toContain("0–4 dmg");
  });

  it("lists every body an area ability reaches, the aim leading", () => {
    const state = makeCombat([
      player({ abilityIds: ["ability-stun-strike"] }),
      foe("aimed", { position: { x: 3, y: 2 } }),
      foe("beside", { position: { x: 3, y: 3 } }),
    ]);
    const intent = {
      kind: "ability",
      abilityId: "ability-stun-strike",
    } as const;
    const chip = telegraphChip(
      state,
      intent,
      telegraphHover(state, intent, at(3, 2)),
      { aimed: "Bruiser", beside: "Runner" },
    );
    expect(chip?.title).toBe("Stun Strike");
    expect(chip?.outcomes.map((o) => o.name)).toEqual(["Bruiser", "Runner"]);
    expect(chip?.outcomes.map((o) => o.primary)).toEqual([true, false]);
    // No odds on an ability — it cannot miss, and must not pretend to.
    for (const outcome of chip?.outcomes ?? []) {
      expect(outcome.text, outcome.name).not.toContain("to hit");
      expect(outcome.text, outcome.name).toContain("stuns 1");
    }
  });

  it("names a self-boost's own effect rather than a damage figure", () => {
    const state = makeCombat([player({ abilityIds: ["ability-combat-focus"] })]);
    const intent = {
      kind: "ability",
      abilityId: "ability-combat-focus",
    } as const;
    const chip = telegraphChip(
      state,
      intent,
      telegraphHover(state, intent, at(2, 2)),
      { player: "Vex" },
    );
    expect(chip?.outcomes[0]?.text).toBe("+2 reflexes for 2 turns");
  });

  it("turns a refusal into the one sentence saying what to change", () => {
    const state = makeCombat([player(), foe("far", { position: { x: 7, y: 7 } })]);
    const intent = { kind: "attack" } as const;
    const chip = telegraphChip(
      state,
      intent,
      telegraphHover(state, intent, at(7, 7)),
    );
    expect(chip?.denial).toBe("Out of range.");
    expect(chip?.outcomes).toEqual([]);
    expect(chip?.cost).toBeNull();
  });

  it("has words for every reason the engine can give", () => {
    for (const reason of TELEGRAPH_REASONS) {
      const text = telegraphReasonText(reason);
      expect(text.length, reason).toBeGreaterThan(0);
      expect(text.endsWith("."), reason).toBe(true);
    }
  });
});

describe("damageRangeLabel", () => {
  it("reads as one figure when nothing can miss, and a span when it can", () => {
    expect(damageRangeLabel(4, 4)).toBe("4 dmg");
    expect(damageRangeLabel(0, 4)).toBe("0–4 dmg");
  });
});

describe("the static surge warning", () => {
  const fight = (surge: CombatState["surge"]): CombatState =>
    makeCombat(
      [
        makeCombatant({ id: "player", kind: "player" }),
        makeCombatant({ id: "foe" }),
      ],
      { surge },
    );

  it("says nothing at all when there is no noise to warn about", () => {
    expect(staticSurgeWarning(fight(null))).toBeNull();
    expect(staticSurgeWarning(fight(undefined))).toBeNull();
  });

  it("counts the quiet turns down while the noise is still building", () => {
    const state = fight({
      combatantId: "player",
      charge: 1,
      armed: false,
      spent: false,
    });
    expect(staticSurgeWarning(state)).toBe(
      `Static building — ${SURGE_ARM_TURNS - 1} turns until it peaks.`,
    );
  });

  it("names the answer once it arms, because that is the whole telegraph", () => {
    const state = fight({
      combatantId: "player",
      charge: SURGE_ARM_TURNS,
      armed: true,
      spent: false,
    });
    const line = staticSurgeWarning(state);
    expect(line).toContain("armed");
    expect(line).toContain("unspent");
  });

  it("falls silent once it has been settled, and once the fight is over", () => {
    expect(
      staticSurgeWarning(
        fight({ combatantId: "player", charge: 0, armed: false, spent: true }),
      ),
    ).toBeNull();
    const armed = fight({
      combatantId: "player",
      charge: SURGE_ARM_TURNS,
      armed: true,
      spent: false,
    });
    expect(staticSurgeWarning({ ...armed, status: "victory" })).toBeNull();
  });
});
