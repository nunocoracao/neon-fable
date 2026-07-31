import { describe, expect, it } from "vitest";
import { getCompanion } from "../data/companions";
import {
  GAME_STATE_VERSION,
  createNewGame,
  migrateGameState,
  type GameState,
} from "./gameState";
import {
  PartyError,
  activeMember,
  activeMembers,
  adjustLoyalty,
  emptyParty,
  getMember,
  isRecruited,
  recruitCompanion,
  restyleCompanion,
  setActive,
  setCompanionHp,
} from "./party";

/**
 * Party state: the round-trip a save is, the seeding rule (content is
 * the seed, never the live value), and the two flags that are not the
 * same flag — recruited is permanent, active is revocable.
 */

const vesper = getCompanion("vesper")!;

describe("recruitCompanion", () => {
  it("seeds a member from the companion record, on their feet and active", () => {
    const party = recruitCompanion(emptyParty(), "vesper");
    const member = getMember(party, "vesper")!;
    expect(member.recruited).toBe(true);
    expect(member.active).toBe(true);
    expect(member.stats).toEqual(vesper.stats);
    expect(member.maxHp).toBe(vesper.maxHp);
    expect(member.hp).toBe(vesper.maxHp);
    expect(member.equipment).toEqual({
      weapon: vesper.weaponId,
      outfit: vesper.outfitId,
    });
    expect(member.abilityIds).toEqual(vesper.abilityIds);
    expect(member.lookId).toBe(vesper.defaultLookId);
    expect(member.loyalty).toBe(0);
  });

  it("copies content rather than aliasing it", () => {
    const party = recruitCompanion(emptyParty(), "vesper");
    const member = getMember(party, "vesper")!;
    expect(member.stats).not.toBe(vesper.stats);
    expect(member.abilityIds).not.toBe(vesper.abilityIds);
  });

  it("is a pure function: the party handed in is untouched", () => {
    const before = emptyParty();
    const after = recruitCompanion(before, "vesper");
    expect(before.members).toEqual([]);
    expect(after).not.toBe(before);
  });

  it("re-recruiting a benched companion brings them back without a reset", () => {
    let party = recruitCompanion(emptyParty(), "vesper");
    party = setCompanionHp(party, "vesper", 4);
    party = adjustLoyalty(party, "vesper", 3);
    party = setActive(party, "vesper", false);

    party = recruitCompanion(party, "vesper");
    const member = getMember(party, "vesper")!;
    expect(party.members).toHaveLength(1);
    expect(member.active).toBe(true);
    // What the run did to them survives; only their standing changed.
    expect(member.hp).toBe(4);
    expect(member.loyalty).toBe(3);
  });

  it("refuses a companion no content defines", () => {
    try {
      recruitCompanion(emptyParty(), "nobody");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PartyError);
      expect((error as PartyError).code).toBe("unknown-companion");
    }
  });
});

describe("party selectors", () => {
  it("counts only recruited-and-active companions as travelling", () => {
    let party = recruitCompanion(emptyParty(), "vesper");
    expect(activeMembers(party)).toHaveLength(1);
    expect(activeMember(party)?.companionId).toBe("vesper");

    party = setActive(party, "vesper", false);
    expect(activeMembers(party)).toEqual([]);
    expect(activeMember(party)).toBeNull();
    // Benched is not forgotten: the permanent fact stands.
    expect(isRecruited(party, "vesper")).toBe(true);
  });

  it("reports nobody for an empty party", () => {
    expect(activeMember(emptyParty())).toBeNull();
    expect(isRecruited(emptyParty(), "vesper")).toBe(false);
    expect(getMember(emptyParty(), "vesper")).toBeUndefined();
  });
});

describe("member updates", () => {
  it("clamps written hp into [0, maxHp]", () => {
    const party = recruitCompanion(emptyParty(), "vesper");
    expect(getMember(setCompanionHp(party, "vesper", -7), "vesper")!.hp).toBe(0);
    expect(getMember(setCompanionHp(party, "vesper", 999), "vesper")!.hp).toBe(
      vesper.maxHp,
    );
  });

  it("moves loyalty in both directions", () => {
    let party = recruitCompanion(emptyParty(), "vesper");
    party = adjustLoyalty(party, "vesper", 2);
    party = adjustLoyalty(party, "vesper", -3);
    expect(getMember(party, "vesper")!.loyalty).toBe(-1);
  });

  it("re-dresses a companion: their look, and their gear", () => {
    let party = recruitCompanion(emptyParty(), "vesper");
    party = restyleCompanion(party, "vesper", {
      lookId: "quays-runner",
      equipment: { weapon: "wpn-shard-knife" },
    });
    const member = getMember(party, "vesper")!;
    expect(member.lookId).toBe("quays-runner");
    expect(member.equipment.weapon).toBe("wpn-shard-knife");
    // A partial change leaves the rest of the slots alone.
    expect(member.equipment.outfit).toBe(vesper.outfitId);
  });

  it("refuses to update somebody who never joined", () => {
    try {
      adjustLoyalty(emptyParty(), "vesper", 1);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PartyError);
      expect((error as PartyError).code).toBe("not-recruited");
    }
  });
});

describe("party on GameState", () => {
  it("starts empty on a fresh game and survives a JSON round-trip", () => {
    const state = createNewGame({ seed: 3 });
    expect(state.party).toEqual({ members: [] });

    const recruited: GameState = {
      ...state,
      party: adjustLoyalty(recruitCompanion(state.party, "vesper"), "vesper", 2),
    };
    const roundTripped: GameState = JSON.parse(JSON.stringify(recruited));
    expect(roundTripped).toEqual(recruited);
    expect(getMember(roundTripped.party, "vesper")!.loyalty).toBe(2);
  });

  it("gives a pre-companion save an empty party rather than a hole", () => {
    const state = createNewGame({ seed: 5 });
    // Exactly what a v7 save holds: everything but the party.
    const old = { ...state, version: 7 } as GameState;
    delete (old as Partial<GameState>).party;

    const migrated = migrateGameState(old, 7);
    expect(migrated.version).toBe(GAME_STATE_VERSION);
    expect(migrated.party).toEqual({ members: [] });
    // And it can recruit from wherever it left off.
    expect(
      isRecruited(recruitCompanion(migrated.party, "vesper"), "vesper"),
    ).toBe(true);
  });
});
