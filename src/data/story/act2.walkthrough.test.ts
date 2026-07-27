import { describe, expect, it } from "vitest";
import { hasItem } from "../../inventory";
import {
  makeBetrayalState,
  makeCourtState,
  makeVossState,
  routeBetrayalToCharter,
  routeCourtToSeverance,
  routeVossToTakeover,
} from "./walkthroughRoutes";
import { findRouteSeed } from "./walkthroughSupport";

/**
 * Scripted end-to-end walkthroughs of the three Act 2 branches, each
 * played from character creation through the intro and its Act 1 route
 * first — so every act1-outcome driven into Act 2 is a real recorded
 * state, not a synthetic one. The routes themselves live in
 * walkthroughRoutes.ts, shared with the Act 3 walkthroughs so the
 * histories the finale builds on are exactly the ones proven here.
 * Each route lands on a distinct Act 2 outcome and asserts the
 * distinguishing flags, allies, and bites.
 */

describe("act2 walkthroughs", () => {
  it("court opening: the sappers' tunnel, the ducts, and severance", () => {
    const { state, endings } = findRouteSeed(
      makeCourtState,
      routeCourtToSeverance,
    );

    expect(endings).toEqual(["job-done", "act1-court", "act2-severance"]);
    expect(state.flags["act2-outcome"]).toBe("severance");
    expect(state.flags["act2-complete"]).toBe(true);
    expect(state.flags["undercroft-severed"]).toBe(true);
    expect(state.flags["steps-independent"]).toBe(true);
    expect(state.flags["cordon-broken"]).toBe(true);
    expect(state.flags["a2-approach"]).toBe("court");
    // The Court's tunnel meant the perimeter fight never happened, and the
    // crews' duct route bypassed the crawler.
    expect(state.flags["combat:enc-exchange-gate"]).toBeUndefined();
    expect(state.flags["crawler-skipped"]).toBe(true);
    expect(state.flags["combat:enc-vent-crawler"]).toBeUndefined();
    expect(state.flags["combat:enc-cordon-court"]).toBe("victory");
    expect(state.flags["crew-warned"]).toBe(true);
    expect(hasItem(state.inventory, "wpn-arc-lash")).toBe(true);
    expect(state.location).toBe("exchange-ventworks");
  });

  it("voss opening: the writ walks in, Lin's spool, and the takeover", () => {
    const { state, endings } = findRouteSeed(
      makeVossState,
      routeVossToTakeover,
    );

    expect(endings).toEqual(["job-done", "act1-voss", "act2-takeover"]);
    expect(state.flags["act2-outcome"]).toBe("takeover");
    expect(state.flags["act2-complete"]).toBe(true);
    expect(state.flags["voss-ascendant"]).toBe(true);
    expect(state.flags["auric-patron"]).toBe(true);
    expect(state.flags["halex-deposed"]).toBe(true);
    expect(state.flags["a2-approach"]).toBe("voss");
    // Burning Sable in Act 1 closed the Filament for good.
    expect(state.flags["filament-dark"]).toBe(true);
    expect(state.flags["lin-debt"]).toBe(true);
    expect(hasItem(state.inventory, "msc-cordon-orders")).toBe(true);
    // The writ meant the gate fight never happened.
    expect(state.flags["gate2-route"]).toBe("writ");
    expect(state.flags["combat:enc-exchange-gate"]).toBeUndefined();
    expect(state.flags["combat:enc-cordon-voss"]).toBe("victory");
    expect(state.credits).toBeGreaterThanOrEqual(400);
  });

  it("broadcast opening: hunted and betrayed-voss, veiled in, charter out", () => {
    const { state, endings } = findRouteSeed(
      makeBetrayalState,
      routeBetrayalToCharter,
    );

    expect(endings).toEqual(["kept-it", "act1-broadcast", "act2-charter"]);
    expect(state.flags["act2-outcome"]).toBe("charter");
    expect(state.flags["act2-complete"]).toBe(true);
    expect(state.flags["undercroft-charter"]).toBe(true);
    expect(state.flags["halex-deposed"]).toBe(true);
    expect(state.flags["cordon-broken"]).toBe(true);
    expect(state.flags["a2-approach"]).toBe("lone");
    // Betrayal bit: the collectors came, and were fought, not paid.
    expect(state.flags["betrayed-voss"]).toBe(true);
    expect(state.flags["combat:enc-collectors"]).toBe("victory");
    expect(state.flags["collectors-paid"]).toBeUndefined();
    // The veil beat the scanners; the perimeter fight never happened.
    expect(state.flags["gate2-route"]).toBe("veil");
    expect(state.flags["combat:enc-exchange-gate"]).toBeUndefined();
    expect(state.flags["combat:enc-cordon-lone"]).toBe("victory");
    expect(state.flags["hex-exchange"]).toBe(true);
    expect(state.flags["proxy-known"]).toBe(true);
    // Becoming the Charter's witness suspended the warrant.
    expect(state.flags["wanted-by-auric"]).toBe(false);
  });
});
