import { describe, expect, it } from "vitest";
import { baseStats } from "../character/stats";
import { fixtureCharacter } from "../character/testSupport";
import { LORE_SHARDS, requireShard } from "../data/lore";
import { requireMap } from "../data/maps";
import { adjustReputation, createNewGame, type GameState } from "../state";
import { emptyLore, type LoreState } from "../state/lore";
import { mapShards, placeShards, shardInteractable, shardOpens } from "./shards";

/**
 * The shard layer: which chips are lying on a district, and whether the
 * character standing over one can read it. Both are pure joins over
 * content — placement takes a map and a collection, the gate takes a
 * GameState and runs the engine's own requirement check.
 */

function lore(...collected: string[]): LoreState {
  return { collected };
}

function state(overrides: Partial<GameState> = {}): GameState {
  return { ...createNewGame({ character: fixtureCharacter({}), seed: 4 }), ...overrides };
}

describe("mapShards", () => {
  it("lists a district's own chips and nothing else", () => {
    expect(mapShards("greywater-steps").map((shard) => shard.id)).toEqual([
      "shard-roll-call",
      "shard-last-shift",
    ]);
    expect(mapShards("rustyard-arena")).toEqual([]);
    expect(mapShards("nowhere")).toEqual([]);
  });
});

describe("shardInteractable", () => {
  it("is a shard-sprited pickup, never a way out and never a pip", () => {
    const thing = shardInteractable(requireShard("shard-tide-tables"));
    expect(thing).toEqual({
      id: "shard-tide-tables",
      x: 1,
      y: 6,
      label: "Memory shard",
      spriteId: "shard",
      interaction: { kind: "lore", shardId: "shard-tide-tables" },
      minimap: false,
    });
    expect(thing.exit).toBeUndefined();
  });
});

describe("placeShards", () => {
  const steps = requireMap("greywater-steps");

  it("drops every uncollected chip onto the map, after everyone already on it", () => {
    const placed = placeShards(steps, emptyLore());
    expect(placed.interactables.slice(0, steps.interactables.length)).toEqual(
      steps.interactables,
    );
    expect(
      placed.interactables.slice(steps.interactables.length).map((i) => i.id),
    ).toEqual(["shard-roll-call", "shard-last-shift"]);
    // Everything else about the district is the authored district.
    expect(placed.tiles).toBe(steps.tiles);
    expect(placed.props).toBe(steps.props);
  });

  it("leaves a collected chip off the map — a pickup is a pickup", () => {
    const placed = placeShards(steps, lore("shard-roll-call"));
    expect(placed.interactables.map((i) => i.id)).not.toContain("shard-roll-call");
    expect(placed.interactables.map((i) => i.id)).toContain("shard-last-shift");
  });

  it("hands the map straight back once there is nothing to add", () => {
    // Identity, so the scene keeps the same object between mounts.
    expect(placeShards(steps, lore("shard-roll-call", "shard-last-shift"))).toBe(
      steps,
    );
    expect(placeShards(requireMap("rustyard-arena"), emptyLore())).toBe(
      requireMap("rustyard-arena"),
    );
  });

  it("never shadows somebody already standing there", () => {
    // A chip that collided with an interactable would take its place for
    // picking, focus, and the minimap alike. Content cannot do that
    // (lore.test.ts fails on it); this pins the runtime behaviour.
    const occupied = {
      ...steps,
      interactables: [
        ...steps.interactables,
        {
          ...shardInteractable(requireShard("shard-roll-call")),
          id: "somebody-else",
          spriteId: "npc" as const,
          interaction: { kind: "dialogue" as const, nodeId: "gs-ferrow" },
        },
      ],
    };
    const placed = placeShards(occupied, emptyLore());
    expect(placed.interactables.map((i) => i.id)).not.toContain("shard-roll-call");
    expect(placed.interactables.filter((i) => i.id === "somebody-else")).toHaveLength(
      1,
    );
  });
});

describe("shardOpens", () => {
  it("opens an ungated chip for anybody who finds it", () => {
    const fresh = state();
    for (const shard of LORE_SHARDS) {
      if (shard.requirements) continue;
      expect(shardOpens(fresh, shard), shard.id).toBe(true);
    }
  });

  it("keeps the corp index shut until the character can crack it", () => {
    const shard = requireShard("shard-cordon-precedent");
    expect(shardOpens(state(), shard)).toBe(false);
    const allocation = baseStats();
    allocation.tech += 5;
    allocation.body += 5;
    allocation.reflexes += 5;
    const techie = state({
      player: fixtureCharacter({ allocation }),
    });
    expect(techie.player.stats.tech).toBeGreaterThanOrEqual(8);
    expect(shardOpens(techie, shard)).toBe(true);
  });

  it("keeps the double-printed minutes shut until the eyes are replaced", () => {
    const shard = requireShard("shard-charter-minutes");
    const bare = state();
    expect(shardOpens(bare, shard)).toBe(false);
    const wired: GameState = {
      ...bare,
      player: {
        ...bare.player,
        equipment: {
          ...bare.player.equipment,
          enhancements: {
            ...bare.player.equipment.enhancements,
            eyes: "cyb-optic-suite",
          },
        },
      },
    };
    expect(shardOpens(wired, shard)).toBe(true);
  });

  it("keeps the Choir's last file with the Court until the Court trusts you", () => {
    const shard = requireShard("shard-last-shift");
    const stranger = state();
    expect(shardOpens(stranger, shard)).toBe(false);
    const known: GameState = {
      ...stranger,
      reputation: adjustReputation(stranger.reputation, "court", 55),
    };
    // Warm is not trusted — the band is the gate, not the number.
    expect(shardOpens(known, shard)).toBe(false);
    expect(
      shardOpens(
        { ...stranger, reputation: adjustReputation(stranger.reputation, "court", 80) },
        shard,
      ),
    ).toBe(true);
  });
});
