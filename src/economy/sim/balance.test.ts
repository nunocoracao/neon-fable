import { beforeAll, describe, expect, it } from "vitest";
import { requireEncounterBalance } from "../../data/balance";
import {
  CHAPTER_RESERVE,
  CLINIC_FLOOR,
  INCOME_SPREAD,
  MAINLINE_SURPLUS,
  MIN_ROADS_AFFORDING_TIER_UP,
  rewardBand,
  THOROUGH_CHOICE,
} from "../../data/economyBalance";
import { encounters } from "../../data/encounters";
import { injuries } from "../../data/injuries";
import { PLAYTHROUGHS } from "../../data/story/walkthroughRoutes";
import { closing, income, net, spend } from "./ledger";
import { WEAPON_WISH_PREFIX } from "./profiles";
import { sweepSummary } from "./report";
import { cellsFor, runEconomySweep, type EconomyCell } from "./sweep";

/**
 * The economy's coarse bounds, run in CI.
 *
 * The same shape as the combat balance sweep next door: play the real
 * thing, fold the result, and assert a handful of deliberately wide
 * bands that an ordinary content edit cannot break and a broken economy
 * cannot pass. What each band is for is written beside it in
 * ../../data/economyBalance.ts; this file only measures.
 *
 * The sweep is played once and shared, because it plays four whole
 * games twice over.
 */

let cells: EconomyCell[];

beforeAll(() => {
  cells = runEconomySweep();
});

/** The table, for a failure message that says which column moved. */
function table(): string {
  return `\n${sweepSummary(cells)}\n`;
}

describe("the reward ladder", () => {
  it("pays every fight inside its tier's band", () => {
    for (const encounter of encounters) {
      const entry = requireEncounterBalance(encounter.id);
      const band = rewardBand(entry.tier, entry.class);
      const paid = encounter.rewards.credits;
      expect(
        paid,
        `${encounter.id} (${entry.tier}/${entry.class}) pays ${paid}`,
      ).toBeGreaterThanOrEqual(band.min);
      expect(
        paid,
        `${encounter.id} (${entry.tier}/${entry.class}) pays ${paid}`,
      ).toBeLessThanOrEqual(band.max);
    }
  });

  it("keeps the ladder climbing: a late fight always beats an early one", () => {
    const bandOf = (tier: "opening" | "mid" | "late") =>
      rewardBand(tier, "standard");
    expect(bandOf("mid").min).toBeGreaterThan(bandOf("opening").max);
    expect(bandOf("late").min).toBeGreaterThan(bandOf("mid").max);
  });
});

describe("the poverty floors", () => {
  it("keeps the clinic's cheapest door under the floor", () => {
    const cheapest = Math.min(...injuries.map((injury) => injury.treatCost));
    expect(cheapest).toBeLessThanOrEqual(CLINIC_FLOOR);
  });

  it("never lets a chapter's reserve fall under the clinic floor", () => {
    // A simulated player who shops past the clinic is measuring the
    // harness rather than the economy.
    for (const [chapter, reserve] of Object.entries(CHAPTER_RESERVE)) {
      expect(reserve, `chapter ${chapter}`).toBeGreaterThanOrEqual(
        CLINIC_FLOOR,
      );
    }
  });

  it("leaves every run able to walk into a clinic at every chapter break", () => {
    for (const cell of cells) {
      expect(cell.breaks.length, `${cell.playthroughId}`).toBe(
        Object.keys(CHAPTER_RESERVE).length,
      );
      for (const brk of cell.breaks) {
        expect(
          brk.credits,
          `${cell.playthroughId}/${cell.profileId} after chapter ` +
            `${brk.chapter}${table()}`,
        ).toBeGreaterThanOrEqual(CLINIC_FLOOR);
      }
    }
  });

  it("finishes every road it starts — the gates were all affordable", () => {
    for (const cell of cells) {
      const playthrough = PLAYTHROUGHS.find(
        (entry) => entry.id === cell.playthroughId,
      );
      expect(cell.endings.at(-1), `${cell.playthroughId}/${cell.profileId}`).toBe(
        playthrough?.endingId,
      );
    }
  });
});

describe("the mainline ledger", () => {
  const mainline = () => cellsFor(cells, "mainline-rusher");

  it("leaves a modest surplus on every road", () => {
    for (const cell of mainline()) {
      const held = closing(cell.ledger);
      const share = held / income(cell.ledger);
      expect(held, `${cell.playthroughId}${table()}`).toBeGreaterThanOrEqual(
        MAINLINE_SURPLUS.minCredits,
      );
      expect(share, `${cell.playthroughId}${table()}`).toBeGreaterThanOrEqual(
        MAINLINE_SURPLUS.minShare,
      );
      expect(share, `${cell.playthroughId}${table()}`).toBeLessThanOrEqual(
        MAINLINE_SURPLUS.maxShare,
      );
    }
  });

  it("spends real money on every road: the road is not free", () => {
    for (const cell of mainline()) {
      expect(spend(cell.ledger), `${cell.playthroughId}`).toBeGreaterThan(0);
    }
  });

  it("puts a weapon tier-up in reach of the roads that draw one", () => {
    const bought = mainline().filter((cell) =>
      cell.ledger.entries.some(
        (entry) =>
          entry.category === "gear" &&
          entry.detail.startsWith(WEAPON_WISH_PREFIX),
      ),
    );
    expect(bought.length, table()).toBeGreaterThanOrEqual(
      MIN_ROADS_AFFORDING_TIER_UP,
    );
  });

  it("keeps the richest road inside a comprehensible multiple of the poorest", () => {
    const incomes = mainline().map((cell) => income(cell.ledger));
    const low = Math.min(...incomes);
    const high = Math.max(...incomes);
    expect(low, table()).toBeGreaterThanOrEqual(INCOME_SPREAD.minIncome);
    expect(high / low, table()).toBeLessThanOrEqual(INCOME_SPREAD.maxRatio);
  });
});

describe("the thorough ledger", () => {
  const thorough = () => cellsFor(cells, "thorough-explorer");

  it("never affords the whole wishlist on any road", () => {
    for (const cell of thorough()) {
      expect(
        cell.unmetWishes.length,
        `${cell.playthroughId} bought everything${table()}`,
      ).toBeGreaterThanOrEqual(THOROUGH_CHOICE.minUnmetWishes);
    }
  });

  it("makes clearing the bag worth doing", () => {
    for (const cell of thorough()) {
      expect(
        net(cell.ledger, "salvage"),
        `${cell.playthroughId} salvage${table()}`,
      ).toBeGreaterThanOrEqual(THOROUGH_CHOICE.minSalvage);
    }
  });

  it("puts materially more through the shops than the mainline does", () => {
    const total = (profileId: "mainline-rusher" | "thorough-explorer") =>
      cellsFor(cells, profileId).reduce(
        (sum, cell) => sum + spend(cell.ledger),
        0,
      );
    expect(
      total("thorough-explorer") - total("mainline-rusher"),
      table(),
    ).toBeGreaterThanOrEqual(THOROUGH_CHOICE.minExtraSpend);
  });

  it("earns more than the mainline run and still ends poorer", () => {
    // The whole shape of a thorough run in two figures: selling the bag
    // is a real faucet, and everything it opens costs more than it
    // brings in.
    for (const cell of thorough()) {
      const twin = cellsFor(cells, "mainline-rusher").find(
        (entry) => entry.playthroughId === cell.playthroughId,
      );
      if (!twin) throw new Error(`no mainline twin for ${cell.playthroughId}`);
      expect(income(cell.ledger), cell.playthroughId).toBeGreaterThan(
        income(twin.ledger),
      );
      expect(closing(cell.ledger), cell.playthroughId).toBeLessThan(
        closing(twin.ledger),
      );
    }
  });
});
