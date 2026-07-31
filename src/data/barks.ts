/**
 * Barks: the one-line things people say without being spoken to — a
 * hawker working a stall row, a diver grumbling at the tide, the
 * companion beside you having an opinion about where you've just walked
 * in. Typed content, exactly like story nodes; the scheduler that
 * decides who says what and when is pure logic in
 * src/narrative/barks.ts, and the chip it goes up in is
 * src/ui/barkLayer.ts.
 *
 * A bark is *decoration*. Nothing here sets a flag, opens a scene, or
 * is required reading: a line can be missed entirely with no cost, so
 * nothing load-bearing is ever said in one. That is what lets the
 * chips be silenced by a setting and hidden from screen readers without
 * anybody losing part of the game.
 *
 * ## How a line is chosen
 *
 * Every field but `id`, `speaker`, `trigger`, and `text` is a gate, and
 * every gate is an AND:
 *
 * - `mapIds` / `zoneIds` — the district, and the patch of it a
 *   pedestrian belongs to (a hawking line belongs to the market row,
 *   not to the whole plaza).
 * - `speakerId` — a named person's own line: an interactable id for a
 *   map NPC, a companion id for the crew.
 * - `weather` / `dayPhase` — what the sky is doing and what hour it is.
 * - `requirements` — the story gate vocabulary the rest of the game
 *   uses (flags, party, loyalty, reputation, stats, items), evaluated
 *   by narrative/requirements.ts. Barks are how the street notices a
 *   thing the player did three scenes ago.
 *
 * Original voice throughout: the city, its districts, and its factions
 * are this game's own.
 */
import type { SceneSpeakerKind } from "../iso/events";
import type { DayPhaseId, WeatherId } from "../iso/tilemap";
import type { Requirement } from "../narrative/types";

/**
 * Who is talking. The same three kinds the scene reports, so a speaker
 * standing on the map and the pool of lines it draws from are joined by
 * one string and never drift apart.
 */
export type BarkSpeakerKind = SceneSpeakerKind;

/**
 * What prompted the line.
 *
 * - `idle` — nothing did. The street talking to itself, and the pool
 *   the ambient tick draws from.
 * - `arrive` — the player has just walked into a district.
 * - `weather` — the sky is doing something worth mentioning.
 * - `wounded` — the player is badly hurt (the beat after a bad fight).
 *
 * The event triggers are cued by the shell; `idle` is offered
 * continuously and is the only one pedestrians and map NPCs use, since
 * a passer-by has no idea where you have just been.
 */
export const BARK_TRIGGERS = ["idle", "arrive", "weather", "wounded"] as const;

export type BarkTrigger = (typeof BARK_TRIGGERS)[number];

/** How long a line may be; a chip is small and read at a glance. */
export const MAX_BARK_LENGTH = 64;

export interface Bark {
  id: string;
  speaker: BarkSpeakerKind;
  trigger: BarkTrigger;
  /** The line itself, at most MAX_BARK_LENGTH characters. */
  text: string;
  /** Districts it can be said in; absent means any. */
  mapIds?: readonly string[];
  /** Ambient zones it belongs to (pedestrians only); absent means any. */
  zoneIds?: readonly string[];
  /** Whose line it is: an interactable id, or a companion id. */
  speakerId?: string;
  /** Only under this sky. */
  weather?: WeatherId;
  /** Only at this hour. */
  dayPhase?: DayPhaseId;
  /** The story gate, in the same vocabulary dialogue choices use. */
  requirements?: Requirement[];
  /** Relative odds within the eligible pool; defaults to 1. */
  weight?: number;
}

/**
 * The street's own voice, by district. Pedestrians are nobody in
 * particular, so their lines carry no speakerId — they are a pool the
 * district draws from, narrowed to a zone where the work being done
 * there is specific enough to be worth it.
 */
const PEDESTRIAN_BARKS: readonly Bark[] = [
  // --- Cinder Row Plaza: the hub, at dusk. Hawking on the stall row,
  // muttering on the terrace, and everybody walking a little fast.
  {
    id: "bark-plaza-hawk-wire",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Hot wire, cold noodles, no questions asked!",
    mapIds: ["cinder-plaza"],
    zoneIds: ["market-row"],
  },
  {
    id: "bark-plaza-hawk-bowl",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Two creds a bowl. Three if you want it clean.",
    mapIds: ["cinder-plaza"],
    zoneIds: ["market-row"],
  },
  {
    id: "bark-plaza-hawk-salvage",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Row-pulled, not corpse-pulled. I can tell the difference.",
    mapIds: ["cinder-plaza"],
    zoneIds: ["market-row"],
  },
  {
    id: "bark-plaza-sign",
    speaker: "pedestrian",
    trigger: "idle",
    text: "That sign's been dark since the flood. Nobody's coming.",
    mapIds: ["cinder-plaza"],
    zoneIds: ["plaza"],
  },
  {
    id: "bark-plaza-overline",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Rake's on time. Something in this city is.",
    mapIds: ["cinder-plaza"],
    zoneIds: ["plaza"],
  },
  {
    id: "bark-plaza-hiring",
    speaker: "pedestrian",
    trigger: "idle",
    text: "My cousin says Auric's hiring. My cousin lies.",
    mapIds: ["cinder-plaza"],
    zoneIds: ["plaza", "street"],
  },
  {
    id: "bark-plaza-filament",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Walk past the Filament, don't walk into it.",
    mapIds: ["cinder-plaza"],
    zoneIds: ["street"],
  },
  {
    id: "bark-plaza-patrol",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Third patrol this hour. Somebody's nervous.",
    mapIds: ["cinder-plaza"],
    zoneIds: ["street"],
  },
  // The Row notices what the player did. Both of these are gated on
  // outcomes Act 1 and Act 2 record, so a run that went another way
  // never hears them.
  {
    id: "bark-plaza-broadcast",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Whole Row heard it. Whole Row's pretending it didn't.",
    mapIds: ["cinder-plaza"],
    requirements: [
      { type: "flag-equals", key: "act1-outcome", value: "broadcast" },
    ],
    weight: 2,
  },
  {
    id: "bark-plaza-cordon-down",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Cordon's down. Walk while it's down.",
    mapIds: ["cinder-plaza", "greywater-steps"],
    requirements: [{ type: "flag-set", key: "cordon-broken" }],
    weight: 2,
  },

  // --- Greywater Steps: written off the map, and still standing in it.
  {
    id: "bark-steps-water",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Water's up two steps since the week turned.",
    mapIds: ["greywater-steps"],
  },
  {
    id: "bark-steps-pump",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Pump's dead. Pump's been dead. Pump stays dead.",
    mapIds: ["greywater-steps"],
  },
  {
    id: "bark-steps-map",
    speaker: "pedestrian",
    trigger: "idle",
    text: "They took us off the map. The map's still here.",
    mapIds: ["greywater-steps"],
  },
  {
    id: "bark-steps-socks",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Dry socks. Somebody in this district sell me dry socks.",
    mapIds: ["greywater-steps"],
    weather: "rain",
  },

  // --- The Flooded Quays: cold work, at the far end of the night.
  {
    id: "bark-quays-tideboard",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Tide board's lying again. It does that.",
    mapIds: ["flooded-quays"],
    zoneIds: ["wharf"],
  },
  {
    id: "bark-quays-claim",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Anything under the lockgate is mine. Understood?",
    mapIds: ["flooded-quays"],
    zoneIds: ["wharf", "strand"],
  },
  {
    id: "bark-quays-chrome",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Cold gets in the chrome. Then it stays in.",
    mapIds: ["flooded-quays"],
    weather: "rain",
  },
  {
    id: "bark-quays-haul",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Six hours down, half a haul up. Same as always.",
    mapIds: ["flooded-quays"],
    zoneIds: ["strand"],
  },

  // --- The Vertical Market: everything for sale, nothing declared.
  {
    id: "bark-market-bonded",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Bonded, boxed, and nobody asks whose box.",
    mapIds: ["vertical-market"],
    zoneIds: ["north-stalls"],
  },
  {
    id: "bark-market-lantern",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Lantern court! Half price, last hour, no refunds!",
    mapIds: ["vertical-market"],
    zoneIds: ["lantern-court"],
  },
  {
    id: "bark-market-boards",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Mind the boards. The third one's a rumour.",
    mapIds: ["vertical-market"],
    zoneIds: ["landing", "gallery"],
  },
  {
    id: "bark-market-drone",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Drone's back around. Smile for the ledger.",
    mapIds: ["vertical-market"],
    zoneIds: ["gallery"],
  },
  {
    id: "bark-market-rail",
    speaker: "pedestrian",
    trigger: "idle",
    text: "You break a rail, you buy a rail. Ask anyone.",
    mapIds: ["vertical-market"],
    zoneIds: ["landing", "north-stalls"],
  },

  // --- Meridian Exchange, Ventworks: shift work under the stacks.
  {
    id: "bark-vent-shift",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Twelve on, four off, and the four is a lie.",
    mapIds: ["exchange-ventworks"],
  },
  {
    id: "bark-vent-glove",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Cycler ate a glove today. Only a glove.",
    mapIds: ["exchange-ventworks"],
  },
  {
    id: "bark-vent-coolant",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Don't touch the coolant line. Ask Petrel why.",
    mapIds: ["exchange-ventworks"],
  },

  // --- Auric Spire: the queue, the badge, the patience.
  {
    id: "bark-spire-badge",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Badge. Badge. Sir — badge.",
    mapIds: ["auric-spire"],
  },
  {
    id: "bark-spire-patience",
    speaker: "pedestrian",
    trigger: "idle",
    text: "The Combine thanks you for your patience.",
    mapIds: ["auric-spire"],
  },
  {
    id: "bark-spire-lifts",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Ninety floors and the lifts still queue.",
    mapIds: ["auric-spire"],
  },
  {
    id: "bark-exec-business",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Nothing on this floor is anybody's business.",
    mapIds: ["auric-executive"],
  },
  {
    id: "bark-exec-scheduled",
    speaker: "pedestrian",
    trigger: "idle",
    text: "The Director takes no unscheduled interest.",
    mapIds: ["auric-executive"],
  },
];

/**
 * Named people, standing where the map puts them. These only go up
 * when the player has stopped near them — a line from somebody you are
 * walking towards reads as impatience, and one from somebody you are
 * walking away from reads as a bug.
 */
const NPC_BARKS: readonly Bark[] = [
  {
    id: "bark-flick-spot",
    speaker: "npc",
    trigger: "idle",
    speakerId: "flick",
    text: "You're loitering in my spot. I charge for that.",
  },
  {
    id: "bark-flick-after",
    speaker: "npc",
    trigger: "idle",
    speakerId: "flick",
    text: "Heard what you did. Didn't hear it from me.",
    requirements: [{ type: "flag-set", key: "act1-complete" }],
    weight: 2,
  },
  {
    id: "bark-flick-steps",
    speaker: "npc",
    trigger: "idle",
    speakerId: "flick-steps",
    text: "Steps are quiet tonight. Quiet's expensive.",
  },
  {
    id: "bark-vendor-fresh",
    speaker: "npc",
    trigger: "idle",
    speakerId: "market-vendor",
    text: "Fresh off the quays. Mostly fresh.",
  },
  {
    id: "bark-ferrow-pumps",
    speaker: "npc",
    trigger: "idle",
    speakerId: "matron-ferrow",
    text: "Be gone before the pumps turn over. Or don't.",
  },
  {
    id: "bark-watcher-screens",
    speaker: "npc",
    trigger: "idle",
    speakerId: "crown-watcher",
    text: "Screens are dead. I watch them anyway.",
  },
  {
    id: "bark-messenger-tram",
    speaker: "npc",
    trigger: "idle",
    speakerId: "tram-messenger",
    text: "The tram won't wait. Not on you, not on me.",
  },
  {
    id: "bark-dredge-water",
    speaker: "npc",
    trigger: "idle",
    speakerId: "quays-diver",
    text: "Water keeps what it takes. Usually.",
  },
  {
    id: "bark-quill-sale",
    speaker: "npc",
    trigger: "idle",
    speakerId: "stall-broker",
    text: "Everything here's for sale. Some of it's mine.",
  },
  {
    id: "bark-marrow-price",
    speaker: "npc",
    trigger: "idle",
    speakerId: "market-fixer",
    text: "Ask me twice and the price goes up.",
  },
  {
    id: "bark-vent-crew-stand",
    speaker: "npc",
    trigger: "idle",
    speakerId: "vent-crew",
    text: "You're not crew. Stand where I can see you.",
  },
  {
    id: "bark-spire-security-move",
    speaker: "npc",
    trigger: "idle",
    speakerId: "spire-security",
    text: "Keep moving along the concourse, please.",
  },
];

/**
 * The crew. A companion is the one speaker who has been where the
 * player has been, so theirs are the lines that answer a district, a
 * downpour, or a bad fight — and the two of them answer the same
 * things differently, which is the point of authoring them apart.
 */
const COMPANION_BARKS: readonly Bark[] = [
  // --- Vesper Kade: salvage-runner. Reads a room for what it's worth.
  {
    id: "bark-vesper-quays",
    speaker: "companion",
    trigger: "arrive",
    speakerId: "vesper",
    text: "Home water. Don't drink it.",
    mapIds: ["flooded-quays"],
  },
  {
    id: "bark-vesper-steps",
    speaker: "companion",
    trigger: "arrive",
    speakerId: "vesper",
    text: "Half these doors used to be mine.",
    mapIds: ["greywater-steps"],
  },
  {
    id: "bark-vesper-market",
    speaker: "companion",
    trigger: "arrive",
    speakerId: "vesper",
    text: "Hand on your pockets here. Both hands.",
    mapIds: ["vertical-market"],
  },
  {
    id: "bark-vesper-spire",
    speaker: "companion",
    trigger: "arrive",
    speakerId: "vesper",
    text: "Ninety floors of people who've never been wet.",
    mapIds: ["auric-spire", "auric-executive"],
  },
  {
    id: "bark-vesper-vent",
    speaker: "companion",
    trigger: "arrive",
    speakerId: "vesper",
    text: "Everything down here is bolted. I checked.",
    mapIds: ["exchange-ventworks"],
  },
  {
    id: "bark-vesper-rain",
    speaker: "companion",
    trigger: "weather",
    speakerId: "vesper",
    text: "Rain's good. Nobody looks up in rain.",
    weather: "rain",
  },
  {
    id: "bark-vesper-wounded",
    speaker: "companion",
    trigger: "wounded",
    speakerId: "vesper",
    text: "You're leaking. Sit down or keep up — pick one.",
  },
  {
    id: "bark-vesper-idle",
    speaker: "companion",
    trigger: "idle",
    speakerId: "vesper",
    text: "This place would strip in an afternoon.",
  },
  {
    id: "bark-vesper-loyal",
    speaker: "companion",
    trigger: "idle",
    speakerId: "vesper",
    text: "You're all right. Don't let that get around.",
    requirements: [{ type: "loyalty", companionId: "vesper", value: 6 }],
    weight: 2,
  },

  // --- Deacon Sill: struck-off auditor. Reads a room for what it owes.
  {
    id: "bark-sill-spire",
    speaker: "companion",
    trigger: "arrive",
    speakerId: "sill",
    text: "Careful. Everything in here is recorded.",
    mapIds: ["auric-spire", "auric-executive"],
  },
  {
    id: "bark-sill-market",
    speaker: "companion",
    trigger: "arrive",
    speakerId: "sill",
    text: "Not one stall on this level is bonded.",
    mapIds: ["vertical-market"],
  },
  {
    id: "bark-sill-steps",
    speaker: "companion",
    trigger: "arrive",
    speakerId: "sill",
    text: "There is a file on this district. It's thin.",
    mapIds: ["greywater-steps"],
  },
  {
    id: "bark-sill-vent",
    speaker: "companion",
    trigger: "arrive",
    speakerId: "sill",
    text: "Three code violations and we're barely inside.",
    mapIds: ["exchange-ventworks"],
  },
  {
    id: "bark-sill-quays",
    speaker: "companion",
    trigger: "arrive",
    speakerId: "sill",
    text: "This basin was signed off as safe. Somebody signed.",
    mapIds: ["flooded-quays"],
  },
  {
    id: "bark-sill-rain",
    speaker: "companion",
    trigger: "weather",
    speakerId: "sill",
    text: "The drainage here was approved. By a name I know.",
    weather: "rain",
  },
  {
    id: "bark-sill-wounded",
    speaker: "companion",
    trigger: "wounded",
    speakerId: "sill",
    text: "That wants a medic and a witness statement.",
  },
  {
    id: "bark-sill-idle",
    speaker: "companion",
    trigger: "idle",
    speakerId: "sill",
    text: "I'd like all of this written down. Eventually.",
  },
  {
    id: "bark-sill-loyal",
    speaker: "companion",
    trigger: "idle",
    speakerId: "sill",
    text: "I've begun entering you in the good column.",
    requirements: [{ type: "loyalty", companionId: "sill", value: 6 }],
    weight: 2,
  },
  // --- The noise, once somebody can hear it -----------------------------
  //
  // Static's flavour band. From humming the crew can hear the hardware
  // over the conversation, and from loud they stop being polite about
  // it. Decoration exactly like every other line here: the band is
  // already said in words on the character screen, and missing these
  // costs nothing but the joke.
  {
    id: "bark-vesper-static-hum",
    speaker: "companion",
    trigger: "idle",
    speakerId: "vesper",
    text: "You're humming. Not a tune. Fix that.",
    requirements: [{ type: "static", band: "humming" }],
  },
  {
    id: "bark-vesper-static-loud",
    speaker: "companion",
    trigger: "idle",
    speakerId: "vesper",
    text: "I can hear your eyes focus. It's not endearing.",
    requirements: [{ type: "static", band: "loud" }],
    weight: 2,
  },
  {
    id: "bark-sill-static-hum",
    speaker: "companion",
    trigger: "idle",
    speakerId: "sill",
    text: "Your chrome disagrees with itself. Audibly.",
    requirements: [{ type: "static", band: "humming" }],
  },
  {
    id: "bark-sill-static-loud",
    speaker: "companion",
    trigger: "wounded",
    speakerId: "sill",
    text: "Sit down before the hardware votes on it.",
    requirements: [{ type: "static", band: "loud" }],
    weight: 2,
  },
];

export const barks: readonly Bark[] = [
  ...PEDESTRIAN_BARKS,
  ...NPC_BARKS,
  ...COMPANION_BARKS,
];

export function getBark(id: string): Bark | undefined {
  return barks.find((bark) => bark.id === id);
}

export function requireBark(id: string): Bark {
  const bark = getBark(id);
  if (!bark) {
    throw new Error(`Unknown bark: ${id}`);
  }
  return bark;
}
