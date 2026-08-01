import type { ConsumableItem } from "../inventory/items";

/**
 * What a runner opens, and what it costs them.
 *
 * Four families, and each one answers a different question the fight
 * or the walk between fights asks:
 *
 *  - **Stims** are a combat action spent instead of a swing. Every one
 *    of them lifts a stat for a few turns and then hands the bill back
 *    (see TimedEffect.after), so taking one is a bet that the fight
 *    ends inside the lift. They never heal — a stim is not a way out of
 *    being hurt, it is a way of hitting harder while you are.
 *  - **Street food** is the cheap end and the out-of-combat end: a
 *    small heal now, and a small lift held over for the next fight.
 *    Nobody eats noodles with a chassis walking at them, so food is
 *    exploration-only by construction.
 *  - **Field kits** are the real out-of-combat healing, and the splint
 *    kit is the only way to close a wound without a clinic. They cost
 *    accordingly.
 *  - **The oddity** is one thing, and it does one strange small thing.
 *
 * ## What the prices are reasoning about
 *
 * Every figure below is quoted against the shelf the economy already
 * has: a Trauma Patch is 20cr for 10 HP, which sets the street rate at
 * **2cr per point of healing**, and a Surge Stim is 30cr for three
 * turns of +2 Reflexes.
 *
 *  - **Food is cheap per dose, not per point.** A skewer is 5 HP for
 *    10cr — exactly the street rate, and the cheapest single thing on
 *    any counter, which is the point of a cart: it is what somebody
 *    with eleven credits can afford. A bowl of noodles is the one line
 *    that beats the patch on rate (9 HP for 16cr), and the salt tea is
 *    deliberately the worst healing in the game, because what it sells
 *    is the readied lift. Those lifts are worth roughly a third of a
 *    stim (+1 for 3–6 turns, no crash) at roughly a third of the price.
 *    Nothing on a cart goes below 10cr: under that the resale spread
 *    collapses into the buy price and the economy's no-arbitrage sweep
 *    fails outright (see the note in ITEM_VALUES).
 *  - **The big kits cost more per point, not less.** A Medic's Roll is
 *    20 HP for 80cr — 4cr/HP, twice the patch's rate — because it is
 *    one item instead of two and because it cannot be opened in a
 *    fight. You are buying the ability to walk into the next room
 *    whole, not the ability to survive this one.
 *  - **The splint kit is priced against the clinic, not against HP.**
 *    Patch charges 45–80cr to close a wound (see src/data/injuries.ts)
 *    and is a walk across the city away; 150cr buys the same result in
 *    the corridor you are standing in, once. Deliberately worse value
 *    than the clinic and deliberately available when the clinic is not.
 *  - **Stims are priced on lift × turns, discounted by the crash.** The
 *    Kick is the cheap disposable one, the Surge is the standard, and
 *    Redline costs nearly twice the Surge for one more point and a
 *    crash that outlasts the lift. Nothing here is a strict upgrade of
 *    anything else: the whole reflex family shares one slot, so the
 *    expensive one is a *replacement*, not an addition.
 *
 * Prices live in ITEM_VALUES (src/data/economy.ts) like every other
 * item's, and the economy sweep tests them there.
 */
export const consumableItems: ConsumableItem[] = [
  /* --- Battlefield dressing ------------------------------------------
   * The one thing that works either side of a fight, and the reason
   * every other family has a context worth stating. 2cr per point of
   * healing is the street rate everything below is quoted against. */
  {
    id: "con-trauma-patch",
    kind: "consumable",
    consumableKind: "kit",
    name: "Trauma Patch",
    description:
      "A slap-on dermal pack of coagulants and synth-endorphins. Hurts " +
      "going on, then nothing hurts at all.",
    contexts: ["combat", "exploration"],
    effects: [{ type: "heal", amount: 10 }],
  },

  /* --- Stims ----------------------------------------------------------
   * Combat-only, and every one of them borrows. The crash lands in the
   * same family as the lift, which is what makes re-dosing push the
   * bill back rather than double it — and what makes the family a real
   * decision rather than a shelf of strictly-better bottles. */
  {
    id: "con-kick-stim",
    kind: "consumable",
    consumableKind: "stim",
    name: "Kick",
    description:
      "A vending-machine ampoule off a clinic wall, dosed for a night " +
      "shift rather than a firefight. Cheap, honest, and over quickly.",
    contexts: ["combat"],
    // The disposable one: half a Surge's lift for two-thirds its price,
    // and a crash short enough to walk off inside the same fight.
    effects: [
      {
        type: "boost",
        boost: {
          family: "reflex-stim",
          stat: "reflexes",
          amount: 1,
          turns: 3,
          after: { stat: "reflexes", amount: -1, turns: 1 },
        },
      },
    ],
  },
  {
    id: "con-surge-stim",
    kind: "consumable",
    consumableKind: "stim",
    name: "Surge Stim",
    description:
      "A single-use injector of gray-market reflex accelerant. The crash " +
      "afterward is somebody else's problem, right up until it is yours.",
    contexts: ["combat"],
    // The standard: three turns of +2 for 30cr, and two turns of −1
    // afterwards. A fight settled inside three turns pays nothing.
    effects: [
      {
        type: "boost",
        boost: {
          family: "reflex-stim",
          stat: "reflexes",
          amount: 2,
          turns: 3,
          after: { stat: "reflexes", amount: -1, turns: 2 },
        },
      },
    ],
  },
  {
    id: "con-redline-amp",
    kind: "consumable",
    consumableKind: "stim",
    name: "Redline Amp",
    description:
      "A dockworker's amp cracked open and rewound past its governor. " +
      "Everything gets very simple for about a minute, and then it sends " +
      "the bill.",
    contexts: ["combat"],
    // Nearly twice a Surge for one more point and a crash that outlasts
    // the lift — a closer, not an opener. Sharing the reflex family
    // means an early Kick is *displaced* by it rather than added to.
    effects: [
      {
        type: "boost",
        boost: {
          family: "reflex-stim",
          stat: "reflexes",
          amount: 3,
          turns: 3,
          after: { stat: "reflexes", amount: -2, turns: 4 },
        },
      },
    ],
  },
  {
    id: "con-hammerhead",
    kind: "consumable",
    consumableKind: "stim",
    name: "Hammerhead",
    description:
      "A cargo-crew brace shot: it tells the frame to stop reporting " +
      "strain and the frame, obligingly, stops. What it was reporting " +
      "does not go anywhere.",
    contexts: ["combat"],
    // The other slot. Body drives what a swung weapon lands for, so
    // this is the melee runner's Surge — priced the same, crashing the
    // same, and stacking *with* a reflex stim because it occupies a
    // different nerve.
    effects: [
      {
        type: "boost",
        boost: {
          family: "bone-stim",
          stat: "body",
          amount: 2,
          turns: 3,
          after: { stat: "body", amount: -1, turns: 2 },
        },
      },
    ],
  },

  /* --- Street food ----------------------------------------------------
   * Cheap, out-of-combat, and the only thing in the game that buys a
   * fight before the fight starts. One family between all of them: you
   * can eat all night and you are still just somebody who has eaten. */
  {
    id: "con-scrap-skewer",
    kind: "consumable",
    consumableKind: "food",
    name: "Wire-Grill Skewer",
    description:
      "Something farmed in a cistern, cubed onto a spoke and held over a " +
      "gas ring until the outside argues. Ten credits, no questions, and " +
      "the vendor watches you eat it.",
    contexts: ["exploration"],
    // The cheapest thing on any counter, and priced at exactly the
    // street rate for its healing (10cr, 5 HP) — the readied +1 Body is
    // thrown in, which is what a cart is for.
    effects: [
      { type: "heal", amount: 5 },
      {
        type: "ready-boost",
        boost: { family: "well-fed", stat: "body", amount: 1, turns: 3 },
      },
    ],
  },
  {
    id: "con-cage-noodles",
    kind: "consumable",
    consumableKind: "food",
    name: "Cage-Lamp Noodles",
    description:
      "A bowl off a hot bar under the market lamps: broth the colour of " +
      "rust, noodles the colour of nothing, and enough chili oil on top " +
      "to make the whole arrangement a decision.",
    contexts: ["exploration"],
    // The proper meal, and the only thing in the game that beats the
    // patch on rate: 9 HP for 16cr (1.8cr/HP), plus a longer readied
    // lift than the skewer's, on the stat that keeps you first to move.
    effects: [
      { type: "heal", amount: 9 },
      {
        type: "ready-boost",
        boost: { family: "well-fed", stat: "reflexes", amount: 1, turns: 4 },
      },
    ],
  },
  {
    id: "con-basin-tea",
    kind: "consumable",
    consumableKind: "food",
    name: "Basin Salt Tea",
    description:
      "Boiled black, salted heavily, and sold in a cup you give back. " +
      "Dock crews drink it because it is hot and because standing still " +
      "holding it counts as a break.",
    contexts: ["exploration"],
    // Barely heals, and is not meant to: at 12cr for 3 HP it is the
    // worst healing in the game, and what you are actually buying is
    // the longest readied lift on any cart.
    effects: [
      { type: "heal", amount: 3 },
      {
        type: "ready-boost",
        boost: { family: "well-fed", stat: "reflexes", amount: 1, turns: 6 },
      },
    ],
  },

  /* --- Field kits -----------------------------------------------------
   * Where the real out-of-combat healing lives, and where the only
   * non-clinic answer to a wound is. The two big ones cost more per
   * point than a Trauma Patch does, and that is the trade: they buy the
   * ability to walk into the next room whole rather than the ability to
   * survive this one, and neither can be opened under fire.
   *
   * The Vent-Crew kit is the deliberate exception and keeps the reach
   * it has always had: it is a wall box of burn gel and splint tape,
   * the thing a crew grabs *during* the emergency, and half the fights
   * in the game already pay out in them (see src/data/encounters.ts).
   * Narrowing it now would quietly retune balance the whole campaign is
   * tuned against, for no gain the two new kits do not already give. */
  {
    id: "con-field-kit",
    kind: "consumable",
    consumableKind: "kit",
    name: "Vent-Crew Field Kit",
    description:
      "A cycler crew's wall-box kit: burn gel, splint tape, and a stimulant " +
      "lozenge older than the shift roster. All of it still works.",
    contexts: ["combat", "exploration"],
    // The entry kit: 12 HP for 45cr. Deliberately the worst rate on the
    // shelf — it is what you buy before you can afford a proper roll.
    effects: [{ type: "heal", amount: 12 }],
  },
  {
    id: "con-medic-roll",
    kind: "consumable",
    consumableKind: "kit",
    name: "Medic's Roll",
    description:
      "A canvas roll of bonded clinic stock: sealed sutures, a plasma " +
      "sleeve, and a pressure cuff with somebody else's name inked out " +
      "of the strap. Twenty minutes and a place to sit.",
    contexts: ["exploration"],
    // 20 HP for 80cr — 4cr/HP, twice the patch's rate, and the reason
    // to carry it is that it is one item instead of two.
    effects: [{ type: "heal", amount: 20 }],
  },
  {
    id: "con-splint-kit",
    kind: "consumable",
    consumableKind: "kit",
    name: "Splint & Seal Kit",
    description:
      "A rig-medic's kit for the injuries that happen four levels from a " +
      "door: traction splint, seal foam, and a nerve block that will let " +
      "you pretend for exactly as long as it takes to walk out.",
    contexts: ["exploration"],
    // Priced against the clinic, not against HP: Patch charges 45–80cr
    // to close a wound and is a walk across the city away. 150cr buys
    // the same result in the corridor you are standing in, once. The
    // 8 HP on top is dressing, not the product.
    effects: [{ type: "heal", amount: 8 }, { type: "treat-injury" }],
  },

  /* --- The oddity -----------------------------------------------------
   * One item, one strange small thing, and no family of its own. */
  {
    id: "con-wake-sugar",
    kind: "consumable",
    consumableKind: "oddity",
    name: "Wake Sugar",
    description:
      "A pressed sugar tablet handed out at Undercroft wakes, stamped " +
      "with a name the mould has worn illegible. Nobody sells them; " +
      "everybody has one. The Weave-deaf swear the chrome goes quiet " +
      "for a moment when it dissolves, and the chromed do not argue.",
    contexts: ["combat"],
    // The one thing that answers a screaming Static band without giving
    // up a turn's movement, and the one thing that ends a crash early.
    // Small on purpose: the surge clock *restarts*, so it buys turns
    // rather than cancelling the fight's whole complication.
    effects: [{ type: "settle" }],
  },
];
