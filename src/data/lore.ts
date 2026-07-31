/**
 * The city's own memory, in twelve pieces.
 *
 * Memory shards are salvaged data chips lying around the districts:
 * pick one up and it files itself in the codex, where it can be read in
 * full. Nothing here is mechanical — a shard grants no item, no stat,
 * no flag a scene reads. What the set buys is a picture: twelve
 * fragments of the Sprawl's own history that only make one argument
 * once you have all of them (see LORE_PAYOFF).
 *
 * Everything is content:
 *
 * - `mapId`/`x`/`y` is where the chip lies. Placement is authored here
 *   rather than in map data because a shard is not part of a district's
 *   furniture — it is dropped onto the map by the join in
 *   src/world/shards.ts, and it stops being there once collected.
 * - `district` is the only thing a locked codex slot says out loud, so
 *   the set reads as a treasure map rather than as a list of blanks.
 *   A test pins it to the map's own name.
 * - `requirements` is an ordinary Requirement bundle, evaluated with
 *   the engine's own checkRequirements. Three shards carry one; each
 *   also carries the `sealed` line the chip gives you when it refuses,
 *   which must name what would open it — a gate the player cannot read
 *   is indistinguishable from a bug.
 *
 * Original setting throughout: the Grey Tide, the Meridian Waterworks,
 * and the Grey Choir are this file's own history, written to sit under
 * the story the acts already tell.
 */
import type { Requirement } from "../narrative/types";

export interface LoreShard {
  id: string;
  /** Reading order in the codex, 1-based and contiguous. */
  index: number;
  /** Shown once the shard has been read; a locked slot shows none. */
  title: string;
  /** The map the chip lies on. */
  mapId: string;
  x: number;
  y: number;
  /** The district's own name — the locked slot's only hint. */
  district: string;
  /** The entry itself: one to three short paragraphs. */
  paragraphs: readonly string[];
  /** Gate on reading it; absent means anyone who finds it can. */
  requirements?: readonly Requirement[];
  /** What the chip says when the gate refuses. Required with a gate. */
  sealed?: string;
}

/**
 * Twelve shards, in reading order: the Grey Tide (1-4), what the
 * Combine made of it (5-8), and the Grey Choir (9-12). Placement is
 * spread over every district and interior in the game, two to most and
 * one apiece to the two floors of the Spire.
 */
export const LORE_SHARDS: readonly LoreShard[] = [
  {
    id: "shard-tide-tables",
    index: 1,
    title: "Tide Tables, Final Revision",
    mapId: "cinder-plaza",
    x: 1,
    y: 6,
    district: "Cinder Row Plaza",
    paragraphs: [
      "MERIDIAN WATERWORKS — SHELF TIDE TABLES, REVISION 40. Posted " +
        "quarterly to every ledge above the waterline for one hundred " +
        "and six years without interruption.",
      "Revision 41 was drafted, checked, and never posted. The margin " +
        "carries a duty clerk's hand: \"Hold. Figures do not agree with " +
        "the pump returns. Have asked the works to check the returns.\"",
      "The works did check the returns. The returns were correct. It " +
        "was the shelf that had moved.",
    ],
  },
  {
    id: "shard-grey-boards",
    index: 2,
    title: "The Night the Boards Went Grey",
    mapId: "flooded-quays",
    x: 4,
    y: 5,
    district: "The Flooded Quays",
    paragraphs: [
      "Nobody in the basin calls it the flood. They call it the Grey " +
        "Tide, because that is what the duty announcer called it at " +
        "23:40 — \"grey water on the boards, all levels, grey water on " +
        "the boards\" — and because she said it eleven times before the " +
        "boards themselves went under.",
      "It was not a wave. It was a night of water arriving politely, " +
        "one ledge at a time, exactly as the unposted tables said it " +
        "would.",
    ],
  },
  {
    id: "shard-roll-call",
    index: 3,
    title: "Roll Call, Ledge Nine",
    mapId: "greywater-steps",
    x: 2,
    y: 2,
    district: "Greywater Steps",
    paragraphs: [
      "The chalk wall under the Steps is older than the Cistern Court " +
        "that keeps it. It began as a roll call: names read out over the " +
        "relay every hour on flood night so the levels below could hear " +
        "who was still answering, and chalked up by whoever had a dry " +
        "hand at the time.",
      "Three hundred and forty names went up in the first night. Ninety " +
        "were rubbed out again over the following week, which down here " +
        "is the good outcome — a rubbed name is somebody who walked in " +
        "and objected to being on the wall.",
      "The Court has never lost a name off it since. That is not " +
        "sentiment. It is the oldest register in the Sprawl, and it has " +
        "outlasted every office that tried to condemn the ledge it is " +
        "painted on.",
    ],
  },
  {
    id: "shard-salvage-rights",
    index: 4,
    title: "Salvage Rights",
    mapId: "vertical-market",
    x: 1,
    y: 3,
    district: "The Vertical Market",
    paragraphs: [
      "The Market was a scaffold over a drowned arcade for two years " +
        "before anybody thought to call it a market. What was traded was " +
        "salvage, and what set the price was whether the relay had " +
        "cleared your level to go back down for it.",
      "It trades through the night because that is when the announcers " +
        "read the tide, and a stallholder who missed the reading traded " +
        "blind until morning. Six levels of people still keep those " +
        "hours for a broadcast that stopped sixty years ago.",
    ],
  },
  {
    id: "shard-receivership",
    index: 5,
    title: "The Receivership of Drowned Estates",
    mapId: "auric-spire",
    x: 12,
    y: 2,
    district: "Auric Spire — Crown Concourse",
    paragraphs: [
      "The Auric Combine did not buy the Meridian Sprawl. It " +
        "administered it. A drowned estate is a distressed estate; a " +
        "distressed estate wants a receiver; and the Combine's recovery " +
        "desk was the only office still dry enough to file.",
      "Eleven thousand deeds went into receivership in the first winter " +
        "after the Grey Tide, on the reasonable grounds that their " +
        "holders could not be reached. Most of the holders were three " +
        "ledges down, chalked on a wall, waiting to be told the water " +
        "had stopped.",
    ],
  },
  {
    id: "shard-charter-minutes",
    index: 6,
    title: "Minutes of the First Charter",
    mapId: "auric-executive",
    x: 11,
    y: 7,
    district: "Auric Spire — Executive Floor",
    requirements: [{ type: "enhancement", itemId: "cyb-optic-suite" }],
    sealed:
      "The page is printed twice — once in ink and once in a register " +
      "no unaided eye resolves. It wants replacement eyes: an Optic " +
      "Suite, installed.",
    paragraphs: [
      "The Meridian Charter convened with water still standing on four " +
        "levels. Item one: continuity of governance. Item two: the " +
        "seating of district representation.",
      "\"The undercroft levels being presently unsurveyed, their seat " +
        "is left vacant pending survey.\" The survey is minuted as " +
        "commencing in the spring. Under the ink, in the layer the " +
        "clerks used for what the record should carry but not say, a " +
        "second hand: \"No survey is scheduled. Do not schedule one.\"",
      "The seat stayed vacant for sixty-one years. Every Charter since " +
        "has minuted it as pending.",
    ],
  },
  {
    id: "shard-cordon-precedent",
    index: 7,
    title: "The Cordon Precedent",
    mapId: "exchange-ventworks",
    x: 12,
    y: 7,
    district: "Meridian Exchange — Ventworks",
    requirements: [{ type: "stat", stat: "tech", value: 8 }],
    sealed:
      "A corp index, sealed the way corp indices are sealed. Cracking " +
      "it is Tech work — eight of it.",
    paragraphs: [
      "Every instrument the Combine has ever used to close a district " +
        "descends from one flood-night order: TRIAGE 4, which sealed the " +
        "Chainwell manifold to hold pressure on the levels that could " +
        "still be saved.",
      "It was the correct order. The duty engineer who signed it drowned " +
        "on the wrong side of it eleven minutes later, which the file " +
        "records without comment.",
      "What the file does comment on is the phrasing. TRIAGE 4 is cited " +
        "in the Cordon's authorising memorandum, in three embargo " +
        "actions, and in the Undertow schedule — each time as precedent " +
        "for closing a level in the interest of the levels above it. " +
        "Nobody has needed to write the argument since. It was written " +
        "once, at speed, by a man who died on the losing side of it.",
    ],
  },
  {
    id: "shard-founders-keys",
    index: 8,
    title: "Property of the Combine — Do Not Duplicate",
    mapId: "cinder-plaza",
    x: 14,
    y: 11,
    district: "Cinder Row Plaza",
    paragraphs: [
      "The founders' keys are not founders' keys. They are the " +
        "receiver's set: eleven thousand drowned titles consolidated " +
        "into one master instrument so the recovery desk could hold them " +
        "with a single signature.",
      "The word \"founders\" appears in the register for the first time " +
        "forty years later, in a commemorative print run. The Sprawl has " +
        "called them that ever since, which is how a filing convenience " +
        "becomes an origin.",
    ],
  },
  {
    id: "shard-choir-establishment",
    index: 9,
    title: "The Grey Choir: Establishment",
    mapId: "exchange-ventworks",
    x: 2,
    y: 5,
    district: "Meridian Exchange — Ventworks",
    paragraphs: [
      "MERIDIAN WATERWORKS, STANDING ORDER 9: the emergency broadcast " +
        "service shall consist of eleven duty announcers, one to each " +
        "pump station, reading tide and route on the hour and on demand " +
        "of the works.",
      "Nobody in the works called it the broadcast service. Eleven " +
        "voices reading the same figures in eleven rooms, an hour apart " +
        "and slightly out of time with each other, sounded like exactly " +
        "one thing, and the name stuck long before the tide it is now " +
        "assumed to be named after.",
      "The Grey Choir kept the hours for ninety years to an audience of " +
        "pump crews and insomniacs. On the night it finally mattered, " +
        "all eleven were on shift, because Standing Order 9 said they " +
        "should be.",
    ],
  },
  {
    id: "shard-last-shift",
    index: 10,
    title: "The Choir's Last Shift",
    mapId: "greywater-steps",
    x: 12,
    y: 10,
    district: "Greywater Steps",
    requirements: [{ type: "reputation", factionId: "court", value: "trusted" }],
    sealed:
      "Somebody has been keeping this one. The Court hands it to its " +
        "own, and to nobody the Steps do not yet trust.",
    paragraphs: [
      "Stations Four through Eleven went under between 01:00 and 04:00. " +
        "The transcripts are almost dull: tide, route, roll call, tide, " +
        "route, roll call. Nobody signs off. Each station simply stops " +
        "being one of the voices.",
      "What the last three did before the water reached the desks was " +
        "patch their own readings into the pump relays — the machinery " +
        "that talks to itself all night whether anyone is listening or " +
        "not — so the call would keep running on the works' own current " +
        "after there was no one left to read it.",
      "It is a maintenance procedure. It is written up as one. It is " +
        "also eleven people deciding that the hourly reading was more " +
        "important than the hour they had left, and the Court has kept " +
        "the file for sixty years for that reason and no other.",
    ],
  },
  {
    id: "shard-votive-wiring",
    index: 11,
    title: "Votive Wiring",
    mapId: "flooded-quays",
    x: 11,
    y: 8,
    district: "The Flooded Quays",
    paragraphs: [
      "The drowned shrines are junction boxes. The lanterns are load. " +
        "A votive left burning at a flooded shrine is a terrace feed " +
        "kept warm, and a vigil that has run without a break since the " +
        "Grey Tide is a relay that has never once lost power.",
      "Ask on the Steps and you will be told it is for the dead. That " +
        "is true and it is also wiring. The Undercroft has been paying " +
        "the current bill on the Meridian Waterworks' emergency " +
        "broadcast service for sixty years and calling it grief.",
    ],
  },
  {
    id: "shard-three-parishes",
    index: 12,
    title: "Three Parishes, One Voice",
    mapId: "vertical-market",
    x: 16,
    y: 8,
    district: "The Vertical Market",
    paragraphs: [
      "The relay outlived the works. Three parishes of it stayed up on " +
        "votive current — Chainwell, Ledge Nine, and the shrine line " +
        "under the quays — each carrying a partial archive and none of " +
        "them a whole one.",
      "The last entry in the Waterworks log is a merge. Three partial " +
        "archives into one persona, so that a single voice could carry " +
        "all eleven names and go on reading. It is signed with the " +
        "works' master key, the one that opens every pump deck on the " +
        "shelf.",
      "The merge is dated. It is not signed by a person. Under the " +
        "signature line, in the register the clerks used for what the " +
        "record should carry but not say, somebody wrote: \"It says it " +
        "would enjoy the exercise.\"",
    ],
  },
];

/**
 * What the whole set adds up to, shown in the codex once every shard
 * has been read. Purely narrative: nothing reads this but the codex,
 * and no scene, item, or route changes because a player has it.
 *
 * The reframe is deliberate and specific — the Relay Crown broadcast is
 * the loudest thing a run can do in Act 1, and the twelve shards make
 * it the second time that relay has been used for exactly this.
 */
export const LORE_PAYOFF: readonly string[] = [
  "Put the twelve together and the ghost in the drowned Weave stops " +
    "being a ghost. Hex is not a fragmentary archive wearing three dead " +
    "networks like coats. Hex is the Grey Choir: eleven duty announcers " +
    "of the Meridian Waterworks, merged into one voice on votive " +
    "current so the hourly reading would keep running after the rooms " +
    "it was read in went under.",
  "\"The locks still dream in my key\" is not a boast. It is the " +
    "works' master key, held by the service that was supposed to have " +
    "it. \"I was a broadcast system once\" is not nostalgia. It is a job " +
    "description, and the job was telling the levels below the " +
    "waterline what was coming for them.",
  "Which makes the Relay Crown the second time, not the first. Sixty " +
    "years ago the Choir put a warning about the water over every " +
    "screen in the Sprawl and drowned finishing it. Anyone who carries " +
    "the Undertow ledger up to the Crown and lets Hex sing it is not " +
    "improvising. They are handing eleven dead announcers the shift " +
    "they never got to end.",
];

const SHARDS_BY_ID: ReadonlyMap<string, LoreShard> = new Map(
  LORE_SHARDS.map((shard) => [shard.id, shard]),
);

export function getShard(id: string): LoreShard | undefined {
  return SHARDS_BY_ID.get(id);
}

export function requireShard(id: string): LoreShard {
  const shard = SHARDS_BY_ID.get(id);
  if (!shard) throw new Error(`Unknown lore shard "${id}"`);
  return shard;
}

/** Every shard lying on one map, in reading order. */
export function shardsOnMap(mapId: string): LoreShard[] {
  return LORE_SHARDS.filter((shard) => shard.mapId === mapId);
}
