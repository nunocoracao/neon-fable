import { beforeAll, describe, expect, it } from "vitest";
import {
  BALANCE_TARGETS,
  DIFFICULTY_ORDERING,
  OPTIONAL_SYSTEM_EDGE,
  encounterBalance,
  requireEncounterBalance,
} from "../../data/balance";
import { encounters, getEncounter } from "../../data/encounters";
import type { DifficultyId } from "../../data/difficulty";
import { staticBandRank, type StaticBand } from "../../data/static";
import { buildGame, buildStaticBand, coreBuilds, makeBuild } from "./builds";
import { SIM_POLICY_IDS } from "./policies";
import { aggregateTable, foldBy, section } from "./report";
import { aggregate, runSweep, type SweepCell } from "./sweep";

/**
 * The balance pass, as tests.
 *
 * Everything here runs the *real* combat engine — createCombat,
 * takeAction, runEnemyTurns — over the whole encounter roster, a matrix
 * of builds, and all three difficulty presets, and measures the result
 * against the targets written down in src/data/balance.ts.
 *
 * ## What the assertions are for
 *
 * They are a **curve guard**, not a spec. Every bound is deliberately
 * loose enough that an ordinary content edit — a weapon moved a point, an
 * enemy given four more frame — stays green, and tight enough that the
 * two failures that actually matter go red:
 *
 *  - a fight, or a build, that cannot win;
 *  - a fight that cannot be lost, or that never ends.
 *
 * If a future data change turns one of these red, the fix is usually the
 * data — read the printed tables, which say exactly which cell moved.
 *
 * ## Reproducibility
 *
 * Everything is seeded off SWEEP_SEED through `cellSeed`. The same seed
 * produces the same fights on every machine; changing it re-rolls the
 * whole table, which is a legitimate way to check that a result is not a
 * fluke of one seed.
 */

/** Change this to re-roll every fight in the sweep. */
const SWEEP_SEED = 20260803;

/** Fights per (encounter, build, preset, policy) cell. */
const REPEATS = 4;

const DIFFICULTIES: readonly DifficultyId[] = ["drift", "grind", "blackout"];

/** The whole table, computed once and read by every test below. */
let cells: SweepCell[] = [];

function grindCells(): SweepCell[] {
  return cells.filter((cell) => cell.difficulty === "grind");
}

/** Cells for one encounter at the middle preset, all builds, all hands. */
function cellsFor(encounterId: string): SweepCell[] {
  return grindCells().filter((cell) => cell.encounterId === encounterId);
}

beforeAll(() => {
  for (const entry of encounterBalance) {
    for (const policyId of SIM_POLICY_IDS) {
      cells.push(
        ...runSweep({
          encounterIds: [entry.encounterId],
          // At-level, always: the targets only promise something about a
          // build meeting the fight at the point in the run it was
          // written for.
          builds: coreBuilds(entry.tier),
          difficulties: DIFFICULTIES,
          policyId,
          repeats: REPEATS,
          baseSeed: SWEEP_SEED,
        }).cells,
      );
    }
  }
});

describe("the encounter roster is fully tiered", () => {
  it("has a balance entry for every authored encounter", () => {
    const tiered = new Set(encounterBalance.map((entry) => entry.encounterId));
    const missing = encounters
      .map((encounter) => encounter.id)
      .filter((id) => !tiered.has(id));
    expect(missing, "encounters with no entry in src/data/balance.ts").toEqual(
      [],
    );
  });

  it("names only real encounters", () => {
    const unknown = encounterBalance
      .map((entry) => entry.encounterId)
      .filter((id) => getEncounter(id) === undefined);
    expect(unknown).toEqual([]);
  });

  it("marks exactly the authored set pieces as bosses", () => {
    for (const entry of encounterBalance) {
      const encounter = getEncounter(entry.encounterId)!;
      expect(entry.class === "boss", entry.encounterId).toBe(
        encounter.boss === true,
      );
    }
  });
});

describe("the sweep is reproducible", () => {
  it("plays the same fights twice from the same seed", () => {
    const spec = {
      encounterIds: ["enc-pump-gate"],
      builds: coreBuilds("opening").slice(0, 2),
      difficulties: ["grind"] as const,
      policyId: "aggressive" as const,
      repeats: 3,
      baseSeed: SWEEP_SEED,
    };
    const first = runSweep({ ...spec, difficulties: ["grind"] });
    const second = runSweep({ ...spec, difficulties: ["grind"] });
    expect(second.cells).toEqual(first.cells);
  });

  it("plays different fights from a different seed", () => {
    const spec = {
      encounterIds: ["enc-exec-warden"],
      builds: coreBuilds("late").slice(0, 3),
      difficulties: ["grind"] as const,
      policyId: "aggressive" as const,
      repeats: 6,
      baseSeed: SWEEP_SEED,
    };
    const same = runSweep(spec).cells.map((cell) => cell.meanRounds);
    const other = runSweep({ ...spec, baseSeed: SWEEP_SEED + 1 }).cells.map(
      (cell) => cell.meanRounds,
    );
    expect(other).not.toEqual(same);
  });
});

describe("every fight lands inside its target band", () => {
  it("is winnable at-level on the middle preset", () => {
    for (const entry of encounterBalance) {
      const target = BALANCE_TARGETS[entry.class];
      const stats = aggregate(cellsFor(entry.encounterId));
      expect(stats.battles).toBeGreaterThan(0);
      expect(
        stats.winRate,
        `${entry.encounterId} (${entry.class}) win rate`,
      ).toBeGreaterThanOrEqual(target.minWinRate);
      expect(
        stats.winRate,
        `${entry.encounterId} (${entry.class}) win rate`,
      ).toBeLessThanOrEqual(target.maxWinRate);
    }
  });

  it("costs a set piece's worth of frame to win a set piece", () => {
    for (const entry of encounterBalance) {
      const target = BALANCE_TARGETS[entry.class];
      const stats = aggregate(cellsFor(entry.encounterId));
      expect(
        stats.meanHealthLeft,
        `${entry.encounterId} health left after a win`,
      ).toBeLessThanOrEqual(target.maxHealthLeft);
    }
  });

  it("runs inside the stated turn envelope", () => {
    for (const entry of encounterBalance) {
      const target = BALANCE_TARGETS[entry.class];
      const stats = aggregate(cellsFor(entry.encounterId));
      expect(
        stats.meanRounds,
        `${entry.encounterId} mean rounds`,
      ).toBeGreaterThanOrEqual(target.minRounds);
      expect(
        stats.meanRounds,
        `${entry.encounterId} mean rounds`,
      ).toBeLessThanOrEqual(target.maxRounds);
    }
  });

  it("never runs a fight into the ceiling", () => {
    // A stall is two bodies that cannot finish each other. It is always
    // a bug — in the data or in the engine — never a hard fight.
    const stalled = cells.filter((cell) => cell.stalls > 0);
    expect(
      stalled.map(
        (cell) => `${cell.encounterId} × ${cell.buildId} @ ${cell.difficulty}`,
      ),
    ).toEqual([]);
  });
});

describe("no build is hard-gated out", () => {
  it("gives every at-level build a real shot at every fight", () => {
    const failures: string[] = [];
    for (const entry of encounterBalance) {
      const target = BALANCE_TARGETS[entry.class];
      // Pooled across the three hands: the promise is that the build can
      // be played to a win, not that every way of playing it wins.
      for (const row of foldBy(
        cellsFor(entry.encounterId),
        (cell) => cell.buildId,
      )) {
        if (row.stats.winRate < target.minBuildWinRate) {
          failures.push(
            `${entry.encounterId} × ${row.label}: ` +
              `${(row.stats.winRate * 100).toFixed(0)}%`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("leaves no background stranded", () => {
    for (const background of ["gutter-courier", "tower-analyst", "grid-diver"]) {
      const stats = aggregate(
        grindCells().filter((cell) => cell.buildId.startsWith(`${background}/`)),
      );
      expect(stats.winRate, background).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("leaves no way of playing stranded", () => {
    for (const policyId of SIM_POLICY_IDS) {
      const stats = aggregate(
        grindCells().filter((cell) => cell.policyId === policyId),
      );
      expect(stats.winRate, policyId).toBeGreaterThanOrEqual(0.75);
    }
  });
});

describe("the presets mean what they say", () => {
  it("makes Drift no harder than Grind and Blackout no kinder", () => {
    const rate = (difficulty: DifficultyId): number =>
      aggregate(cells.filter((cell) => cell.difficulty === difficulty)).winRate;
    const grind = rate("grind");
    expect(rate("drift")).toBeGreaterThanOrEqual(
      grind - DIFFICULTY_ORDERING.driftSlack,
    );
    expect(rate("blackout")).toBeLessThanOrEqual(
      grind + DIFFICULTY_ORDERING.blackoutSlack,
    );
  });

  it("actually separates the three of them", () => {
    const rate = (difficulty: DifficultyId): number =>
      aggregate(cells.filter((cell) => cell.difficulty === difficulty)).winRate;
    // A preset nobody can feel is a preset that should not exist.
    expect(rate("drift") - rate("blackout")).toBeGreaterThan(0.03);
  });
});

/* --- Variant sweeps: what the optional systems are worth --------------- */

/**
 * Mods, perks and stims measured the only honest way: the same build
 * with them and without them, over the fights it would actually be
 * carrying them into. Everything else — the weapon, the coat, the
 * implants, the patches — is identical on both sides, so the gap is
 * these three systems and nothing else.
 */
function optionalSystemsSweep(): { kitted: number; bare: number } {
  const encounterIds = encounterBalance
    .filter((entry) => entry.tier === "late")
    .map((entry) => entry.encounterId);
  const measure = (stripped: boolean): number => {
    const builds = ["gutter-courier", "tower-analyst", "grid-diver"].flatMap(
      (backgroundId) =>
        (["low", "mid", "high"] as const).map((spread) =>
          makeBuild({
            backgroundId,
            spread,
            tier: "late",
            chrome: "heavy",
            companion: null,
            stripped,
          }),
        ),
    );
    return aggregate(
      SIM_POLICY_IDS.flatMap(
        (policyId) =>
          runSweep({
            encounterIds,
            builds,
            difficulties: ["grind"],
            policyId,
            repeats: REPEATS,
            baseSeed: SWEEP_SEED,
          }).cells,
      ),
    ).winRate;
  };
  return { kitted: measure(false), bare: measure(true) };
}

describe("the optional systems are worth something, and only something", () => {
  it("shows mods, perks and stims in the outcomes without requiring them", () => {
    const { kitted, bare } = optionalSystemsSweep();
    const edge = kitted - bare;
    expect(edge, "kitted minus bare win rate").toBeGreaterThanOrEqual(
      OPTIONAL_SYSTEM_EDGE.minEdge,
    );
    expect(edge, "kitted minus bare win rate").toBeLessThanOrEqual(
      OPTIONAL_SYSTEM_EDGE.maxEdge,
    );
    // And the bare build still finishes the campaign: never mandatory.
    expect(bare, "bare build win rate").toBeGreaterThanOrEqual(0.5);
  });
});

/**
 * The Static bands, on the one frame with capacity to reach the top of
 * the ladder. What is being measured is the *cost of the noise* — the
 * initiative shift and the surge — not the stat mods the implants also
 * carry, which is why all three cells share an allocation.
 */
function staticSweep(): { band: StaticBand; winRate: number; rounds: number }[] {
  const encounterIds = encounterBalance
    .filter((entry) => entry.tier === "late")
    .map((entry) => entry.encounterId);
  return (["none", "light", "heavy"] as const).map((chrome) => {
    const build = makeBuild({
      backgroundId: "gutter-courier",
      spread: "mid",
      tier: "late",
      chrome,
      companion: null,
      chromedFrame: true,
    });
    const stats = aggregate(
      SIM_POLICY_IDS.flatMap(
        (policyId) =>
          runSweep({
            encounterIds,
            builds: [build],
            difficulties: ["grind"],
            policyId,
            repeats: REPEATS,
            baseSeed: SWEEP_SEED,
          }).cells,
      ),
    );
    return {
      band: buildStaticBand(build),
      winRate: stats.winRate,
      rounds: stats.meanRounds,
    };
  });
}

describe("Static is a trade, not a wall", () => {
  it("reaches the top band and still wins with it", () => {
    const rows = staticSweep();
    // More hardware is never quieter, and the top of the ladder is
    // actually reachable on a frame built to carry it. The middle rung
    // is deliberately not pinned: one cheap implant reads clear, and
    // which band a given install list lands in is content's call.
    const ranks = rows.map((row) => staticBandRank(row.band));
    expect(ranks[0]).toBeLessThanOrEqual(ranks[1]!);
    expect(ranks[1]).toBeLessThan(ranks[2]!);
    expect(rows[2]!.band).toBe("screaming");
    const screaming = rows[2]!;
    // The noise costs a place in the order and one turn a fight. It is
    // allowed to hurt; it is not allowed to be unplayable.
    expect(screaming.winRate, "screaming band win rate").toBeGreaterThanOrEqual(
      0.5,
    );
  });
});

/* --- The artifact ------------------------------------------------------ */

describe("the sweep report", () => {
  it("prints the table", () => {
    const grind = grindCells();
    const label = (cell: SweepCell): string =>
      `${cell.encounterId} [${requireEncounterBalance(cell.encounterId).class[0]}]`;
    const lines = [
      section(
        `Combat balance sweep — seed ${SWEEP_SEED}, ${REPEATS} fights/cell, ` +
          `${cells.length} cells, ${aggregate(cells).battles} battles`,
        aggregateTable(foldBy(grind, label), "encounter (grind)"),
      ),
      section(
        "By build (grind, all encounters at that build's tier)",
        aggregateTable(foldBy(grind, (cell) => cell.buildId), "build"),
      ),
      section(
        "By hand (grind)",
        aggregateTable(foldBy(grind, (cell) => cell.policyId), "policy"),
      ),
      section(
        "By preset (all encounters)",
        aggregateTable(foldBy(cells, (cell) => cell.difficulty), "preset"),
      ),
      section(
        "Static band (late tier, chrome-frame build, solo)",
        staticSweep()
          .map(
            (row) =>
              `${row.band.padEnd(10)} win ${(row.winRate * 100).toFixed(0).padStart(3)}%  ` +
              `rounds ${row.rounds.toFixed(1)}`,
          )
          .join("\n"),
      ),
      section(
        "Optional systems (late tier, solo; same gear and chrome either way)",
        (() => {
          const { kitted, bare } = optionalSystemsSweep();
          return (
            `kitted (fitted parts, perks, stims)  ${(kitted * 100).toFixed(0)}%\n` +
            `bare   (none of the three)           ${(bare * 100).toFixed(0)}%\n` +
            `edge                                 ${((kitted - bare) * 100).toFixed(0)} points`
          );
        })(),
      ),
    ];
    console.log(lines.join(""));
    expect(cells.length).toBeGreaterThan(0);
  });
});

describe("a build is a run the player could have had", () => {
  it("dresses every core build out of real content", () => {
    for (const build of [
      ...coreBuilds("opening"),
      ...coreBuilds("mid"),
      ...coreBuilds("late"),
    ]) {
      const game = buildGame(build, "grind", 1);
      expect(game.player.equipment.weapon, build.id).not.toBeNull();
      expect(game.player.hp, build.id).toBe(game.player.derived.maxHp);
      expect(
        game.party.members.length,
        build.id,
      ).toBe(build.companion ? 1 : 0);
      // Serializable like any other run: a sweep that could not be saved
      // would not be measuring the game.
      expect(JSON.parse(JSON.stringify(game))).toEqual(game);
    }
  });
});
