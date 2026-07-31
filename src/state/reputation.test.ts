import { describe, expect, it } from "vitest";
import {
  FACTION_IDS,
  REPUTATION_MAX,
  REPUTATION_MIN,
} from "../data/factions";
import { FACTION_STANDINGS } from "../data/standings";
import type { FlagMap } from "./flags";
import {
  adjustReputation,
  applyStanding,
  bandFor,
  bandOf,
  canAccess,
  clampReputation,
  deriveReputation,
  emptyReputation,
  reputationOf,
  sumStanding,
  thresholdValue,
} from "./reputation";

describe("emptyReputation", () => {
  it("starts every faction at nothing", () => {
    const reputation = emptyReputation();
    for (const id of FACTION_IDS) {
      expect(reputationOf(reputation, id)).toBe(0);
      expect(bandOf(reputation, id).id).toBe("neutral");
    }
  });

  it("survives a JSON round-trip unchanged", () => {
    const reputation = adjustReputation(emptyReputation(), "court", 30);
    expect(JSON.parse(JSON.stringify(reputation))).toEqual(reputation);
  });
});

describe("adjustReputation", () => {
  it("moves one faction and leaves the others alone", () => {
    const moved = adjustReputation(emptyReputation(), "court", 25);
    expect(reputationOf(moved, "court")).toBe(25);
    expect(reputationOf(moved, "auric")).toBe(0);
  });

  it("clamps at the ceiling and the floor", () => {
    const high = adjustReputation(emptyReputation(), "auric", 500);
    expect(reputationOf(high, "auric")).toBe(REPUTATION_MAX);
    const low = adjustReputation(high, "auric", -500);
    expect(reputationOf(low, "auric")).toBe(REPUTATION_MIN);
  });

  it("returns the same object when nothing moves", () => {
    const pinned = adjustReputation(emptyReputation(), "market", REPUTATION_MAX);
    expect(adjustReputation(pinned, "market", 10)).toBe(pinned);
    expect(adjustReputation(pinned, "market", 0)).toBe(pinned);
  });

  it("never mutates the state it was given", () => {
    const before = emptyReputation();
    adjustReputation(before, "court", 40);
    expect(reputationOf(before, "court")).toBe(0);
  });
});

describe("applyStanding", () => {
  it("applies a whole authored swing at once", () => {
    const after = applyStanding(emptyReputation(), { auric: -20, court: 25 });
    expect(reputationOf(after, "auric")).toBe(-20);
    expect(reputationOf(after, "court")).toBe(25);
    expect(reputationOf(after, "market")).toBe(0);
  });

  it("is a no-op for nothing, and for a swing of zeroes", () => {
    const before = emptyReputation();
    expect(applyStanding(before, undefined)).toBe(before);
    expect(applyStanding(before, { auric: 0 })).toBe(before);
  });
});

describe("bandFor", () => {
  it("names each band at its own floor", () => {
    expect(bandFor(REPUTATION_MIN).id).toBe("hostile");
    expect(bandFor(-60).id).toBe("cold");
    expect(bandFor(-20).id).toBe("neutral");
    expect(bandFor(0).id).toBe("neutral");
    expect(bandFor(20).id).toBe("warm");
    expect(bandFor(60).id).toBe("trusted");
    expect(bandFor(REPUTATION_MAX).id).toBe("trusted");
  });

  it("holds one below a floor in the band beneath it", () => {
    expect(bandFor(-21).id).toBe("cold");
    expect(bandFor(19).id).toBe("neutral");
    expect(bandFor(59).id).toBe("warm");
  });

  it("is total over anything outside the scale", () => {
    expect(bandFor(-9000).id).toBe("hostile");
    expect(bandFor(9000).id).toBe("trusted");
  });
});

describe("clampReputation", () => {
  it("holds values in range and rounds fractions", () => {
    expect(clampReputation(12.4)).toBe(12);
    expect(clampReputation(500)).toBe(REPUTATION_MAX);
    expect(clampReputation(-500)).toBe(REPUTATION_MIN);
  });
});

describe("canAccess", () => {
  const reputation = applyStanding(emptyReputation(), {
    court: 62,
    auric: -70,
  });

  it("reads a raw threshold", () => {
    expect(canAccess(reputation, "court", 60)).toBe(true);
    expect(canAccess(reputation, "court", 63)).toBe(false);
  });

  it("reads a band threshold as that band's floor", () => {
    expect(thresholdValue("warm")).toBe(20);
    expect(canAccess(reputation, "court", "trusted")).toBe(true);
    expect(canAccess(reputation, "market", "warm")).toBe(false);
  });

  it("gates the other way with at-most", () => {
    expect(canAccess(reputation, "auric", "cold", "at-most")).toBe(true);
    expect(canAccess(reputation, "court", "cold", "at-most")).toBe(false);
  });

  it("treats an unknown band as a door that never opens", () => {
    expect(canAccess(reputation, "court", "beloved" as never)).toBe(false);
  });
});

describe("sumStanding", () => {
  it("adds swings and drops what nothing moved", () => {
    expect(
      sumStanding([{ auric: 10, court: -6 }, { court: 6 }, { market: 0 }]),
    ).toEqual({ auric: 10 });
  });

  it("sums nothing to nothing", () => {
    expect(sumStanding([])).toEqual({});
  });
});

describe("deriveReputation", () => {
  it("reads nothing off a save that recorded nothing", () => {
    expect(deriveReputation({})).toEqual(emptyReputation());
  });

  it("reads a Court run back as somebody the Court knows", () => {
    const flags: FlagMap = {
      "court-oath": true,
      "act1-outcome": "court",
      "act1-complete": true,
      "act2-outcome": "severance",
    };
    const reputation = deriveReputation(flags);
    // 12 + 25 + 25 against the Court, -20 + -25 against the Combine.
    expect(reputationOf(reputation, "court")).toBe(62);
    expect(bandOf(reputation, "court").id).toBe("trusted");
    expect(reputationOf(reputation, "auric")).toBe(-45);
    expect(bandOf(reputation, "auric").id).toBe("cold");
    expect(reputationOf(reputation, "market")).toBe(-10);
  });

  it("reads the Combine's own line item the other way round", () => {
    const reputation = deriveReputation({
      "voss-deal": true,
      "act1-outcome": "voss",
      "act2-outcome": "takeover",
      "act3-outcome": "regency",
    });
    expect(bandOf(reputation, "auric").id).toBe("trusted");
    expect(bandOf(reputation, "court").id).toBe("hostile");
  });

  it("counts the district chains at their own weight", () => {
    const reputation = deriveReputation({ "last-mile-exposed": true });
    expect(reputationOf(reputation, "market")).toBe(12);
    expect(reputationOf(reputation, "auric")).toBe(-12);
    expect(reputationOf(reputation, "court")).toBe(6);
  });

  it("ignores a flag written with a value nothing is worth", () => {
    expect(deriveReputation({ "act1-outcome": "unwritten" })).toEqual(
      emptyReputation(),
    );
  });

  it("clamps a run that went the Court's way at every turn", () => {
    // Sworn, stopped the flush, severed the Undercroft, gave the city
    // back — 104 points of goodwill on a scale that stops at 100.
    const reputation = deriveReputation({
      "court-oath": true,
      "act1-outcome": "court",
      "act2-outcome": "severance",
      "act3-outcome": "commons",
      "under-waterline-broken": true,
    });
    expect(reputationOf(reputation, "court")).toBe(REPUTATION_MAX);
    expect(bandOf(reputation, "court").id).toBe("trusted");
  });

  it("never lands outside the scale, whatever a save recorded", () => {
    const flags: FlagMap = {};
    for (const source of FACTION_STANDINGS) flags[source.flag] = source.value;
    const reputation = deriveReputation(flags);
    for (const id of FACTION_IDS) {
      expect(reputationOf(reputation, id)).toBeGreaterThanOrEqual(
        REPUTATION_MIN,
      );
      expect(reputationOf(reputation, id)).toBeLessThanOrEqual(REPUTATION_MAX);
    }
  });
});
