import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { LORE_SHARDS } from "../data/lore";
import {
  GAME_STATE_VERSION,
  createNewGame,
  migrateGameState,
  type GameState,
} from "./gameState";
import {
  clampLore,
  collectShard,
  collectedCount,
  collectedShards,
  emptyLore,
  hasShard,
} from "./lore";
import {
  deriveLoreCodex,
  emptyMetaProgress,
  loadMetaProgress,
  mergeMetaProgress,
  parseMetaProgress,
  recordShard,
  recordShardToStorage,
  serializeMetaProgress,
} from "./meta";
import { createMemoryStorage, loadGame, saveGame } from "./save";

/**
 * The two halves of a shard collection: the run's own, which saves and
 * loads with the character, and the ever-found record, which outlives
 * every run. Plus the codex derivation that reads both at once.
 */

function state(): GameState {
  return createNewGame({ character: fixtureCharacter({}), seed: 7 });
}

describe("a run's shard collection", () => {
  it("starts empty on a fresh character", () => {
    expect(state().lore).toEqual({ collected: [] });
    expect(collectedCount(emptyLore())).toBe(0);
  });

  it("files a shard in pickup order and never twice", () => {
    let run = state();
    run = collectShard(run, "shard-roll-call");
    run = collectShard(run, "shard-tide-tables");
    expect(collectedShards(run)).toEqual(["shard-roll-call", "shard-tide-tables"]);
    expect(hasShard(run.lore, "shard-roll-call")).toBe(true);
    expect(hasShard(run.lore, "shard-last-shift")).toBe(false);
    // Idempotent, and identical enough to skip an autosave churn.
    expect(collectShard(run, "shard-roll-call")).toBe(run);
    expect(collectedCount(run.lore)).toBe(2);
  });

  it("survives a save/load round-trip intact", () => {
    const storage = createMemoryStorage();
    const run = collectShard(collectShard(state(), "shard-roll-call"), "shard-salvage-rights");
    saveGame(run, "slot1", storage);
    const loaded = loadGame("slot1", storage);
    expect(loaded.lore).toEqual({
      collected: ["shard-roll-call", "shard-salvage-rights"],
    });
    // And the rest of the run came back with it.
    expect(loaded.version).toBe(GAME_STATE_VERSION);
    expect(loaded.player.name).toBe(run.player.name);
  });

  it("gives a save from before the shards an empty collection", () => {
    // A v9 save is a run mid-story: it loads with every shard still out
    // there to find rather than failing on a missing field.
    const old = { ...state(), version: 9 } as GameState;
    delete (old as Partial<GameState>).lore;
    const migrated = migrateGameState(old, 9);
    expect(migrated.lore).toEqual({ collected: [] });
    expect(migrated.version).toBe(GAME_STATE_VERSION);
  });

  it("coerces a malformed collection rather than counting nonsense", () => {
    expect(clampLore(undefined)).toEqual({ collected: [] });
    expect(clampLore({ collected: "shard-roll-call" })).toEqual({ collected: [] });
    expect(
      clampLore({ collected: ["shard-roll-call", 7, "", "shard-roll-call"] }),
    ).toEqual({ collected: ["shard-roll-call"] });
  });
});

describe("mirroring shards into meta-progress", () => {
  it("records a shard once, and leaves the rest of the record alone", () => {
    const base = { ...emptyMetaProgress(), completions: 2, ngPlusUnlocked: true };
    const once = recordShard(base, "shard-roll-call");
    expect(once.shardsSeen).toEqual(["shard-roll-call"]);
    expect(once.completions).toBe(2);
    expect(recordShard(once, "shard-roll-call")).toBe(once);
    expect(recordShard(once, "shard-votive-wiring").shardsSeen).toEqual([
      "shard-roll-call",
      "shard-votive-wiring",
    ]);
  });

  it("persists through storage, mid-run, without a completion", () => {
    const storage = createMemoryStorage();
    recordShardToStorage("shard-roll-call", storage);
    recordShardToStorage("shard-grey-boards", storage);
    const meta = loadMetaProgress(storage);
    expect(meta.shardsSeen).toEqual(["shard-roll-call", "shard-grey-boards"]);
    // Nothing else was claimed by picking a chip up off the floor.
    expect(meta.completions).toBe(0);
    expect(meta.ngPlusUnlocked).toBe(false);
  });

  it("round-trips through serialize/parse and unions across records", () => {
    const meta = recordShard(emptyMetaProgress(), "shard-roll-call");
    expect(parseMetaProgress(serializeMetaProgress(meta)).shardsSeen).toEqual([
      "shard-roll-call",
    ]);
    const other = recordShard(emptyMetaProgress(), "shard-tide-tables");
    expect(mergeMetaProgress(meta, other).shardsSeen).toEqual([
      "shard-roll-call",
      "shard-tide-tables",
    ]);
    // A record written before shards existed reads as none found.
    expect(
      parseMetaProgress(JSON.stringify({ version: 1, completions: 1 })).shardsSeen,
    ).toEqual([]);
  });
});

describe("deriveLoreCodex", () => {
  const all = LORE_SHARDS.map((shard) => shard.id);

  it("locks every slot to its district before anything is found", () => {
    const view = deriveLoreCodex(LORE_SHARDS, emptyLore(), emptyMetaProgress());
    expect(view.total).toBe(LORE_SHARDS.length);
    expect(view.collected).toBe(0);
    expect(view.discovered).toBe(0);
    expect(view.complete).toBe(false);
    for (const entry of view.entries) {
      expect(entry.discovered, entry.id).toBe(false);
      expect(entry.title, entry.id).toBeNull();
      expect(entry.paragraphs, entry.id).toEqual([]);
      // The district is the one thing a locked slot still says.
      expect(entry.district.length).toBeGreaterThan(0);
    }
    expect(view.entries.map((entry) => entry.index)).toEqual(
      LORE_SHARDS.map((shard) => shard.index),
    );
  });

  it("unlocks a shard's title and text once it has ever been found", () => {
    const meta = recordShard(emptyMetaProgress(), "shard-roll-call");
    const view = deriveLoreCodex(LORE_SHARDS, emptyLore(), meta);
    const entry = view.entries.find((e) => e.id === "shard-roll-call");
    expect(entry?.discovered).toBe(true);
    expect(entry?.title).toBe("Roll Call, Ledge Nine");
    expect(entry?.paragraphs.length).toBeGreaterThan(0);
    // Found on an earlier run: readable, but not in this run's hands.
    expect(entry?.collected).toBe(false);
    expect(view.discovered).toBe(1);
    expect(view.collected).toBe(0);
  });

  it("counts this run and ever separately, and both at once", () => {
    const meta = recordShard(emptyMetaProgress(), "shard-roll-call");
    const view = deriveLoreCodex(
      LORE_SHARDS,
      { collected: ["shard-tide-tables"] },
      meta,
    );
    expect(view.collected).toBe(1);
    expect(view.discovered).toBe(2);
    expect(
      view.entries.filter((entry) => entry.collected).map((entry) => entry.id),
    ).toEqual(["shard-tide-tables"]);
  });

  it("reads a shard in hand even if the mirror never landed", () => {
    // A storage write that failed must not make a chip the player is
    // carrying unreadable.
    const view = deriveLoreCodex(
      LORE_SHARDS,
      { collected: ["shard-tide-tables"] },
      emptyMetaProgress(),
    );
    const entry = view.entries.find((e) => e.id === "shard-tide-tables");
    expect(entry?.discovered).toBe(true);
    expect(entry?.title).not.toBeNull();
  });

  it("shows the ever-found half alone when there is no run to read", () => {
    const meta = recordShard(emptyMetaProgress(), "shard-roll-call");
    const view = deriveLoreCodex(LORE_SHARDS, null, meta);
    expect(view.collected).toBe(0);
    expect(view.discovered).toBe(1);
  });

  it("calls the set complete only once every shard has been found", () => {
    const meta = all
      .slice(0, -1)
      .reduce((record, id) => recordShard(record, id), emptyMetaProgress());
    expect(deriveLoreCodex(LORE_SHARDS, emptyLore(), meta).complete).toBe(false);
    const whole = recordShard(meta, all[all.length - 1] ?? "");
    const view = deriveLoreCodex(LORE_SHARDS, emptyLore(), whole);
    expect(view.complete).toBe(true);
    expect(view.discovered).toBe(view.total);
  });

  it("ignores a recorded id whose shard no longer exists", () => {
    const meta = recordShard(emptyMetaProgress(), "shard-retired");
    const view = deriveLoreCodex(LORE_SHARDS, emptyLore(), meta);
    expect(view.discovered).toBe(0);
    expect(view.entries).toHaveLength(LORE_SHARDS.length);
  });
});
