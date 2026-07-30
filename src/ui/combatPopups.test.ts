import { describe, expect, it } from "vitest";
import { CRITICAL_DAMAGE_SHARE, isCriticalBlow } from "../combat";
import type { CombatEvent } from "../combat";
import { STATUS_FAMILY_IDS, statusPopupLabel, type StatusFamilyId } from "../iso";
import {
  damagePopupKind,
  eventPopups,
  statusPopups,
  type StatusSets,
} from "./combatPopups";

/**
 * Turning the log into readouts. What is under test: that every figure
 * shown comes off the event that recorded it (never a count kept on the
 * side), that the styling is a reading of the engine's own numbers, and
 * that conditions announce themselves exactly once — when they arrive,
 * and when they lift.
 */

const HIT: Extract<CombatEvent, { type: "attacked" }> = {
  type: "attacked",
  attackerId: "player",
  targetId: "enemy-1",
  hit: true,
  damage: 7,
};

const sets = (
  entries: ReadonlyArray<[string, readonly StatusFamilyId[]]>,
): StatusSets => new Map(entries);

describe("damage readings", () => {
  it("shows what got through, signed against the bar", () => {
    expect(eventPopups({ ...HIT, damage: 12 }, { target: { armor: 0, maxHp: 60 } })).toEqual([
      { combatantId: "enemy-1", kind: "damage", text: "-12" },
    ]);
  });

  it("shouts a blow that took a real share of the frame", () => {
    const target = { armor: 0, maxHp: 30 };
    expect(damagePopupKind(9, target)).toBe("damage");
    expect(damagePopupKind(10, target)).toBe("critical");
    expect(damagePopupKind(24, target)).toBe("critical");
    // Which is exactly the engine's own reading of the numbers.
    expect(isCriticalBlow(10, 30)).toBe(true);
    expect(CRITICAL_DAMAGE_SHARE).toBeGreaterThan(0);
  });

  it("mutes a blow armor stopped the greater part of", () => {
    expect(damagePopupKind(2, { armor: 3, maxHp: 60 })).toBe("reduced");
    expect(damagePopupKind(2, { armor: 2, maxHp: 60 })).toBe("reduced");
    expect(damagePopupKind(4, { armor: 3, maxHp: 60 })).toBe("damage");
    // Nothing to stop it: an unarmored target never reads as reduced.
    expect(damagePopupKind(1, { armor: 0, maxHp: 60 })).toBe("damage");
  });

  it("lets the bigger fact win when a blow is both", () => {
    // Plating ate as much as got through, but what got through was a
    // third of the body: that is a big hit, not a stopped one.
    expect(damagePopupKind(6, { armor: 6, maxHp: 18 })).toBe("critical");
  });

  it("styles a blow it knows nothing about as plain damage", () => {
    expect(eventPopups(HIT)).toEqual([
      { combatantId: "enemy-1", kind: "damage", text: "-7" },
    ]);
  });

  it("says so when nothing got through", () => {
    expect(eventPopups({ ...HIT, hit: false, damage: 0 })).toEqual([
      { combatantId: "enemy-1", kind: "miss", text: "MISS" },
    ]);
  });
});

describe("abilities, heals, and escapes", () => {
  const cast: Extract<CombatEvent, { type: "ability-used" }> = {
    type: "ability-used",
    combatantId: "player",
    abilityId: "abl-stun-strike",
    targetId: "enemy-1",
    damage: 5,
    stunTurns: 1,
  };

  it("floats an ability's figure over whoever it landed on", () => {
    expect(eventPopups(cast, { target: { armor: 0, maxHp: 40 } })).toEqual([
      { combatantId: "enemy-1", kind: "damage", text: "-5" },
    ]);
  });

  it("shows no figure for a cast that deals none", () => {
    expect(eventPopups({ ...cast, damage: 0, targetId: "player" })).toEqual([]);
  });

  it("reads a heal as HP coming back", () => {
    expect(
      eventPopups({ type: "healed", combatantId: "player", amount: 8 }),
    ).toEqual([{ combatantId: "player", kind: "heal", text: "+8" }]);
  });

  it("marks a failed break for it, and stays quiet about a clean one", () => {
    expect(
      eventPopups({
        type: "flee-attempted",
        combatantId: "player",
        success: false,
      }),
    ).toEqual([{ combatantId: "player", kind: "miss", text: "NO ESCAPE" }]);
    expect(
      eventPopups({
        type: "flee-attempted",
        combatantId: "player",
        success: true,
      }),
    ).toEqual([]);
  });

  it("says nothing about the log's own bookkeeping", () => {
    const quiet: CombatEvent[] = [
      { type: "combat-started", encounterId: "enc-auric-scout" },
      { type: "round-started", round: 2 },
      { type: "turn-started", combatantId: "player" },
      { type: "stun-skipped", combatantId: "enemy-1" },
      { type: "moved", combatantId: "player", from: { x: 1, y: 1 }, to: { x: 2, y: 1 } },
      { type: "item-used", combatantId: "player", itemId: "itm-stim" },
      { type: "boosted", combatantId: "player", stat: "body", amount: 2, turns: 3 },
      { type: "defeated", combatantId: "enemy-1" },
      { type: "combat-ended", result: "victory" },
    ];
    for (const event of quiet) {
      expect(eventPopups(event), event.type).toEqual([]);
    }
  });
});

describe("condition changes", () => {
  it("announces a condition arriving and the same one lifting", () => {
    expect(
      statusPopups(sets([["enemy-1", []]]), sets([["enemy-1", ["stunned"]]])),
    ).toEqual([
      {
        combatantId: "enemy-1",
        kind: "status",
        text: statusPopupLabel("stunned", "gain"),
      },
    ]);
    expect(
      statusPopups(sets([["enemy-1", ["stunned"]]]), sets([["enemy-1", []]])),
    ).toEqual([
      {
        combatantId: "enemy-1",
        kind: "status-out",
        text: statusPopupLabel("stunned", "loss"),
      },
    ]);
  });

  it("says nothing while a condition simply stays true", () => {
    const held = sets([["enemy-1", ["guarded", "empowered"]]]);
    expect(statusPopups(held, held)).toEqual([]);
  });

  it("reports each family in one pass, gains before losses", () => {
    const popups = statusPopups(
      sets([["player", ["stunned", "guarded"]]]),
      sets([["player", ["guarded", "empowered"]]]),
    );
    expect(popups).toEqual([
      {
        combatantId: "player",
        kind: "status",
        text: statusPopupLabel("empowered", "gain"),
      },
      {
        combatantId: "player",
        kind: "status-out",
        text: statusPopupLabel("stunned", "loss"),
      },
    ]);
  });

  it("reports history as history: a body first seen announces nothing", () => {
    // A fight re-entered mid-battle opens with conditions already true.
    expect(statusPopups(sets([]), sets([["enemy-1", ["stunned"]]]))).toEqual([]);
  });

  it("covers every family both ways", () => {
    for (const family of STATUS_FAMILY_IDS) {
      const gained = statusPopups(
        sets([["enemy-1", []]]),
        sets([["enemy-1", [family]]]),
      );
      const lifted = statusPopups(
        sets([["enemy-1", [family]]]),
        sets([["enemy-1", []]]),
      );
      expect(gained[0]?.text, family).toBe(statusPopupLabel(family, "gain"));
      expect(lifted[0]?.text, family).toBe(statusPopupLabel(family, "loss"));
    }
  });
});
