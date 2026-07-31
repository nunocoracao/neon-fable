/**
 * The dialogue cast: authored looks for every named story speaker,
 * rendered through the same layered appearance pipeline as the player.
 * StoryNode.speaker strings resolve here to a CharacterVisual for the
 * dialogue portrait; named map NPCs import the same visuals so a
 * character's face matches between the street and the conversation.
 *
 * Friendly faces avoid the crimson/magenta hostile-optic cue reserved
 * for enemies. A speaker without a cast entry degrades to a name-only
 * line (never a crash); a test walks every authored arc to keep the
 * cast complete.
 */
import type { CharacterVisual } from "../character/appearance";
import { DEACON_SILL_LOOK, VESPER_KADE_LOOK } from "./companions";
import { PLAYER_SPEAKER, type StoryNode } from "../narrative/types";
import type { ExpressionId } from "./appearance";

// Characters that also stand on maps share one exported look.

export const FLICK_VISUAL: CharacterVisual = {
  appearance: {
    skinTone: "golden-tan",
    build: "lean",
    hairStyle: "spikes",
    hairColor: "synth-violet",
    eyes: "wide",
    eyeColor: "cyan",
    brows: "arched",
    mouth: "smirk",
    faceDetail: "none",
    headwear: "none",
  },
  outfit: "out-courier-slicker",
};

// The stylist is their own best advertisement: dyed glyph cut,
// circuit ink, a mantle worn like vestments. Friendly optics.
export const VESPER_VISUAL: CharacterVisual = {
  appearance: {
    skinTone: "warm-brown",
    build: "lean",
    hairStyle: "glyph",
    hairColor: "synth-violet",
    eyes: "standard",
    eyeColor: "hologram-blue",
    brows: "arched",
    mouth: "smirk",
    faceDetail: "circuit-ink",
    headwear: "none",
  },
  outfit: "out-ghostline-mantle",
};

// The Steps' matriarch: silver tail, work harness, set jaw.
export const FERROW_VISUAL: CharacterVisual = {
  appearance: {
    skinTone: "warm-brown",
    build: "heavy",
    hairStyle: "ponytail",
    hairColor: "silver",
    eyes: "standard",
    eyeColor: "amber",
    brows: "straight",
    mouth: "frown",
    faceDetail: "none",
    headwear: "none",
  },
  outfit: "out-diver-harness",
};

// Lin: registry auditor in spire dress, circuit-inked, precise.
export const LIN_VISUAL: CharacterVisual = {
  appearance: {
    skinTone: "porcelain",
    build: "lean",
    hairStyle: "bob",
    hairColor: "raven",
    eyes: "narrow",
    eyeColor: "hologram-blue",
    brows: "straight",
    mouth: "neutral",
    faceDetail: "circuit-ink",
    headwear: "none",
  },
  outfit: "out-spire-suit",
};

// The Vertical Market's two fixtures. Quill brokers the boards — who
// trades where, and what the pitch costs; Marrow keeps a stool at the
// noodle counter and sells the district's other commodity. Both read
// friendly-side: no crimson optic, no hostile cue.
export const QUILL_VISUAL: CharacterVisual = {
  appearance: {
    skinTone: "golden-tan",
    build: "heavy",
    hairStyle: "locs",
    hairColor: "auburn",
    eyes: "narrow",
    eyeColor: "amber",
    brows: "arched",
    mouth: "smirk",
    faceDetail: "tattoo",
    headwear: "none",
  },
  outfit: "out-diver-harness",
};

// The bench at the east scaffold. Sabbat works with her sleeves off
// and a chrome forearm she does not explain; friendly-side, like the
// district's other fixtures — no crimson optic, no hostile cue.
export const SABBAT_VISUAL: CharacterVisual = {
  appearance: {
    skinTone: "porcelain",
    build: "heavy",
    hairStyle: "mohawk",
    hairColor: "silver",
    eyes: "narrow",
    eyeColor: "amber",
    brows: "heavy",
    mouth: "neutral",
    faceDetail: "scar",
    headwear: "none",
  },
  outfit: "out-diver-harness",
  enhancements: { arms: "cyb-myomer-arms" },
};

export const MARROW_VISUAL: CharacterVisual = {
  appearance: {
    skinTone: "deep-umber",
    build: "lean",
    hairStyle: "slicked",
    hairColor: "silver",
    eyes: "standard",
    eyeColor: "hologram-blue",
    brows: "straight",
    mouth: "neutral",
    faceDetail: "cyber-lines",
    headwear: "none",
  },
  outfit: "out-ghostline-mantle",
  enhancements: { eyes: "cyb-optic-suite" },
};

// The Flooded Quays' one fixture: a salvage diver who works the basin
// on her own, gills grafted along her ribs so she can stay down in it.
// Weather-beaten, unbothered, and lit amber by the barge she scavenges.
export const DREDGE_VISUAL: CharacterVisual = {
  appearance: {
    skinTone: "warm-brown",
    build: "heavy",
    hairStyle: "buzz",
    hairColor: "silver",
    eyes: "wide",
    eyeColor: "amber",
    brows: "heavy",
    mouth: "neutral",
    faceDetail: "scar",
    headwear: "hood",
  },
  outfit: "out-diver-harness",
  enhancements: { dermal: "cyb-silt-gills" },
};

// The Longshore's tender: the man who runs contraband up the quays on
// other people's salvage licences, and who takes the platform himself
// on the one road where the diver stops being on it. Dry where
// everybody down there is wet, which is the whole tell.
export const KEEL_VISUAL: CharacterVisual = {
  appearance: {
    skinTone: "porcelain",
    build: "lean",
    hairStyle: "slicked",
    hairColor: "raven",
    eyes: "narrow",
    eyeColor: "amber",
    brows: "straight",
    mouth: "neutral",
    faceDetail: "brow-split",
    headwear: "hood",
  },
  outfit: "out-tender-coat",
};

// The two griddle carts. Nobody's story turns on either of them: they
// are people who sell hot food to a district that had nowhere to get
// any, and they are drawn friendly-side like every other fixture — no
// crimson optic, no hostile cue.
//
// Bell works the Steps under a court awning, ladle in one hand and an
// opinion about everything in the other.
export const BELL_VISUAL: CharacterVisual = {
  appearance: {
    skinTone: "warm-brown",
    build: "heavy",
    hairStyle: "locs",
    hairColor: "raven",
    eyes: "wide",
    eyeColor: "amber",
    brows: "arched",
    mouth: "smirk",
    faceDetail: "none",
    headwear: "cap",
  },
  outfit: "out-courier-slicker",
};

// Onder works the wharf on the night shift, hood up against the rain,
// selling salt tea to people who have been in the water.
export const ONDER_VISUAL: CharacterVisual = {
  appearance: {
    skinTone: "porcelain",
    build: "lean",
    hairStyle: "buzz",
    hairColor: "silver",
    eyes: "narrow",
    eyeColor: "amber",
    brows: "straight",
    mouth: "neutral",
    faceDetail: "brow-split",
    headwear: "hood",
  },
  outfit: "out-diver-harness",
};

// The Auric Spire's house security, standing on both interior floors.
// Auric's uniform is the same interdiction plate the Cordon's enforcers
// wear, worn here by people paid to be immovable rather than to fight —
// so the look carries the crimson optic the enemy archetypes wear, as a
// warning. Whether it stays a warning is up to the player.
export const SPIRE_SECURITY_VISUAL: CharacterVisual = {
  appearance: {
    skinTone: "golden-tan",
    build: "heavy",
    hairStyle: "buzz",
    hairColor: "chestnut",
    eyes: "narrow",
    eyeColor: "crimson",
    brows: "heavy",
    mouth: "neutral",
    faceDetail: "none",
    headwear: "cap",
  },
  outfit: "out-cordon-plate",
  weapon: "wpn-stun-baton",
};

/**
 * Every named story speaker's authored look, keyed by display name.
 *
 * Two Vespers is one too many, so they are two names: the Chrome
 * Chapel's stylist is "Vesper" and the Quays' salvage-runner is
 * "Vesper Kade" — different people, different districts, and no scene
 * has ever put them in the same room. The companion's look is owned by
 * ./companions.ts (the party is what draws it) and imported here so the
 * face in her dialogue is the face walking behind you.
 */
export const cast: Readonly<Record<string, CharacterVisual>> = {
  Flick: FLICK_VISUAL,
  Vesper: VESPER_VISUAL,
  "Vesper Kade": VESPER_KADE_LOOK,
  "Deacon Sill": DEACON_SILL_LOOK,
  "Matron Ferrow": FERROW_VISUAL,
  "Auditor Lin": LIN_VISUAL,
  Quill: QUILL_VISUAL,
  Marrow: MARROW_VISUAL,
  Sabbat: SABBAT_VISUAL,
  Dredge: DREDGE_VISUAL,
  Keel: KEEL_VISUAL,
  Bell: BELL_VISUAL,
  Onder: ONDER_VISUAL,
  // The market's hot bar. Thirty years over the same pot, and the
  // steam has had all of them: squint, apron, hands that do not need
  // watching.
  "The counterman": {
    appearance: {
      skinTone: "golden-tan",
      build: "heavy",
      hairStyle: "none",
      hairColor: "silver",
      eyes: "narrow",
      eyeColor: "amber",
      brows: "heavy",
      mouth: "neutral",
      faceDetail: "none",
      headwear: "cap",
    },
    outfit: "out-diver-harness",
  },
  "Spire Security": SPIRE_SECURITY_VISUAL,
  // The fixer at the Filament's corner table: groomed, amused, and
  // never quite warm — the smile stops below the eyes.
  Sable: {
    appearance: {
      skinTone: "golden-tan",
      build: "lean",
      hairStyle: "slicked",
      hairColor: "raven",
      eyes: "narrow",
      eyeColor: "amber",
      brows: "arched",
      mouth: "smirk",
      faceDetail: "none",
      headwear: "none",
    },
    outfit: "out-ghostline-mantle",
  },
  // The Filament's door: a wall of a person, scarred and unhurried.
  Brakk: {
    appearance: {
      skinTone: "deep-umber",
      build: "heavy",
      hairStyle: "none",
      hairColor: "raven",
      eyes: "standard",
      eyeColor: "amber",
      brows: "heavy",
      mouth: "frown",
      faceDetail: "scar",
      headwear: "none",
    },
    outfit: "out-diver-harness",
  },
  // Greywater's courier-medic: one salvage-chrome arm, twenty years of
  // weather under a cap, and a grin that survived all of it.
  Patch: {
    appearance: {
      skinTone: "warm-brown",
      build: "lean",
      hairStyle: "buzz",
      hairColor: "silver",
      eyes: "standard",
      eyeColor: "amber",
      brows: "straight",
      mouth: "smirk",
      faceDetail: "none",
      headwear: "cap",
    },
    outfit: "out-courier-slicker",
    enhancements: { arms: "cyb-myomer-arms" },
  },
  // The signal-splicer of the dead relay: pale, wired, hologram-lit.
  Hex: {
    appearance: {
      skinTone: "porcelain",
      build: "lean",
      hairStyle: "bob",
      hairColor: "blond",
      eyes: "wide",
      eyeColor: "hologram-blue",
      brows: "arched",
      mouth: "smirk",
      faceDetail: "cyber-lines",
      headwear: "none",
    },
    outfit: "out-ghostline-mantle",
  },
  // Imre Voss: the Combine's conscience in a pressed suit, gone silver
  // tending salt-plants and regrets.
  "Director Voss": {
    appearance: {
      skinTone: "porcelain",
      build: "lean",
      hairStyle: "slicked",
      hairColor: "silver",
      eyes: "narrow",
      eyeColor: "silver",
      brows: "straight",
      mouth: "neutral",
      faceDetail: "none",
      headwear: "none",
    },
    outfit: "out-spire-suit",
  },
  // Halex: the Cordon's author — squared shoulders, permanent verdict.
  "Director Halex": {
    appearance: {
      skinTone: "warm-brown",
      build: "heavy",
      hairStyle: "slicked",
      hairColor: "raven",
      eyes: "narrow",
      eyeColor: "amber",
      brows: "heavy",
      mouth: "frown",
      faceDetail: "none",
      headwear: "none",
    },
    outfit: "out-spire-suit",
  },
  // A Greywater kid running messages up the Chainwell Stair.
  "Steps Runner": {
    appearance: {
      skinTone: "golden-tan",
      build: "lean",
      hairStyle: "ponytail",
      hairColor: "chestnut",
      eyes: "wide",
      eyeColor: "cyan",
      brows: "arched",
      mouth: "neutral",
      faceDetail: "none",
      headwear: "cap",
    },
    outfit: "out-courier-slicker",
  },
  /* --- The street's own faces.
   *
   * Nobody below is a character: they are the people a world condition
   * puts on a district (see world.ts) to make a change legible from the
   * pavement, and their scenes are in ./story/streets.ts. Each look is
   * authored to say what they are at a glance from three tiles away —
   * a uniform, a placard, a wrench — because that is the whole job.
   */
  // Combine trading standards, sent down to work a shuttered row: house
  // suit, house visor, house patience.
  "Combine Notice-Server": {
    appearance: {
      skinTone: "porcelain",
      build: "lean",
      hairStyle: "bob",
      hairColor: "raven",
      eyes: "narrow",
      eyeColor: "hologram-blue",
      brows: "straight",
      mouth: "neutral",
      faceDetail: "none",
      headwear: "visor",
    },
    outfit: "out-spire-suit",
  },
  // Voss's watch on the Row: a good coat, a bad job, and no hurry.
  "Syndicate Watch": {
    appearance: {
      skinTone: "golden-tan",
      build: "heavy",
      hairStyle: "slicked",
      hairColor: "raven",
      eyes: "narrow",
      eyeColor: "amber",
      brows: "heavy",
      mouth: "smirk",
      faceDetail: "none",
      headwear: "none",
    },
    outfit: "out-ghostline-mantle",
  },
  // Splicing the public feed off a screen post: hood up, wire out.
  "Rooftop Listener": {
    appearance: {
      skinTone: "warm-brown",
      build: "lean",
      hairStyle: "locs",
      hairColor: "auburn",
      eyes: "wide",
      eyeColor: "cyan",
      brows: "arched",
      mouth: "neutral",
      faceDetail: "cyber-lines",
      headwear: "hood",
    },
    outfit: "out-courier-slicker",
  },
  // Reading continuity off a card in the middle of the glow ring.
  "Regency Crier": {
    appearance: {
      skinTone: "deep-umber",
      build: "lean",
      hairStyle: "buzz",
      hairColor: "silver",
      eyes: "standard",
      eyeColor: "silver",
      brows: "straight",
      mouth: "neutral",
      faceDetail: "none",
      headwear: "none",
    },
    outfit: "out-spire-suit",
  },
  // Market kid holding a pitch for somebody the boards like.
  "Market Runner": {
    appearance: {
      skinTone: "porcelain",
      build: "lean",
      hairStyle: "spikes",
      hairColor: "blond",
      eyes: "wide",
      eyeColor: "cyan",
      brows: "arched",
      mouth: "smirk",
      faceDetail: "none",
      headwear: "cap",
    },
    outfit: "out-courier-slicker",
  },
  // Wet-market trader working out of crates a level up from home.
  "Displaced Stallholder": {
    appearance: {
      skinTone: "warm-brown",
      build: "heavy",
      hairStyle: "buzz",
      hairColor: "chestnut",
      eyes: "standard",
      eyeColor: "amber",
      brows: "straight",
      mouth: "smirk",
      faceDetail: "none",
      headwear: "cap",
    },
    outfit: "out-diver-harness",
  },
  // The Steps' first civil servant, thirty years overdue.
  "Charter Clerk": {
    appearance: {
      skinTone: "golden-tan",
      build: "heavy",
      hairStyle: "bob",
      hairColor: "silver",
      eyes: "standard",
      eyeColor: "amber",
      brows: "arched",
      mouth: "smirk",
      faceDetail: "none",
      headwear: "none",
    },
    outfit: "out-tender-coat",
  },
  // Greywater walking its own water line in salvaged cordon plate.
  "Steps Watch": {
    appearance: {
      skinTone: "deep-umber",
      build: "heavy",
      hairStyle: "locs",
      hairColor: "chestnut",
      eyes: "standard",
      eyeColor: "cyan",
      brows: "heavy",
      mouth: "neutral",
      faceDetail: "brow-split",
      headwear: "none",
    },
    outfit: "out-cordon-plate",
  },
  // The Vertical Market's missing courier: young, fast, and three
  // nights into hiding under her own delivery route. Slicker still on,
  // clip line still on the harness, nothing else left.
  Pell: {
    appearance: {
      skinTone: "warm-brown",
      build: "lean",
      hairStyle: "spikes",
      hairColor: "synth-violet",
      eyes: "wide",
      eyeColor: "cyan",
      brows: "straight",
      mouth: "neutral",
      faceDetail: "scar",
      headwear: "cap",
    },
    outfit: "out-courier-slicker",
  },
  // Ventworks floor boss: crew cap, split brow, done arguing.
  "Foreman Odal": {
    appearance: {
      skinTone: "deep-umber",
      build: "heavy",
      hairStyle: "buzz",
      hairColor: "chestnut",
      eyes: "standard",
      eyeColor: "amber",
      brows: "heavy",
      mouth: "neutral",
      faceDetail: "brow-split",
      headwear: "cap",
    },
    outfit: "out-diver-harness",
  },
  // The founders' continuity engine, wearing a face out of courtesy:
  // sensor band, breather grille, circuitry under projected skin.
  "The Meridian Locus": {
    appearance: {
      skinTone: "porcelain",
      build: "lean",
      hairStyle: "none",
      hairColor: "silver",
      eyes: "cyber-band",
      eyeColor: "hologram-blue",
      brows: "straight",
      mouth: "breather",
      faceDetail: "circuit-ink",
      headwear: "none",
    },
    outfit: "out-ghostline-mantle",
  },
};

/** The authored look for a speaker name; undefined off the cast list. */
export function castVisual(name: string): CharacterVisual | undefined {
  return cast[name];
}

/**
 * Speakers that were never people. A line can be spoken by a machine —
 * a security chassis reading out a standing order is still a line with
 * a face beside it — and a machine's face is the authored portrait
 * plate its archetype carries (see spriteKind in ./enemies), never a
 * composed appearance. Keyed by speaker name to that archetype, so the
 * thing talking in the dialogue is the thing standing in the arena.
 */
export const MACHINE_SPEAKERS: Readonly<Record<string, string>> = {
  "Warden Chassis": "nme-warden-chassis",
};

/** The archetype a machine speaker wears the face of; undefined for people. */
export function machineSpeakerEnemyId(name: string): string | undefined {
  return MACHINE_SPEAKERS[name];
}

/**
 * Who a dialogue line shows beside the text, resolved purely from node
 * data. "unlisted" is the safe degradation for a named speaker without
 * an authored look: the name renders, no portrait does.
 */
export type SpeakerPortrait =
  | { kind: "narration" }
  | { kind: "player"; expression: ExpressionId }
  | { kind: "npc"; name: string; visual: CharacterVisual; expression: ExpressionId }
  /** A machine: an authored portrait plate, and no expression to wear. */
  | { kind: "machine"; name: string; enemyId: string }
  | { kind: "unlisted"; name: string };

/** Resolve a story node's speaker and expression to its portrait. */
export function resolveSpeakerPortrait(
  node: Pick<StoryNode, "speaker" | "expression">,
): SpeakerPortrait {
  const expression = node.expression ?? "neutral";
  if (node.speaker === undefined) return { kind: "narration" };
  if (node.speaker === PLAYER_SPEAKER) return { kind: "player", expression };
  const enemyId = machineSpeakerEnemyId(node.speaker);
  if (enemyId) return { kind: "machine", name: node.speaker, enemyId };
  const visual = castVisual(node.speaker);
  if (!visual) return { kind: "unlisted", name: node.speaker };
  return { kind: "npc", name: node.speaker, visual, expression };
}
