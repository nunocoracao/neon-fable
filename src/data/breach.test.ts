import { describe, expect, it } from "vitest";
import { generateLattice } from "../minigames/breach";
import {
  BREACH_CONTEXTS,
  BREACH_DIFFICULTIES,
  breachContextsOnMap,
  breachDifficulty,
  breachFlag,
  getBreachContext,
  requireBreachContext,
} from "./breach";
import { encounters, liveSpawns } from "./encounters";
import { getItem } from "./items";
import { getShard } from "./lore";
import { dressMap, mapDressings } from "./mapDressing";
import { maps, requireMap } from "./maps";
import { findArcByNode } from "./story";

/**
 * Breach content: the terminals across the districts and what is in
 * them. The rules and the arithmetic are pinned in
 * ../minigames/*.test.ts — including that every context here is
 * solvable at the worst stat line the game can produce. What is
 * asserted here is that the content is *wired*: each terminal stands
 * where it says it does, each payout resolves, and every flag a breach
 * writes is read by something.
 */

const contexts = BREACH_CONTEXTS.map((context) => [context.id, context] as const);

/** Every flag any breach reward writes, with the context that writes it. */
const writtenFlags = BREACH_CONTEXTS.flatMap((context) =>
  (context.rewards.effects ?? []).flatMap((effect) =>
    effect.type === "set-flag" ? [{ context, key: effect.key }] : [],
  ),
);

describe("breach difficulties", () => {
  it.each(BREACH_DIFFICULTIES.map((entry) => [entry.id, entry] as const))(
    "%s describes a grid worth routing",
    (id, difficulty) => {
      expect(breachDifficulty(id)).toBe(difficulty);
      const { lattice, slack } = difficulty;
      expect(lattice.width).toBeGreaterThanOrEqual(4);
      // An odd height puts the entry and the core on the same row.
      expect(lattice.height % 2).toBe(1);
      // Room for error, but never so much that the route is free.
      expect(slack).toBeGreaterThan(0);
      expect(slack).toBeLessThan(lattice.width * lattice.height);
      // Corruption has to leave a grid rather than a corridor: the
      // corridor itself is never seeded, so what matters is that the
      // cells off it are not all spent.
      const cells = lattice.width * lattice.height;
      expect(lattice.traces + lattice.deads).toBeLessThan(cells / 2);
      expect(lattice.traceCost[0]).toBeGreaterThan(0);
      expect(lattice.traceCost[0]).toBeLessThanOrEqual(lattice.traceCost[1]);
      expect(lattice.value[0]).toBeGreaterThan(0);
      expect(lattice.value[0]).toBeLessThanOrEqual(lattice.value[1]);
    },
  );

  it("gets harder in one direction: more grid, more teeth, less room", () => {
    const order = BREACH_DIFFICULTIES.map((entry) => entry.id);
    expect(order).toEqual(["probe", "guarded", "hardened"]);
    for (let i = 1; i < BREACH_DIFFICULTIES.length; i++) {
      const easier = BREACH_DIFFICULTIES[i - 1]!;
      const harder = BREACH_DIFFICULTIES[i]!;
      expect(harder.lattice.width, harder.id).toBeGreaterThan(
        easier.lattice.width,
      );
      expect(harder.lattice.traces, harder.id).toBeGreaterThan(
        easier.lattice.traces,
      );
      expect(harder.slack, harder.id).toBeLessThan(easier.slack);
    }
  });

  it("generates a grid for every difficulty", () => {
    for (const difficulty of BREACH_DIFFICULTIES) {
      const lattice = generateLattice(difficulty.lattice, 1234);
      expect(lattice.nodes).toHaveLength(
        difficulty.lattice.width * difficulty.lattice.height,
      );
    }
  });
});

describe("breach terminals", () => {
  it("places at least four, spread across the districts", () => {
    expect(BREACH_CONTEXTS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(BREACH_CONTEXTS.map((c) => c.id)).size).toBe(
      BREACH_CONTEXTS.length,
    );
    // One in each of the two new districts, one on the boss's own
    // floor, and one on the Act 2 utility floor — no district carries
    // two, so no run can farm one map.
    expect(BREACH_CONTEXTS.map((c) => c.mapId).sort()).toEqual([
      "auric-executive",
      "exchange-ventworks",
      "flooded-quays",
      "vertical-market",
    ]);
    for (const map of maps) {
      expect(breachContextsOnMap(map.id).length, map.id).toBeLessThanOrEqual(1);
    }
  });

  it("uses every difficulty the game defines", () => {
    const used = new Set(BREACH_CONTEXTS.map((c) => c.difficulty));
    for (const difficulty of BREACH_DIFFICULTIES) {
      expect([...used], `nothing is ${difficulty.id}`).toContain(difficulty.id);
    }
  });

  it.each(contexts)("%s stands on the map it names", (_id, context) => {
    const map = requireMap(context.mapId);
    const terminals = map.interactables.filter(
      (thing) =>
        thing.interaction.kind === "breach" &&
        thing.interaction.contextId === context.id,
    );
    expect(terminals, `${context.id} has no terminal`).toHaveLength(1);
    // A terminal is a terminal: the sprite says so, and the minimap
    // marks it like every other key object.
    expect(terminals[0]?.spriteId).toBe("terminal");
    expect(getBreachContext(context.id)).toBe(context);
    expect(requireBreachContext(context.id)).toBe(context);
  });

  it.each(contexts)("%s says what it is and what is in it", (_id, context) => {
    for (const [field, text] of [
      ["name", context.name],
      ["brief", context.brief],
      ["prize", context.prize],
      ["spent", context.spent],
    ] as const) {
      expect(text.length, `${context.id}.${field}`).toBeGreaterThan(0);
    }
    // A run has to be worth taking: every terminal pays something the
    // route itself does not.
    const rewards = context.rewards;
    expect(
      (rewards.effects ?? []).length > 0 || rewards.shardId !== undefined,
      `${context.id} pays nothing`,
    ).toBe(true);
  });

  it.each(contexts)("%s pays out in real content", (_id, context) => {
    for (const effect of context.rewards.effects ?? []) {
      if (effect.type === "add-item" || effect.type === "remove-item") {
        expect(getItem(effect.itemId), effect.itemId).toBeDefined();
      }
      if (effect.type === "set-flag") {
        expect(effect.key.length).toBeGreaterThan(0);
      }
      // A breach is a terminal, not a scene: it cannot start a fight,
      // move the player, or open another screen.
      expect(
        ["set-flag", "increment-flag", "add-item", "remove-item", "credits"],
        `${context.id} applies ${effect.type}`,
      ).toContain(effect.type);
    }
    if (context.rewards.shardId !== undefined) {
      expect(getShard(context.rewards.shardId), context.rewards.shardId)
        .toBeDefined();
    }
  });

  it("records each terminal under its own flag, namespaced", () => {
    const flags = BREACH_CONTEXTS.map((context) => breachFlag(context.id));
    expect(new Set(flags).size).toBe(flags.length);
    for (const flag of flags) expect(flag.startsWith("breach:")).toBe(true);
    // And no reward writes a terminal's own record — that is the
    // settlement's job, and a context that wrote it would pay itself
    // out and then find the door already shut.
    for (const { key } of writtenFlags) {
      expect(flags, `reward writes ${key}`).not.toContain(key);
    }
  });
});

/**
 * The half that makes a breach worth running: every flag one writes has
 * to be read by something. A reward nobody reads is a payout that does
 * not exist, and it is invisible from inside this file.
 */
describe("what a breached terminal changes", () => {
  it("writes no flag nothing reads", () => {
    const dressingFlags = new Set(mapDressings.map((d) => d.when.key));
    const spawnFlags = new Set(
      encounters.flatMap((encounter) =>
        encounter.enemies.flatMap((spawn) =>
          spawn.absentWhenFlag === undefined ? [] : [spawn.absentWhenFlag],
        ),
      ),
    );
    for (const { context, key } of writtenFlags) {
      // "Read" means one of: it re-points a fixture, it stands a body
      // down before a fight, or it is a plain record the codex-facing
      // content can gate on later. The first two are what this release
      // ships; a record is allowed but has to be declared as one.
      const read = dressingFlags.has(key) || spawnFlags.has(key);
      const record = key.endsWith("-read");
      expect(read || record, `${context.id} writes unread flag "${key}"`).toBe(
        true,
      );
    }
  });

  it("opens the market's consignment locker with a third key", () => {
    const market = requireMap("vertical-market");
    const cut = dressMap(market, { "market-hasp-cut": true });
    const locker = cut.interactables.find((i) => i.id === "market-consignment");
    expect(locker?.interaction).toEqual({
      kind: "dialogue",
      nodeId: "bz-market-locker",
    });
    expect(findArcByNode("bz-market-locker")?.id).toBe("breach");
    // And the authored keys are untouched: an unbreached run still
    // meets the locker exactly as it always was.
    expect(
      market.interactables.find((i) => i.id === "market-consignment")
        ?.interaction,
    ).toEqual({ kind: "dialogue", nodeId: "vm-stash" });
  });

  it("walks the quays' salvage cage up on the hoist", () => {
    const quays = requireMap("flooded-quays");
    const cut = dressMap(quays, { "quays-hoist-cut": true });
    const cage = cut.interactables.find((i) => i.id === "quays-cage");
    expect(cage?.interaction).toEqual({
      kind: "dialogue",
      nodeId: "bz-quays-cage",
    });
    expect(findArcByNode("bz-quays-cage")?.id).toBe("breach");
    expect(
      quays.interactables.find((i) => i.id === "quays-cage")?.interaction,
    ).toEqual({ kind: "dialogue", nodeId: "fq-cage" });
  });

  it("takes the executive floor's drone off the muster roster", () => {
    const fight = encounters.find((e) => e.id === "enc-exec-security");
    if (!fight) throw new Error("no exec-security encounter");
    const lit = liveSpawns(fight, {});
    const dark = liveSpawns(fight, { "exec-muster-dark": true });
    expect(lit.map((s) => s.spawn.enemyId)).toContain("nme-static-drone");
    expect(dark.map((s) => s.spawn.enemyId)).not.toContain("nme-static-drone");
    expect(dark).toHaveLength(lit.length - 1);
    // The bodies that do turn up keep their authored slots, so the
    // fight staffs itself with the same faces either way.
    expect(dark.map((s) => s.slot)).toEqual([0, 1]);
    // The fight is still a fight — never emptied by an advantage.
    expect(dark.length).toBeGreaterThan(0);
  });

  it("pulls the Cordon precedent out of the Ventworks archive", () => {
    const archive = requireBreachContext("vent-archive");
    const shard = getShard(archive.rewards.shardId ?? "");
    expect(shard).toBeDefined();
    // The same chip still lies on the same floor for anybody with the
    // Tech to read it where it lies — the breach is a second way in,
    // never the only one.
    expect(shard?.mapId).toBe(archive.mapId);
    expect(shard?.requirements?.length).toBeGreaterThan(0);
  });
});
