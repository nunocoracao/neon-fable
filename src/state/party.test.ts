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
  loyaltyOf,
  recruitCompanion,
  restyleCompanion,
  setActive,
  setActiveCompanion,
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

describe("one companion out at a time", () => {
  it("benches whoever was out when somebody new joins", () => {
    let party = recruitCompanion(emptyParty(), "vesper");
    party = recruitCompanion(party, "sill");
    expect(party.members).toHaveLength(2);
    expect(activeMember(party)?.companionId).toBe("sill");
    expect(getMember(party, "vesper")!.active).toBe(false);
    // Benched, not forgotten — the permanent fact is untouched.
    expect(isRecruited(party, "vesper")).toBe(true);
  });

  it("switches the active companion between missions", () => {
    let party = recruitCompanion(recruitCompanion(emptyParty(), "vesper"), "sill");
    party = setCompanionHp(party, "sill", 3);
    party = adjustLoyalty(party, "sill", 4);

    party = setActiveCompanion(party, "vesper");
    expect(activeMembers(party).map((m) => m.companionId)).toEqual(["vesper"]);
    // The one who stepped back keeps everything the run did to them.
    const benched = getMember(party, "sill")!;
    expect(benched.hp).toBe(3);
    expect(benched.loyalty).toBe(4);

    party = setActiveCompanion(party, "sill");
    expect(activeMembers(party).map((m) => m.companionId)).toEqual(["sill"]);
  });

  it("takes nobody out at all, which is working alone again", () => {
    let party = recruitCompanion(emptyParty(), "vesper");
    party = setActiveCompanion(party, null);
    expect(activeMember(party)).toBeNull();
    expect(isRecruited(party, "vesper")).toBe(true);
  });

  it("never re-activates somebody by re-benching the other", () => {
    // Idempotent both ways: the invariant is "exactly the named one".
    let party = recruitCompanion(recruitCompanion(emptyParty(), "vesper"), "sill");
    party = setActiveCompanion(setActiveCompanion(party, "sill"), "sill");
    expect(activeMembers(party).map((m) => m.companionId)).toEqual(["sill"]);
  });

  it("refuses to send out somebody who never joined", () => {
    try {
      setActiveCompanion(recruitCompanion(emptyParty(), "vesper"), "sill");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PartyError);
      expect((error as PartyError).code).toBe("not-recruited");
    }
  });

  it("re-recruiting a benched companion takes them back out", () => {
    let party = recruitCompanion(recruitCompanion(emptyParty(), "vesper"), "sill");
    party = recruitCompanion(party, "vesper");
    expect(activeMembers(party).map((m) => m.companionId)).toEqual(["vesper"]);
    expect(party.members).toHaveLength(2);
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
    expect(loyaltyOf(party, "vesper")).toBe(-1);
    // Somebody never met stands at nothing rather than throwing.
    expect(loyaltyOf(party, "sill")).toBe(0);
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
