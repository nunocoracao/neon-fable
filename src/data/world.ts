/**
 * What the city has noticed.
 *
 * The story writes flags; districts read them. This file is the whole
 * vocabulary of that reading: a catalog of named **world conditions**
 * (each one nothing but a bundle of ordinary Requirements), and three
 * registries of what a live condition changes — who is standing on a
 * map, what the public screens are saying, and what a vendor will sell
 * you.
 *
 * ## Why conditions are Requirement bundles
 *
 * A condition is deliberately not a new kind of gate. It is a name for
 * a `Requirement[]` the engine already knows how to evaluate, which
 * buys two things at once: the derivation layer (src/world/state.ts)
 * needs no evaluator of its own beyond `checkRequirements`, and story
 * data can gate a choice on a condition by spreading the same array
 * into the choice's own requirements — so a scene's live choices and the
 * selectors that read the same condition can never drift apart.
 *
 * ## What a reaction may do
 *
 * Scene reactions extend ./mapDressing.ts's rule (which can only
 * rewrite an interactable in place) with the two moves it deliberately
 * refused: putting somebody new on a map and taking somebody off it.
 * That is a bigger promise, so the placement rules the map lint is
 * written against — walkable, unobstructed, reachable, clear of the
 * ambient crowd's zones — are re-checked against every reachable
 * *populated* map in world.test.ts rather than only against the
 * authored one.
 *
 * All of it is content. The pure joins live in src/world/.
 */
import type { Requirement } from "../narrative/types";
import type { Interactable } from "../iso/tilemap";
import { castVisual } from "./cast";
import type { ItemCondition, VendorId } from "./economy";

export type { VendorId };

/* ------------------------------------------------------------------ *
 * Conditions
 * ------------------------------------------------------------------ */

/**
 * Every state of the world a district can react to. Ids read as
 * sentences about the city rather than as flag names, because the flag
 * behind one is an implementation detail a reaction should not have to
 * know: `stalls-shuttered` stays true through a re-tune of which beat
 * shutters them.
 */
export type WorldConditionId =
  | "package-delivered"
  | "package-loose"
  | "streets-calm"
  | "stalls-shuttered"
  | "court-ascendant"
  | "syndicate-street"
  | "broadcast-loose"
  | "cordon-broken"
  | "warrant-out"
  | "warrant-clear"
  | "spire-hardened"
  | "market-favoured"
  | "charter-signed"
  | "regency-risen"
  | "steps-free"
  | "basin-partnered"
  | "auditor-recruited"
  | "city-settled";

export interface WorldCondition {
  id: WorldConditionId;
  /** Short human name, for dev tooling and test failure messages. */
  label: string;
  /**
   * The map this condition mainly speaks about, or "city" for the ones
   * every district reads. Documentation and lint only — nothing
   * resolves a reaction's map through it.
   */
  district: string;
  /** Live exactly while all of these pass against GameState. */
  requirements: readonly Requirement[];
}

export const WORLD_CONDITIONS: readonly WorldCondition[] = [
  {
    id: "package-delivered",
    label: "The spike went to Sable",
    district: "city",
    requirements: [{ type: "flag-equals", key: "spike-delivered", value: true }],
  },
  {
    id: "package-loose",
    label: "The spike never surfaced",
    district: "city",
    requirements: [{ type: "flag-equals", key: "kept-spike", value: true }],
  },
  {
    // The complement of package-loose, so a vendor's ordinary price and
    // its grey-market price can both be authored as positive gates.
    id: "streets-calm",
    label: "Nobody is looking for a spike",
    district: "city",
    requirements: [
      { type: "flag-not-equals", key: "kept-spike", value: true },
    ],
  },
  {
    // "For an act": the shutters come down the night the courier job
    // lands and go back up when Act 1 closes over it.
    id: "stalls-shuttered",
    label: "The wet market has its shutters down",
    district: "cinder-plaza",
    requirements: [
      { type: "flag-equals", key: "spike-delivered", value: true },
      { type: "flag-unset", key: "act1-complete" },
    ],
  },
  {
    id: "court-ascendant",
    label: "The Cistern Court took Act 1",
    district: "greywater-steps",
    requirements: [{ type: "flag-equals", key: "act1-outcome", value: "court" }],
  },
  {
    id: "syndicate-street",
    label: "Voss took Act 1",
    district: "cinder-plaza",
    requirements: [{ type: "flag-equals", key: "act1-outcome", value: "voss" }],
  },
  {
    id: "broadcast-loose",
    label: "The Undertow files went out over the air",
    district: "city",
    requirements: [
      { type: "flag-equals", key: "act1-outcome", value: "broadcast" },
    ],
  },
  {
    id: "cordon-broken",
    label: "The Cordon is down",
    district: "cinder-plaza",
    requirements: [{ type: "flag-equals", key: "cordon-broken", value: true }],
  },
  {
    id: "warrant-out",
    label: "Auric wants you retrieved",
    district: "auric-spire",
    requirements: [{ type: "flag-equals", key: "wanted-by-auric", value: true }],
  },
  {
    // Not the mirror of a missing flag: Act 2's charter rewrites the
    // warrant to `false` rather than clearing it, so "not wanted" is
    // two states and only flag-not-equals can name both.
    id: "warrant-clear",
    label: "No warrant stands against you",
    district: "auric-spire",
    requirements: [
      { type: "flag-not-equals", key: "wanted-by-auric", value: true },
    ],
  },
  {
    id: "spire-hardened",
    label: "Auric has gone cold on you",
    district: "auric-spire",
    requirements: [
      { type: "reputation", factionId: "auric", value: "cold", mode: "at-most" },
    ],
  },
  {
    id: "market-favoured",
    label: "The boards trade with you",
    district: "vertical-market",
    requirements: [
      { type: "reputation", factionId: "market", value: "warm" },
    ],
  },
  {
    id: "charter-signed",
    label: "The Undercroft charter holds",
    district: "greywater-steps",
    requirements: [
      { type: "flag-equals", key: "undercroft-charter", value: true },
    ],
  },
  {
    id: "regency-risen",
    label: "Voss sits in the Combine's chair",
    district: "cinder-plaza",
    requirements: [{ type: "flag-equals", key: "voss-ascendant", value: true }],
  },
  {
    id: "steps-free",
    label: "Greywater answers to nobody",
    district: "greywater-steps",
    requirements: [
      { type: "flag-equals", key: "steps-independent", value: true },
    ],
  },
  {
    id: "basin-partnered",
    label: "The Longshore runs are yours in part",
    district: "flooded-quays",
    requirements: [
      { type: "flag-equals", key: "under-waterline-partner", value: true },
    ],
  },
  {
    id: "auditor-recruited",
    label: "Sill left his pitch to walk with you",
    district: "vertical-market",
    requirements: [{ type: "flag-set", key: "sill-joined" }],
  },
  {
    id: "city-settled",
    label: "The succession is over",
    district: "city",
    requirements: [{ type: "flag-equals", key: "game-complete", value: true }],
  },
];

const CONDITIONS_BY_ID: ReadonlyMap<string, WorldCondition> = new Map(
  WORLD_CONDITIONS.map((condition) => [condition.id, condition]),
);

export function getCondition(id: string): WorldCondition | undefined {
  return CONDITIONS_BY_ID.get(id);
}

export function requireCondition(id: WorldConditionId): WorldCondition {
  const condition = CONDITIONS_BY_ID.get(id);
  if (!condition) throw new Error(`Unknown world condition "${id}"`);
  return condition;
}

/**
 * The gate behind a condition, ready to be spread into a Choice's own
 * requirements. This is the seam that keeps a shop honest: the same
 * array the derivation layer evaluates is the one the choice carries.
 */
export function conditionRequirements(
  ...ids: readonly WorldConditionId[]
): Requirement[] {
  return ids.flatMap((id) => [...requireCondition(id).requirements]);
}

/* ------------------------------------------------------------------ *
 * Scene reactions: who is standing where
 * ------------------------------------------------------------------ */

/**
 * Somebody a condition puts on a map. Shaped as the Interactable it
 * becomes minus the things a reaction may not invent: a spawn is always
 * a person you can talk to, never a way out of the district and never
 * an object, so the map's exit machinery and arena rules are untouched
 * by construction.
 */
export interface WorldNpcSpawn {
  id: string;
  x: number;
  y: number;
  label: string;
  /** Dialogue node the spawn opens; authored in ./story/streets.ts. */
  nodeId: string;
  /** Cast name whose authored look this spawn wears. */
  speaker: string;
}

/** A rewrite of an interactable already on the map, keyed by condition. */
export interface WorldDressing {
  interactableId: string;
  label?: string;
  nodeId?: string;
}

/**
 * One district's answer to one condition. A reaction may put people on
 * the map, take people off it, and re-label or re-point what stays —
 * the three moves that make a street read as having noticed.
 */
export interface SceneReaction {
  id: string;
  conditionId: WorldConditionId;
  mapId: string;
  /** One line on what the player is meant to read off the street. */
  note: string;
  spawn?: readonly WorldNpcSpawn[];
  /** Interactable ids to take off the map while the condition holds. */
  despawn?: readonly string[];
  dress?: readonly WorldDressing[];
}

export const SCENE_REACTIONS: readonly SceneReaction[] = [
  {
    id: "row-shutters",
    conditionId: "stalls-shuttered",
    mapId: "cinder-plaza",
    note:
      "Inspectors work the row the week the spike changes hands: the " +
      "vendor deals from under the counter and a Combine server stands " +
      "at the head of the stalls reading names off a board.",
    spawn: [
      {
        id: "hub-picket",
        x: 11,
        y: 5,
        label: "Combine notice-server",
        nodeId: "st-picket",
        speaker: "Combine Notice-Server",
      },
    ],
    // Both kinds of rewrite the dressing machinery allows, on one
    // interactable: the prompt names what the player can already see,
    // and the scene behind it is the shuttered variant rather than the
    // ordinary stall — which every route out of leads back to, because
    // the row is quieter, not closed.
    dress: [
      {
        interactableId: "market-vendor",
        label: "Wet-market vendor — shutters down",
        nodeId: "wet-market-shuttered",
      },
    ],
  },
  {
    id: "row-under-the-syndicate",
    conditionId: "syndicate-street",
    mapId: "cinder-plaza",
    note:
      "Voss's people keep their own watch on the plaza once the Row is " +
      "theirs — nobody official, and nobody who moves when you look.",
    spawn: [
      {
        id: "hub-syndicate-watch",
        x: 5,
        y: 9,
        label: "Syndicate watch",
        nodeId: "st-syndicate-watch",
        speaker: "Syndicate Watch",
      },
    ],
  },
  {
    id: "row-court-runners",
    conditionId: "court-ascendant",
    mapId: "cinder-plaza",
    note:
      "The Cistern Court works the surface openly now: a Steps runner " +
      "on the plaza, pinning notices nobody down here has ever had the " +
      "standing to pin.",
    spawn: [
      {
        id: "hub-court-runner",
        x: 10,
        y: 3,
        label: "Steps runner",
        nodeId: "st-court-runner",
        speaker: "Steps Runner",
      },
    ],
  },
  {
    id: "row-listeners",
    conditionId: "broadcast-loose",
    mapId: "cinder-plaza",
    note:
      "With the files loose on the relay, somebody is always under the " +
      "north screen taping what the Combine has not managed to pull yet.",
    spawn: [
      {
        id: "hub-listener",
        x: 8,
        y: 2,
        label: "Listener under the screen",
        nodeId: "st-listener",
        speaker: "Rooftop Listener",
      },
    ],
  },
  {
    id: "row-regency-criers",
    conditionId: "regency-risen",
    mapId: "cinder-plaza",
    note:
      "A regency needs to be said out loud to be a regency, so there is " +
      "somebody in the middle of the glow ring saying it.",
    spawn: [
      {
        id: "hub-crier",
        x: 6,
        y: 3,
        label: "Regency crier",
        nodeId: "st-crier",
        speaker: "Regency Crier",
      },
    ],
  },
  {
    id: "row-runners-pull-back",
    conditionId: "cordon-broken",
    mapId: "cinder-plaza",
    note:
      "The Rustyard crews worked Cinder Row while the Cordon held the " +
      "Exchange shut. With it down there is better money two districts " +
      "over, and the ambusher is simply gone.",
    despawn: ["rust-runner"],
  },
  {
    id: "spire-standing-red",
    conditionId: "spire-hardened",
    mapId: "auric-spire",
    note:
      "Auric reads you cold, and the concourse answers with a second " +
      "body on the gate and a checkpoint where there used to be a floor.",
    spawn: [
      {
        id: "spire-checkpoint",
        x: 9,
        y: 3,
        label: "Concourse checkpoint",
        nodeId: "st-spire-checkpoint",
        speaker: "Spire Security",
      },
    ],
    dress: [
      { interactableId: "spire-security", label: "Spire Security — standing red" },
    ],
  },
  {
    id: "spire-warrant-post",
    conditionId: "warrant-out",
    mapId: "auric-spire",
    note:
      "A live retrieval warrant puts a server on the registry side of " +
      "the gate, with your description and no name to put on it.",
    spawn: [
      {
        id: "spire-warrant-server",
        x: 5,
        y: 3,
        label: "Warrant server",
        nodeId: "st-warrant-post",
        speaker: "Spire Security",
      },
    ],
  },
  {
    id: "market-holds-your-pitch",
    conditionId: "market-favoured",
    mapId: "vertical-market",
    note:
      "Once the boards trade with you, somebody is keeping a place in " +
      "the north aisle warm against your coming back up the stair.",
    spawn: [
      {
        id: "market-runner",
        x: 9,
        y: 4,
        label: "Market runner",
        nodeId: "st-market-runner",
        speaker: "Market Runner",
      },
    ],
  },
  {
    id: "market-takes-the-overflow",
    conditionId: "stalls-shuttered",
    mapId: "vertical-market",
    note:
      "Trade the Row shutters out does not stop; it climbs. A wet-market " +
      "stallholder is working the market's north aisle out of crates.",
    spawn: [
      {
        id: "market-overflow",
        x: 6,
        y: 4,
        label: "Displaced stallholder",
        nodeId: "st-market-overflow",
        speaker: "Displaced Stallholder",
      },
    ],
  },
  {
    id: "market-loses-its-auditor",
    conditionId: "auditor-recruited",
    mapId: "vertical-market",
    note:
      "Sill's rented pitch under the north gallery is empty for as long " +
      "as he is walking with you — he is not in two places.",
    despawn: ["market-auditor"],
  },
  {
    id: "steps-keeps-the-charter",
    conditionId: "charter-signed",
    mapId: "greywater-steps",
    note:
      "A signed charter needs somebody to hold the paper, and the Steps " +
      "put them where everybody walking past can see the desk.",
    spawn: [
      {
        id: "steps-clerk",
        x: 6,
        y: 8,
        label: "Charter clerk",
        nodeId: "st-steps-clerk",
        speaker: "Charter Clerk",
      },
    ],
  },
  {
    id: "steps-stands-its-own-watch",
    conditionId: "steps-free",
    mapId: "greywater-steps",
    note:
      "Severed from the Undercroft, Greywater posts its own watch on " +
      "the pump walk rather than waiting on anybody's patrol.",
    spawn: [
      {
        id: "steps-watch",
        x: 8,
        y: 8,
        label: "Steps watch",
        nodeId: "st-steps-watch",
        speaker: "Steps Watch",
      },
    ],
  },
];

/**
 * The Interactable a spawn becomes. Kept here rather than in the
 * population pass so the shape of a spawned NPC — always an "npc"
 * sprite, always a dialogue interaction, always a minimap pip, never an
 * exit — is a fact about the content, not about the join.
 */
export function spawnInteractable(spawn: WorldNpcSpawn): Interactable {
  const visual = castVisual(spawn.speaker);
  return {
    id: spawn.id,
    x: spawn.x,
    y: spawn.y,
    label: spawn.label,
    spriteId: "npc",
    interaction: { kind: "dialogue", nodeId: spawn.nodeId },
    minimap: true,
    ...(visual ? { visual } : {}),
  };
}

/* ------------------------------------------------------------------ *
 * The news ticker
 * ------------------------------------------------------------------ */

/**
 * Which screens carry a headline. The civic channel is the Row's public
 * signage; the market channel is the boards over the aisles, which talk
 * about prices and about themselves.
 */
export type NewsChannelId = "civic" | "market";

export const NEWS_CHANNELS: readonly NewsChannelId[] = ["civic", "market"];

export interface Headline {
  id: string;
  channel: NewsChannelId;
  /**
   * The line as it scrolls. The ticker is drawn in the pixel readout
   * font, which knows letters, digits, a space, and the two signs — so
   * headlines are authored in that alphabet and nothing is silently
   * dropped (world.test.ts pins it).
   */
  text: string;
  /** Carried only while every one of these conditions is live. */
  requires?: readonly WorldConditionId[];
  /** Dropped while any one of these is live. */
  absent?: readonly WorldConditionId[];
}

export const NEWS_HEADLINES: readonly Headline[] = [
  // --- The city's standing filler: true in every run, so a screen is
  // never blank and a run that has changed nothing still reads as a
  // city that talks to itself.
  {
    id: "overline-timetable",
    channel: "civic",
    text: "CINDER OVERLINE RUNNING TO A REVISED TIMETABLE UNTIL FURTHER NOTICE",
  },
  {
    id: "surge-warning",
    channel: "civic",
    text: "STORM SURGE WARNING REMAINS IN FORCE FOR ALL LEVELS BELOW THE WATERLINE",
  },
  {
    id: "combine-quarter",
    channel: "civic",
    text: "MERIDIAN COMBINE REPORTS A NINTH CONSECUTIVE QUARTER OF GROWTH",
    absent: ["city-settled"],
  },
  {
    id: "clinic-inspections",
    channel: "civic",
    text: "UNLICENSED CHROME CLINICS FACE INSPECTION UNDER THE REVISED CIVIC ORDER",
  },
  {
    id: "market-hours",
    channel: "market",
    text: "THE VERTICAL MARKET TRADES THROUGH THE NIGHT AS IT HAS SINCE THE FLOOD",
  },
  {
    id: "salvage-plate",
    channel: "market",
    text: "SALVAGE PLATE UP ELEVEN PERCENT ON THE OPEN BOARDS",
  },
  // --- The courier job.
  {
    id: "asset-recovered",
    channel: "civic",
    text: "AURIC CONFIRMS RECOVERY OF A DATA ASSET LOST IN THE UNDERCROFT",
    requires: ["package-delivered"],
  },
  {
    id: "asset-missing",
    channel: "civic",
    text: "AURIC POSTS AN OFFER FOR PROPERTY MISSING SINCE THE UNDERCROFT SWEEP",
    requires: ["package-loose"],
  },
  {
    id: "row-shuttered",
    channel: "civic",
    text: "WET MARKET TRADERS SHUTTER STALLS AS INSPECTORS WORK CINDER ROW",
    requires: ["stalls-shuttered"],
  },
  {
    id: "trade-climbs",
    channel: "market",
    text: "STREET TRADE MOVES UPSTAIRS AS THE ROW BELOW GOES DARK",
    requires: ["stalls-shuttered"],
  },
  // --- Act 1's three endings.
  {
    id: "court-at-the-table",
    channel: "civic",
    text: "CISTERN COURT SPEAKS FOR GREYWATER IN TALKS THE COMBINE DENIES HOLDING",
    requires: ["court-ascendant"],
  },
  {
    id: "syndicate-watch",
    channel: "civic",
    text: "VOSS SYNDICATE POSTS ITS OWN WATCH ALONG CINDER ROW",
    requires: ["syndicate-street"],
  },
  {
    id: "files-on-air",
    channel: "civic",
    text: "PIRATE RELAY CARRIES THE UNDERTOW FILES INTO EVERY BLOCK ON THE ROW",
    requires: ["broadcast-loose"],
  },
  // --- Act 2.
  {
    id: "cordon-down",
    channel: "civic",
    text: "THE CORDON IS DOWN AND THE MERIDIAN EXCHANGE STANDS OPEN TO THE STREET",
    requires: ["cordon-broken"],
  },
  {
    id: "exchange-stock",
    channel: "market",
    text: "EXCHANGE STOCK REACHES THE BOARDS AT PRICES NOBODY WILL EXPLAIN",
    requires: ["cordon-broken"],
  },
  {
    id: "warrant-posted",
    channel: "civic",
    text: "AURIC POSTS A RETRIEVAL WARRANT AND DECLINES TO NAME THE SUBJECT",
    requires: ["warrant-out"],
  },
  {
    id: "charter-signed",
    channel: "civic",
    text: "UNDERCROFT CHARTER SIGNED BENEATH THE GREYWATER STEPS",
    requires: ["charter-signed"],
  },
  {
    id: "regency-seated",
    channel: "civic",
    text: "COMBINE SEATS A NEW DIRECTOR OVERNIGHT AND CALLS IT CONTINUITY",
    requires: ["regency-risen"],
  },
  {
    id: "steps-ungoverned",
    channel: "civic",
    text: "GREYWATER STEPS DECLARES ITSELF UNGOVERNED AND KEEPS THE PUMPS RUNNING",
    requires: ["steps-free"],
  },
  {
    id: "spire-standing-red",
    channel: "civic",
    text: "AURIC SPIRE RAISES CONCOURSE SECURITY POSTURE TO STANDING RED",
    requires: ["spire-hardened"],
  },
  // --- The side chains.
  {
    id: "boards-extend-credit",
    channel: "market",
    text: "THE BOARDS CARRY A NAME THEY ARE WILLING TO EXTEND CREDIT TO",
    requires: ["market-favoured"],
  },
  {
    id: "longshore-resumes",
    channel: "market",
    text: "LONGSHORE RUNS RESUME UNDER A LICENCE NOBODY WILL PRINT",
    requires: ["basin-partnered"],
  },
  {
    id: "pitch-stands-empty",
    channel: "market",
    text: "THE RENTED PITCH UNDER THE NORTH GALLERY STANDS EMPTY A SECOND WEEK",
    requires: ["auditor-recruited"],
  },
  // --- After the succession.
  {
    id: "new-skyline",
    channel: "civic",
    text: "THE SPRAWL WAKES TO A SKYLINE THAT ANSWERS TO SOMEBODY NEW",
    requires: ["city-settled"],
  },
];


/* ------------------------------------------------------------------ *
 * Vendor stock
 * ------------------------------------------------------------------ */

/**
 * One line on a counter's shelf. What it is *worth* is not here — that
 * is the item's own worth in ./economy.ts, and what this counter
 * charges for it is derived from the two (src/economy/price.ts). What
 * is here is everything the *city* decides about the line: whether it
 * is on the shelf at all, what shape the copy is in, and what the
 * street is charging for the risk of holding it.
 */
export interface VendorStockEntry {
  /** Stable line id; a run's ledger books sales against it, so saves pin it. */
  id: string;
  vendorId: VendorId;
  itemId: string;
  /**
   * Flat credits this counter adds for the risk on this line — the
   * risk, not the goods. Two lines of the same item that differ only in
   * premium are authored as two entries under complementary conditions
   * (see the Rail Spitter), so exactly one of them is ever on the shelf.
   */
  premium?: number;
  /** What shape this copy is in; defaults to unopened. */
  condition?: ItemCondition;
  /** One line of why it is on this shelf, shown under the item. */
  note?: string;
  /** Stocked only while every one of these is live. */
  requires?: readonly WorldConditionId[];
}

/**
 * Two counters, and everything the city moves on them.
 *
 * The wet-market back shelf is a street stall: it sells at what a thing
 * is worth and pays badly. Quill's ledger on the boards is bonded — it
 * charges over the odds and pays properly, and it takes second-hand
 * consignment the stall would not touch.
 *
 * The variation authored here is all *positive* gating: the stock
 * selector reads these arrays through the same `conditionsAllow` every
 * other reactive channel uses, so a line that should vanish is written
 * as a complementary condition (`streets-calm` against `package-loose`)
 * rather than as a negative flag on the entry.
 */
export const VENDOR_STOCK: readonly VendorStockEntry[] = [
  {
    id: "buy-rail-spitter",
    vendorId: "wet-market-back",
    itemId: "wpn-rail-spitter",
    requires: ["streets-calm"],
  },
  {
    // Everybody on the Row knows an Auric spike never came back. The
    // stallkeeper does not ask; they just charge for the risk.
    id: "buy-rail-spitter-hot",
    vendorId: "wet-market-back",
    itemId: "wpn-rail-spitter",
    premium: 100,
    note: "They know what you kept.",
    requires: ["package-loose"],
  },
  {
    id: "buy-torque-cleaver",
    vendorId: "wet-market-back",
    itemId: "wpn-torque-cleaver",
    requires: ["streets-calm"],
  },
  {
    id: "buy-torque-cleaver-hot",
    vendorId: "wet-market-back",
    itemId: "wpn-torque-cleaver",
    premium: 100,
    note: "They know what you kept.",
    requires: ["package-loose"],
  },
  {
    id: "buy-ghostline-mantle",
    vendorId: "wet-market-back",
    itemId: "out-ghostline-mantle",
  },
  {
    id: "buy-cordon-plate",
    vendorId: "wet-market-back",
    itemId: "out-cordon-plate",
  },
  {
    // Corp optics are the one thing nobody will hand over the counter
    // to a face on a live retrieval warrant.
    id: "buy-warden-optics",
    vendorId: "wet-market-back",
    itemId: "cyb-warden-optics",
    requires: ["warrant-clear"],
  },
  {
    id: "buy-cascade-governor",
    vendorId: "wet-market-back",
    itemId: "cyb-cascade-governor",
    requires: ["warrant-clear"],
  },
  {
    // The Exchange's own hardware, on a street stall, a week after the
    // Cordon came down.
    id: "buy-torsion-frame",
    vendorId: "wet-market-back",
    itemId: "cyb-torsion-frame",
    note: "Exchange wrap still on it.",
    requires: ["cordon-broken"],
  },
  // Bench parts on the back shelf. Fitting them needs a bench (the
  // market's, see vm-bench) — the wet market only sells the hardware.
  {
    id: "buy-lattice-rifling",
    vendorId: "wet-market-back",
    itemId: "mod-lattice-rifling",
    note: "Still in its foil.",
  },
  {
    id: "buy-smartlink-sight",
    vendorId: "wet-market-back",
    itemId: "mod-smartlink-sight",
  },
  {
    // Nobody sells a burst governor to somebody with a live warrant;
    // fitting one is the difference between armed and intending.
    id: "buy-burst-governor",
    vendorId: "wet-market-back",
    itemId: "mod-burst-governor",
    requires: ["warrant-clear"],
  },
  {
    // Exchange machining, on the street the week after the Cordon fell
    // — the same shelf the Torsion Frame turned up on.
    id: "buy-hairline-sear",
    vendorId: "wet-market-back",
    itemId: "mod-hairline-sear",
    note: "Exchange machining.",
    requires: ["cordon-broken"],
  },
  {
    id: "buy-longspar-extension",
    vendorId: "wet-market-back",
    itemId: "mod-longspar-extension",
  },
  {
    // Consignment out of the Vertical Market: only offered to somebody
    // the boards are willing to vouch for.
    id: "buy-spindle-projector",
    vendorId: "wet-market-back",
    itemId: "wpn-spindle-projector",
    note: "Market consignment.",
    requires: ["market-favoured"],
  },

  /* --- Quill's ledger, on the north row of the boards --------------- */
  {
    id: "quill-patch",
    vendorId: "vm-broker-counter",
    itemId: "con-trauma-patch",
    note: "Bonded stock, sealed, dated.",
  },
  {
    id: "quill-stim",
    vendorId: "vm-broker-counter",
    itemId: "con-surge-stim",
  },
  {
    id: "quill-kit",
    vendorId: "vm-broker-counter",
    itemId: "con-field-kit",
  },
  {
    id: "quill-ballast",
    vendorId: "vm-broker-counter",
    itemId: "mod-ballast-shim",
  },
  {
    // Consignment off a scaffold crew that stopped needing it. Quill
    // books second-hand where the stall would only shrug at it.
    id: "quill-rig",
    vendorId: "vm-broker-counter",
    itemId: "out-highline-rig",
    condition: "used",
    note: "Consignment — two seasons on the scaffolds.",
  },
  {
    // Checkpoint plate with the insignia ground off, which is what
    // makes it salvage on a bonded shelf rather than contraband.
    id: "quill-plate",
    vendorId: "vm-broker-counter",
    itemId: "out-cordon-plate",
    condition: "salvage",
    note: "Insignia ground off, seams re-taped.",
    requires: ["cordon-broken"],
  },
  {
    // The boards vouch, or they do not. Corp optics on a registered
    // counter are only ever sold to somebody the market will name.
    id: "quill-optics",
    vendorId: "vm-broker-counter",
    itemId: "cyb-optic-suite",
    requires: ["market-favoured"],
  },
];
