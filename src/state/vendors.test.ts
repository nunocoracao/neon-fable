import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import {
  GAME_STATE_VERSION,
  createNewGame,
  migrateGameState,
  type GameState,
} from "./gameState";
import {
  canHaggle,
  clampVendors,
  emptyVendors,
  freshLedger,
  ledgerFor,
  recordHaggle,
  recordSale,
  soldCount,
} from "./vendors";

/**
 * The counters' books. The whole restock mechanism is the act stamp on
 * a ledger, so that is what most of this pins: a ledger from another
 * act is not this act's ledger, and nothing has to fire at a chapter
 * boundary for a shelf to fill back up.
 */

const VENDOR = "wet-market-back";

function state(): GameState {
  return createNewGame({ character: fixtureCharacter({}), seed: 1 });
}

describe("the ledger", () => {
  it("starts every counter empty", () => {
    expect(emptyVendors()).toEqual({ ledgers: {} });
    const ledger = ledgerFor(emptyVendors(), VENDOR, 1);
    expect(ledger).toEqual(freshLedger(1));
    expect(soldCount(ledger, "buy-cordon-plate")).toBe(0);
    expect(canHaggle(ledger)).toBe(true);
  });

  it("counts copies out of this act's stock", () => {
    let vendors = recordSale(emptyVendors(), VENDOR, 1, "buy-cordon-plate");
    vendors = recordSale(vendors, VENDOR, 1, "buy-cordon-plate");
    vendors = recordSale(vendors, VENDOR, 1, "buy-ghostline-mantle");
    const ledger = ledgerFor(vendors, VENDOR, 1);
    expect(soldCount(ledger, "buy-cordon-plate")).toBe(2);
    expect(soldCount(ledger, "buy-ghostline-mantle")).toBe(1);
  });

  it("forgets everything the moment the act turns over", () => {
    let vendors = recordSale(emptyVendors(), VENDOR, 1, "buy-cordon-plate");
    vendors = recordHaggle(vendors, VENDOR, 1, false);
    expect(canHaggle(ledgerFor(vendors, VENDOR, 1))).toBe(false);

    const nextAct = ledgerFor(vendors, VENDOR, 2);
    expect(soldCount(nextAct, "buy-cordon-plate")).toBe(0);
    expect(canHaggle(nextAct)).toBe(true);
    // And the old book is still there, still void: nothing was cleared.
    expect(soldCount(ledgerFor(vendors, VENDOR, 1), "buy-cordon-plate")).toBe(1);
  });

  it("keeps one counter's book out of another's", () => {
    const vendors = recordHaggle(emptyVendors(), VENDOR, 1, false);
    expect(canHaggle(ledgerFor(vendors, "vm-broker-counter", 1))).toBe(true);
  });

  it("records how an argument went, once", () => {
    const won = recordHaggle(emptyVendors(), VENDOR, 1, true);
    expect(ledgerFor(won, VENDOR, 1).haggle).toBe("won");
    const lost = recordHaggle(emptyVendors(), VENDOR, 1, false);
    expect(ledgerFor(lost, VENDOR, 1).haggle).toBe("locked");
    // A won argument survives further purchases at the same counter.
    const after = recordSale(won, VENDOR, 1, "buy-cordon-plate");
    expect(ledgerFor(after, VENDOR, 1).haggle).toBe("won");
  });
});

describe("clamping a malformed book", () => {
  it("reads nonsense as nobody having traded", () => {
    expect(clampVendors(undefined)).toEqual(emptyVendors());
    expect(clampVendors({ ledgers: "several" })).toEqual(emptyVendors());
    expect(clampVendors({})).toEqual(emptyVendors());
  });

  it("drops a ledger with no act, and a count that is not one", () => {
    const cleaned = clampVendors({
      ledgers: {
        [VENDOR]: {
          act: 2,
          haggle: "won",
          sold: { "buy-cordon-plate": 2, "buy-ghostline-mantle": -1, junk: "x" },
        },
        broken: { haggle: "won" },
      },
    });
    expect(cleaned.ledgers.broken).toBeUndefined();
    expect(cleaned.ledgers[VENDOR]).toEqual({
      act: 2,
      haggle: "won",
      sold: { "buy-cordon-plate": 2 },
    });
  });

  it("reads an unknown haggle state as untried", () => {
    const cleaned = clampVendors({
      ledgers: { [VENDOR]: { act: 1, haggle: "smug", sold: {} } },
    });
    expect(cleaned.ledgers[VENDOR]?.haggle).toBe("none");
  });
});

describe("save compatibility", () => {
  it("gives a save from before the counters an empty set of books", () => {
    const old = { ...state(), version: 12 } as GameState;
    delete (old as Partial<GameState>).vendors;
    const migrated = migrateGameState(old, 12);
    expect(migrated.vendors).toEqual(emptyVendors());
    expect(migrated.version).toBe(GAME_STATE_VERSION);
  });

  it("survives a JSON round-trip with its books intact", () => {
    const traded: GameState = {
      ...state(),
      vendors: recordHaggle(
        recordSale(emptyVendors(), VENDOR, 2, "buy-cordon-plate"),
        VENDOR,
        2,
        true,
      ),
    };
    expect(JSON.parse(JSON.stringify(traded))).toEqual(traded);
  });
});
