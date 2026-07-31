import { describe, expect, it } from "vitest";
import { requireMap } from "../data/maps";
import { NEWS_HEADLINES } from "../data/world";
import {
  introDeliveredFighting,
  makeCourtState,
  routeCourtToSeverance,
} from "../data/story/walkthroughRoutes";
import { findRouteSeed } from "../data/story/walkthroughSupport";
import type { GameState } from "../state";
import { newsStrip } from "./news";
import { populateMap } from "./population";
import { deriveWorldState } from "./state";
import { vendorStock } from "./vendor";

/**
 * The acceptance test for the whole feature: two major beats, played
 * for real through the narrative and combat engines, and the streets
 * they leave behind.
 *
 * Nothing here sets a flag by hand. The states compared are the ones a
 * player actually arrives at — the night the courier job lands, and the
 * night the Cordon comes down — so what is proven is that the city
 * reacts to *play*, not to a fixture.
 */

const FRESH = makeCourtState(1);

/** The city as this run has left it, from the state alone. */
function street(state: GameState, mapId: string) {
  const world = deriveWorldState(state);
  const map = populateMap(requireMap(mapId), world);
  return {
    world,
    map,
    /** Who is on the street, and what the prompt calls them. */
    people: map.interactables.map((i) => `${i.id}:${i.label}`),
    ids: map.interactables.map((i) => i.id),
  };
}

function headline(id: string): string {
  const found = NEWS_HEADLINES.find((h) => h.id === id);
  if (!found) throw new Error(`no headline "${id}"`);
  return found.text;
}

/** Every line the hub's two boards are carrying, together. */
function boards(state: GameState): string[] {
  const world = deriveWorldState(state);
  const map = requireMap("cinder-plaza");
  return (map.screens ?? []).flatMap((screen) =>
    newsStrip(map.id, screen.id, screen.channel as "civic", world),
  );
}

describe("a played run changes the streets it walks through", () => {
  // Both beats come off one scripted playthrough: the courier job
  // delivered at the end of the intro, and the Cordon broken at the end
  // of Act 2 on the Court route.
  const afterCourierJob = findRouteSeed(makeCourtState, [
    introDeliveredFighting,
  ]).state;
  const afterCordon = findRouteSeed(makeCourtState, routeCourtToSeverance).state;

  it("starts on a city with nothing to say about you", () => {
    const before = street(FRESH, "cinder-plaza");
    expect(before.map).toBe(requireMap("cinder-plaza"));
    expect(before.ids).not.toContain("hub-picket");
    expect(before.ids).toContain("rust-runner");
    expect(boards(FRESH)).not.toContain(headline("row-shuttered"));
  });

  describe("beat one — the spike changes hands", () => {
    it("was reached by playing, not by writing a flag", () => {
      expect(afterCourierJob.flags["spike-delivered"]).toBe(true);
      expect(deriveWorldState(afterCourierJob).conditions).toContain(
        "stalls-shuttered",
      );
    });

    it("shutters the row: a server on the stalls and the vendor gone quiet", () => {
      const before = street(FRESH, "cinder-plaza");
      const after = street(afterCourierJob, "cinder-plaza");
      expect(after.people).not.toEqual(before.people);
      expect(after.ids).toContain("hub-picket");
      expect(
        after.map.interactables.find((i) => i.id === "market-vendor")?.label,
      ).toBe("Wet-market vendor — shutters down");
      // The shop itself is still open — shuttered, not deleted.
      expect(
        after.map.interactables.find((i) => i.id === "market-vendor")?.interaction,
      ).toEqual({ kind: "dialogue", nodeId: "wet-market" });
    });

    it("pushes the trade a level up, where the market takes it", () => {
      const before = street(FRESH, "vertical-market");
      const after = street(afterCourierJob, "vertical-market");
      expect(before.ids).not.toContain("market-overflow");
      expect(after.ids).toContain("market-overflow");
    });

    it("puts it on the boards, in both districts", () => {
      expect(boards(afterCourierJob)).toContain(headline("row-shuttered"));
      const market = requireMap("vertical-market");
      const aisle = market.screens?.[0];
      expect(aisle).toBeDefined();
      if (!aisle) return;
      expect(
        newsStrip(
          market.id,
          aisle.id,
          "market",
          deriveWorldState(afterCourierJob),
        ),
      ).toContain(headline("trade-climbs"));
    });
  });

  describe("beat two — the Cordon comes down", () => {
    it("was reached by playing an entire act", () => {
      expect(afterCordon.flags["act2-complete"]).toBe(true);
      expect(afterCordon.flags["cordon-broken"]).toBe(true);
      expect(deriveWorldState(afterCordon).conditions).toContain("cordon-broken");
    });

    it("takes the Rustyard's ambusher off Cinder Row", () => {
      expect(street(FRESH, "cinder-plaza").ids).toContain("rust-runner");
      expect(street(afterCordon, "cinder-plaza").ids).not.toContain("rust-runner");
    });

    it("leaves a street that reads differently from either earlier night", () => {
      const nights = [FRESH, afterCourierJob, afterCordon].map(
        (state) => street(state, "cinder-plaza").people.join("|"),
      );
      expect(new Set(nights).size).toBe(3);
    });

    it("changes what the boards are saying", () => {
      const said = boards(afterCordon);
      expect(said).toContain(headline("cordon-down"));
      // The shutters went back up when Act 1 closed over them.
      expect(said).not.toContain(headline("row-shuttered"));
      // And the standing filler is still there under all of it, so a
      // board never runs out of things to say.
      expect(said).toContain(headline("surge-warning"));
    });

    it("puts Exchange hardware on the wet-market's back shelf", () => {
      const before = vendorStock(
        "wet-market-back",
        deriveWorldState(afterCourierJob),
      ).map((entry) => entry.id);
      const after = vendorStock(
        "wet-market-back",
        deriveWorldState(afterCordon),
      ).map((entry) => entry.id);
      expect(before).not.toContain("buy-torsion-frame");
      expect(after).toContain("buy-torsion-frame");
    });

    it("posts the Steps' own watch once Greywater is ungoverned", () => {
      // The Court route ends in severance, which is a change to a
      // district the player is not standing in when it happens.
      expect(afterCordon.flags["steps-independent"]).toBe(true);
      expect(street(afterCordon, "greywater-steps").ids).toContain("steps-watch");
      expect(street(FRESH, "greywater-steps").ids).not.toContain("steps-watch");
    });
  });
});
