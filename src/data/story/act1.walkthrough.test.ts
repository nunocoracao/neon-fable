import { describe, expect, it } from "vitest";
import { hasItem, installEnhancement } from "../../inventory";
import { act1Arc } from "./act1";
import { introArc } from "./intro";
import {
  findRouteSeed,
  makeState,
  type RouteStep,
} from "./walkthroughSupport";

/**
 * Scripted end-to-end walkthroughs of the three Act 1 outcome routes,
 * entirely at the state level: intro job -> chapter -> ending, with every
 * fight autoplayed through the real combat engine. Each route scans RNG
 * seeds until its fights all end in victory (only combat losses are
 * retried — a gating or graph regression fails immediately), then asserts
 * the distinguishing flags, items, and allies at chapter end. The driver
 * lives in walkthroughSupport.ts, shared with the Act 2 walkthroughs.
 */

/** Intro played to a delivered spike (fighting the scout). */
const introDeliveredFighting: RouteStep = {
  kind: "arc",
  arc: introArc,
  entry: "start",
  choices: [
    "agree-terms",
    "walk-on",
    "street-nod",
    "sit-agreed",
    "take-advance",
    "take-job",
    "jump-scout",
    "back-to-bar",
    "hand-over",
  ],
};

describe("act1 walkthroughs", () => {
  it("court route: street kid dives the culvert and stops the Undertow", () => {
    const { state, endings } = findRouteSeed(
      (seed) =>
        makeState(
          "gutter-courier",
          (a) => {
            a.body += 5;
            a.reflexes += 3;
            a.tech += 3;
            a.intelligence += 4;
          },
          seed,
        ),
      [
        introDeliveredFighting,
        {
          kind: "arc",
          arc: act1Arc,
          entry: "a1-start",
          choices: [
            "follow",
            "about-spike",
            "on-to-business",
            "descend",
            "to-den",
            "knock", // street-exclusive scene: culvert + relay knowledge
            "back",
            "browse",
            "buy-gills", // credits-gated enhancement purchase
            "done",
            "leave",
          ],
        },
        {
          kind: "do",
          run(state) {
            const loadout = installEnhancement(
              state.player,
              state.inventory,
              "cyb-silt-gills",
            );
            return {
              ...state,
              player: loadout.character,
              inventory: loadout.inventory,
            };
          },
        },
        {
          kind: "arc",
          arc: act1Arc,
          entry: "a1-ferrow",
          choices: [
            "oath", // commit: act1-side open -> court
            "to-gate",
            "culvert", // enhancement + flag gate skips the gate fight
            "take-key",
            "mark",
            "back",
            "court",
            "inner-key", // key item varies the climax battle
            "face-custodian",
            "light-it",
            "rest",
          ],
        },
      ],
    );

    expect(endings).toEqual(["job-done", "act1-court"]);
    expect(state.flags["act1-outcome"]).toBe("court");
    expect(state.flags["act1-complete"]).toBe(true);
    expect(state.flags["ally-cistern-court"]).toBe(true);
    expect(state.flags["court-oath"]).toBe(true);
    expect(state.flags["act1-side"]).toBe("court");
    expect(state.flags["undertow-stopped"]).toBe(true);
    expect(state.flags["gate-route"]).toBe("culvert");
    // The gate fight never happened; the climax was the inner-route battle.
    expect(state.flags["combat:enc-pump-gate"]).toBeUndefined();
    expect(state.flags["combat:enc-pumpworks-inner"]).toBe("victory");
    expect(hasItem(state.inventory, "msc-override-key")).toBe(true);
    expect(state.flags["betrayed-court"]).toBeUndefined();
    expect(state.location).toBe("greywater-steps");
  });

  it("voss route: corp analyst bluffs, badges through, and sells the ledger", () => {
    const { state, endings } = findRouteSeed(
      (seed) =>
        makeState(
          "tower-analyst",
          (a) => {
            a.body += 4;
            a.reflexes += 4; // ranged build: the compact pistol carries the fight
            a.cool += 4;
            a.intelligence += 3;
          },
          seed,
        ),
      [
        {
          kind: "arc",
          arc: introArc,
          entry: "start",
          choices: [
            "agree-terms",
            "walk-on",
            "corp-talk",
            "sit-agreed",
            "take-advance",
            "take-job",
            "bluff-scout", // cool 8 gate: the scout fight never happens
            "back-to-bar",
            "hand-over",
          ],
        },
        {
          kind: "arc",
          arc: act1Arc,
          entry: "a1-start",
          choices: [
            "follow",
            "about-spike",
            "on-to-business",
            "glasshouse",
            "audit-cadence", // corp-exclusive scene: the duty pass
            "walk-up",
            "take-deal", // commit: act1-side open -> voss
            "descend",
            "to-gate",
            "pass", // item gate skips the gate fight
            "siphon-deal",
            "back",
            "voss",
            "proceed",
            "fight", // climax varies: Court defenders, not Auric
            "burn-sable",
            "sign",
          ],
        },
      ],
    );

    expect(endings).toEqual(["job-done", "act1-voss"]);
    expect(state.flags["act1-outcome"]).toBe("voss");
    expect(state.flags["act1-complete"]).toBe(true);
    expect(state.flags["ally-voss"]).toBe(true);
    expect(state.flags["act1-side"]).toBe("voss");
    expect(state.flags["sable-burned"]).toBe(true);
    expect(state.flags["undertow-delayed"]).toBe(true);
    // Mutually exclusive ally: committing to Voss locked the Court oath out.
    expect(state.flags["court-oath"]).toBeUndefined();
    expect(state.flags["ally-cistern-court"]).toBeUndefined();
    // Both the intro scout fight and the gate fight were avoided.
    expect(state.flags["scout-outcome"]).toBe("bluffed");
    expect(state.flags["combat:enc-auric-scout"]).toBeUndefined();
    expect(state.flags["gate-route"]).toBe("pass");
    expect(state.flags["combat:enc-pump-gate"]).toBeUndefined();
    expect(state.flags["combat:enc-pumpworks-voss"]).toBe("victory");
    expect(hasItem(state.inventory, "msc-auric-writ")).toBe(true);
    expect(state.credits).toBeGreaterThanOrEqual(300);
  });

  it("broadcast route: grid diver keeps the spike and lights every screen", () => {
    const { state, endings } = findRouteSeed(
      (seed) =>
        makeState(
          "grid-diver",
          (a) => {
            a.body += 5;
            a.reflexes += 5;
            a.intelligence += 5;
          },
          seed,
        ),
      [
        {
          kind: "arc",
          arc: introArc,
          entry: "start",
          choices: [
            "go-cold",
            "walk-on",
            "pay-cover",
            "sit-cold",
            "hear-out",
            "take-job",
            "jump-scout",
            "back-to-bar",
            "keep-spike", // the cracked spike stays in the jacket
          ],
        },
        {
          kind: "arc",
          arc: act1Arc,
          entry: "a1-start",
          choices: [
            "follow",
            "show-spike", // item gate: confess the only copy
            "on-to-business",
            "descend",
            "to-shrine",
            "jack-in", // net-exclusive scene: Hex, Voss's byline, the Crown
            "ask-crown",
            "surface",
          ],
        },
        {
          kind: "arc",
          arc: act1Arc,
          entry: "a1-pumpgate",
          choices: [
            "hex", // tech-ally gate skips the gate fight
            "scout",
            "back",
            "crown-open", // lone route: commits to neither faction
            "own-copy",
            "fight",
            "name-author",
            "vanish",
          ],
        },
      ],
    );

    expect(endings).toEqual(["kept-it", "act1-broadcast"]);
    expect(state.flags["act1-outcome"]).toBe("broadcast");
    expect(state.flags["act1-complete"]).toBe(true);
    expect(state.flags["wanted-by-auric"]).toBe(true);
    expect(state.flags["voss-exposed"]).toBe(true);
    expect(state.flags["only-copy"]).toBe(true);
    // Committed to nobody; both faction flags stayed unset.
    expect(state.flags["act1-side"]).toBe("open");
    expect(state.flags["ally-cistern-court"]).toBeUndefined();
    expect(state.flags["ally-voss"]).toBeUndefined();
    expect(state.flags["gate-route"]).toBe("hex");
    expect(state.flags["combat:enc-pump-gate"]).toBeUndefined();
    expect(state.flags["combat:enc-relay-crown"]).toBe("victory");
    // The broadcast consumed the spike, and travel ended the chapter topside.
    expect(hasItem(state.inventory, "msc-cracked-spike")).toBe(false);
    expect(state.location).toBe("cinder-plaza");
  });
});
