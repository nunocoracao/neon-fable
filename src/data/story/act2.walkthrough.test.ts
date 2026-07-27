import { describe, expect, it } from "vitest";
import { hasItem } from "../../inventory";
import { act1Arc } from "./act1";
import { act2Arc } from "./act2";
import { introArc } from "./intro";
import {
  equipStep,
  findRouteSeed,
  healStep,
  installStep,
  makeState,
  type RouteStep,
} from "./walkthroughSupport";

/**
 * Scripted end-to-end walkthroughs of the three Act 2 branches, each
 * played from character creation through the intro and its Act 1 route
 * first — so every act1-outcome driven into Act 2 is a real recorded
 * state, not a synthetic one. Each route lands on a distinct Act 2
 * outcome and asserts the distinguishing flags, allies, and bites.
 * Between fights the routes heal, shop, and equip the way a real player
 * would (healStep / equipStep / installStep from walkthroughSupport).
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

/** Act 1 court route: street kid, culvert entry, inner-key climax. */
const act1CourtRoute: RouteStep[] = [
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
      "knock",
      "back",
      "browse",
      "buy-gills",
      "done",
      "leave",
    ],
  },
  installStep("cyb-silt-gills"),
  {
    kind: "arc",
    arc: act1Arc,
    entry: "a1-ferrow",
    choices: [
      "oath",
      "to-gate",
      "culvert",
      "take-key",
      "mark",
      "back",
      "court",
      "inner-key",
      "face-custodian",
      "light-it",
      "rest",
    ],
  },
];

/** Act 1 voss route: corp analyst, badge-through, ledger sold. */
const act1VossRoute: RouteStep[] = [
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
      "bluff-scout",
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
      "audit-cadence",
      "walk-up",
      "take-deal",
      "descend",
      "to-gate",
      "pass",
      "siphon-deal",
      "back",
      "voss",
      "proceed",
      "fight",
      "burn-sable",
      "sign",
    ],
  },
];

/**
 * Act 1 broadcast route with a betrayal in it: grid diver keeps the
 * spike, takes Voss's deal, then burns it at the Relay Crown — ending
 * wanted AND betrayed-voss, the worst state Act 2 has to honor.
 */
const act1BetrayalRoute: RouteStep[] = [
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
      "keep-spike",
    ],
  },
  {
    kind: "arc",
    arc: act1Arc,
    entry: "a1-start",
    choices: [
      "follow",
      "show-spike",
      "on-to-business",
      "glasshouse",
      "liaison",
      "take-deal",
      "descend",
      "to-shrine",
      "jack-in",
      "ask-crown",
      "surface",
    ],
  },
  {
    kind: "arc",
    arc: act1Arc,
    entry: "a1-pumpgate",
    choices: [
      "hex",
      "siphon-deal",
      "back",
      "crown-betray-voss",
      "own-copy",
      "fight",
      "name-author",
      "vanish",
    ],
  },
];

describe("act2 walkthroughs", () => {
  it("court opening: the sappers' tunnel, the ducts, and severance", () => {
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
        ...act1CourtRoute,
        healStep(),
        {
          kind: "arc",
          arc: act2Arc,
          entry: "a2-start",
          choices: [
            "court", // gated on act1-outcome = court
            "descend", // the thieves' chain exists because of ally-cistern-court
            "ask-cyclers",
            "back",
            "accept",
            "tunnel-supplied", // Ferrow's kit + the sappers' tunnel skip the gate
            "up",
            "crew",
            "street-knock", // street-exclusive scene: the ducts and the den warning
            "back",
            "vault",
            "ducts", // non-combat route past the vent crawler
            "take",
            "core",
            "breach-court", // climax variant keyed on a2-approach = court
            "spool",
            "sever-court", // ending gated on the Court alliance
            "throw",
          ],
        },
      ],
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
      (seed) =>
        makeState(
          "tower-analyst",
          (a) => {
            a.body += 5;
            a.reflexes += 6;
            a.cool += 4;
          },
          seed,
        ),
      [
        ...act1VossRoute,
        healStep(),
        {
          kind: "arc",
          arc: act2Arc,
          entry: "a2-start",
          choices: [
            "voss", // gated on act1-outcome = voss
            "glasshouse",
            "terms",
            "lin", // corp-exclusive scene: the mandate spool, early
            "back",
            "filament", // sable-burned comes back to bite
            "back",
            "go", // Voss's retainer kit rides along
            "writ", // the Act 1 writ opens the front gate — no fight
          ],
        },
        healStep(),
        {
          kind: "arc",
          arc: act2Arc,
          entry: "a2-vent-arrival",
          choices: [
            "gallery",
            "read",
            "back",
            "core",
            "breach-voss", // climax variant keyed on a2-approach = voss
            "console",
            "takeover", // ending gated on ally-voss
            "uplink",
          ],
        },
      ],
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
      (seed) =>
        makeState(
          "grid-diver",
          (a) => {
            a.body += 5;
            a.reflexes += 5;
            a.tech += 1;
            a.intelligence += 4;
          },
          seed,
        ),
      [
        ...act1BetrayalRoute,
        {
          kind: "arc",
          arc: act2Arc,
          entry: "a2-start",
          choices: [
            "lone", // gated on act1-outcome = broadcast
            "follow", // Patch's trauma patches, aunt-fashion
            "hex", // Hex earned in Act 1 moves into the Exchange
            "back",
          ],
        },
        healStep(),
        {
          kind: "arc",
          arc: act2Arc,
          entry: "a2-lone-safehouse",
          choices: [
            "move-voss", // betrayed-voss bites: Voss's collectors are waiting
            "fight",
          ],
        },
        {
          kind: "arc",
          arc: act2Arc,
          entry: "a2-lone-approach",
          choices: [
            "patch-veil",
            "buy", // credits-gated enhancement purchase
            "buy-patch",
            "buy-patch",
            "buy-patch",
            "buy-patch",
            "done",
          ],
        },
        installStep("cyb-static-veil"),
        healStep(),
        {
          kind: "arc",
          arc: act2Arc,
          entry: "a2-lone-approach",
          choices: [
            "veil-walk", // enhancement gate beats the wanted-by-auric scanners
            "in",
            "gallery",
            "dive", // net-exclusive scene: the ducts and the proxy's secret
            "surface",
            "vault",
            "ducts",
            "take",
          ],
        },
        equipStep("wpn-arc-lash"),
        healStep(),
        {
          kind: "arc",
          arc: act2Arc,
          entry: "a2-vent-arrival",
          choices: [
            "core",
            "breach-lone", // climax variant keyed on a2-approach = lone
            "gloat", // voss-exposed callback: Halex says thank you
            "spool",
            "charter", // ending gated on the mandate spool
            "walk-out",
          ],
        },
      ],
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
