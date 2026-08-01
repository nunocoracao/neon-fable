import { describe, expect, it } from "vitest";
import { PLAYER_COMBATANT_ID } from "./setup";
import { previewFocusId } from "./preview";
import { assistedHoverTile } from "./telegraph";
import { makeCombat, makeCombatant } from "./testSupport";
import type { CombatState } from "./types";

/**
 * The "keep previews up" assist's one seam: which body an outcome is
 * shown for when the player is pointing at nobody. It picks a subject
 * and nothing else — the figures on the chip come from the same
 * outcomesFor a hover would have gone through, which is what makes it
 * an accessibility switch rather than a difficulty one.
 */

/** The player in the middle, with foes at the given distances east. */
function arena(...foes: { id: string; hp?: number; armor?: number }[]) {
  return makeCombat([
    makeCombatant({
      id: PLAYER_COMBATANT_ID,
      kind: "player",
      position: { x: 0, y: 0 },
      weapon: { name: "Rail Pistol", damage: 6, rangeType: "ranged" },
      abilityIds: [],
    }),
    ...foes.map((foe, index) =>
      makeCombatant({
        id: foe.id,
        position: { x: index + 1, y: 0 },
        hp: foe.hp ?? 20,
        armor: foe.armor ?? 0,
      }),
    ),
  ]);
}

describe("the body an always-on preview points at", () => {
  it("is the target the action bar already calls the one worth taking", () => {
    // Same weapon, same odds: the nearer body wins the tie-break, which
    // is exactly what attackPreview's `best` reports.
    const combat = arena({ id: "near" }, { id: "far" });
    expect(previewFocusId(combat, { kind: "attack" })).toBe("near");
    expect(assistedHoverTile(combat, { kind: "attack" })).toEqual({
      x: 1,
      y: 0,
    });
  });

  it("prefers the body a blow would hurt most", () => {
    // The nearer body is armored, so the far one takes the harder hit
    // and the assist points there instead.
    const combat = arena({ id: "plated", armor: 4 }, { id: "soft" });
    expect(previewFocusId(combat, { kind: "attack" })).toBe("soft");
    expect(assistedHoverTile(combat, { kind: "attack" })).toEqual({
      x: 2,
      y: 0,
    });
  });

  it("points at nobody for an intent that aims at nobody", () => {
    const combat = arena({ id: "near" });
    expect(assistedHoverTile(combat, { kind: "none" })).toBeNull();
    expect(assistedHoverTile(combat, { kind: "move" })).toBeNull();
  });

  it("points at nobody when the open action has no legal aim", () => {
    // Everything in range is already down.
    const combat = arena({ id: "downed", hp: 0 });
    expect(previewFocusId(combat, { kind: "attack" })).toBeNull();
    expect(assistedHoverTile(combat, { kind: "attack" })).toBeNull();
  });

  it("points at nobody once the main action is spent", () => {
    const combat: CombatState = { ...arena({ id: "near" }), actionUsed: true };
    expect(assistedHoverTile(combat, { kind: "attack" })).toBeNull();
  });

  it("points at nobody on somebody else's turn, or after the fight", () => {
    const base = arena({ id: "near" });
    const enemyTurn: CombatState = {
      ...base,
      turnIndex: base.initiativeOrder.indexOf("near"),
    };
    expect(assistedHoverTile(enemyTurn, { kind: "attack" })).toBeNull();
    expect(
      assistedHoverTile({ ...base, status: "victory" }, { kind: "attack" }),
    ).toBeNull();
  });

  it("points at nobody for an ability the actor does not carry", () => {
    const combat = arena({ id: "near" });
    expect(
      assistedHoverTile(combat, { kind: "ability", abilityId: "abl-nothing" }),
    ).toBeNull();
  });
});
