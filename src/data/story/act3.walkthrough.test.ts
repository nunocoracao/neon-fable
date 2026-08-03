import { describe, expect, it } from "vitest";
import { epilogueVignettes } from "../epilogues";
import { selectVignettes } from "../../narrative";
import {
  act3BetrayalToCommons,
  act3CourtToFreehold,
  act3LoneToGhost,
  act3VossToRegency,
  makeBetrayalState,
  makeCourtState,
  makeLoneState,
  makeVossState,
  routeBetrayalToCharter,
  routeCourtToSeverance,
  routeLoneToSeveranceHex,
  routeVossToTakeover,
} from "./walkthroughRoutes";
import { findRouteSeed } from "./walkthroughSupport";

/**
 * Four scripted full-game routes — character creation through the
 * epilogue, at the state level — each replaying a proven Act 1 + Act 2
 * history (walkthroughRoutes.ts) into the finale and landing on a
 * different game ending. Together they pin the finale's payoff
 * contract: openings branch on act2-outcome, scenes inside branch on
 * act1-outcome, allies open doors betrayed players never see, the
 * warrant changes how the Registry Gate reads you, one route resolves
 * the crown entirely without combat, and the epilogue vignettes
 * selected for the finished state tell each history back correctly.
 */

function vignetteIds(state: Parameters<typeof selectVignettes>[0]): string[] {
  return selectVignettes(state, epilogueVignettes).map((v) => v.id);
}

describe("act3 walkthroughs — four endings", () => {
  it("court loyalist: sappers at the crown, the keys burned — Freehold", () => {
    const { state, endings } = findRouteSeed(makeCourtState, [
      ...routeCourtToSeverance,
      ...act3CourtToFreehold,
    ]);

    expect(endings).toEqual([
      "job-done",
      "act1-court",
      "act2-severance",
      "ending-freehold",
    ]);
    expect(state.flags["act3-outcome"]).toBe("freehold");
    expect(state.flags["act3-complete"]).toBe(true);
    expect(state.flags["game-complete"]).toBe(true);
    expect(state.flags["ending"]).toBe("ending-freehold");
    // Allies appeared: sappers mustered and fought the crown beside you.
    expect(state.flags["a3-sappers"]).toBe(true);
    expect(state.flags["a3-crews"]).toBe(true);
    expect(state.flags["ferrow-blessing"]).toBe(true);
    expect(state.flags["crown-route"]).toBe("court");
    expect(state.flags["combat:enc-crown-court"]).toBe("victory");
    // act1-outcome = court, so the broadcast aside never existed here.
    expect(state.flags["crown-remembered"]).toBeUndefined();
    // Never wanted: the gate had no witness order to read — it was fought.
    expect(state.flags["gate3-route"]).toBe("fight");
    expect(state.flags["combat:enc-spire-gate"]).toBe("victory");
    // Epilogue: severed Steps, loyal Court, crews, a name never listed.
    const ids = vignetteIds(state);
    expect(ids).toContain("undercroft-severed");
    expect(ids).toContain("ferrow-ally");
    expect(ids).toContain("crews-warned");
    expect(ids).toContain("warrant-clean");
    expect(ids).toContain("city-freehold");
    expect(ids).not.toContain("hex-exchange");
  });

  it("voss retainer: the chair's override, the keys routed up — Regency", () => {
    const { state, endings } = findRouteSeed(makeVossState, [
      ...routeVossToTakeover,
      ...act3VossToRegency,
    ]);

    expect(endings).toEqual([
      "job-done",
      "act1-voss",
      "act2-takeover",
      "ending-regency",
    ]);
    expect(state.flags["act3-outcome"]).toBe("regency");
    expect(state.flags["game-complete"]).toBe(true);
    expect(state.flags["a3-standing"]).toBe("auric");
    // The chair's override meant no gate fight.
    expect(state.flags["gate3-route"]).toBe("standing");
    expect(state.flags["combat:enc-spire-gate"]).toBeUndefined();
    expect(state.flags["crown-route"]).toBe("auric");
    expect(state.flags["combat:enc-crown-auric"]).toBe("victory");
    expect(state.flags["locus-known"]).toBe(true);
    // The regency pays.
    expect(state.credits).toBeGreaterThanOrEqual(500);
    // Epilogue: a patron's Steps, a regent, Halex consumed, Lin's tab,
    // the Filament still dark from Act 1's burn.
    const ids = vignetteIds(state);
    expect(ids).toContain("undercroft-patronage");
    expect(ids).toContain("voss-regent");
    expect(ids).toContain("halex-consumed");
    expect(ids).toContain("lin-tab");
    expect(ids).toContain("sable-burned");
    expect(ids).toContain("city-regency");
  });

  it("charter witness: betrayal bites again, warrant stands down — Commons", () => {
    const { state, endings } = findRouteSeed(makeBetrayalState, [
      ...routeBetrayalToCharter,
      ...act3BetrayalToCommons,
    ]);

    expect(endings).toEqual([
      "kept-it",
      "act1-broadcast",
      "act2-charter",
      "ending-commons",
    ]);
    expect(state.flags["act3-outcome"]).toBe("commons");
    expect(state.flags["game-complete"]).toBe(true);
    // act1-outcome = broadcast branched the charter opening.
    expect(state.flags["crown-remembered"]).toBe(true);
    // The suspended warrant changed how the tower reads you.
    expect(state.flags["wanted-by-auric"]).toBe(false);
    expect(state.flags["gate3-route"]).toBe("witness");
    expect(state.flags["combat:enc-spire-gate"]).toBeUndefined();
    // The betrayal came back as enemies, and was not paid off.
    expect(state.flags["combat:enc-spire-collectors"]).toBe("victory");
    expect(state.flags["trust-paid"]).toBeUndefined();
    expect(state.flags["crown-route"]).toBe("alone");
    expect(state.flags["combat:enc-crown-alone"]).toBe("victory");
    // Epilogue: chartered Steps, exposed Voss, witnessed Halex, a
    // suspended warrant, Hex still keeping the Exchange's registers.
    const ids = vignetteIds(state);
    expect(ids).toContain("undercroft-charter");
    expect(ids).toContain("voss-exposed");
    expect(ids).toContain("halex-witnessed");
    expect(ids).toContain("warrant-suspended");
    expect(ids).toContain("hex-exchange");
    expect(ids).toContain("city-commons");
  });

  it("the diver and the ghost: a fully non-combat crown — Caretaker", () => {
    const { state, endings } = findRouteSeed(makeLoneState, [
      ...routeLoneToSeveranceHex,
      ...act3LoneToGhost,
    ]);

    expect(endings).toEqual([
      "kept-it",
      "act1-broadcast",
      "act2-severance",
      "ending-ghost",
    ]);
    expect(state.flags["act3-outcome"]).toBe("ghost");
    expect(state.flags["game-complete"]).toBe(true);
    // Same act2-outcome as the court route, different act1 history:
    // the broadcast aside fired and Ferrow's never existed.
    expect(state.flags["crown-remembered"]).toBe(true);
    expect(state.flags["ferrow-blessing"]).toBeUndefined();
    // The whole finale resolved without a single Act 3 fight.
    expect(state.flags["gate3-route"]).toBe("dark");
    expect(state.flags["combat:enc-spire-gate"]).toBeUndefined();
    expect(state.flags["combat:enc-spire-collectors"]).toBeUndefined();
    expect(state.flags["crown-route"]).toBe("commune");
    expect(state.flags["combat:enc-crown-court"]).toBeUndefined();
    expect(state.flags["combat:enc-crown-auric"]).toBeUndefined();
    expect(state.flags["combat:enc-crown-alone"]).toBeUndefined();
    expect(state.flags["hex-lattice"]).toBe(true);
    // The warrant was never lifted — the ghost route walked around it.
    expect(state.flags["wanted-by-auric"]).toBe(true);
    // Epilogue: Hex as registrar, severed Steps, a warrant still
    // technically live in a city that stopped taking Auric's calls.
    const ids = vignetteIds(state);
    expect(ids).toContain("hex-registrar");
    expect(ids).toContain("undercroft-severed");
    expect(ids).toContain("warrant-standing");
    expect(ids).toContain("city-ghost");
  });
});
