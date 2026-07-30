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

/** Every named story speaker's authored look, keyed by display name. */
export const cast: Readonly<Record<string, CharacterVisual>> = {
  Flick: FLICK_VISUAL,
  Vesper: VESPER_VISUAL,
  "Matron Ferrow": FERROW_VISUAL,
  "Auditor Lin": LIN_VISUAL,
  Quill: QUILL_VISUAL,
  Marrow: MARROW_VISUAL,
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
 * Who a dialogue line shows beside the text, resolved purely from node
 * data. "unlisted" is the safe degradation for a named speaker without
 * an authored look: the name renders, no portrait does.
 */
export type SpeakerPortrait =
  | { kind: "narration" }
  | { kind: "player"; expression: ExpressionId }
  | { kind: "npc"; name: string; visual: CharacterVisual; expression: ExpressionId }
  | { kind: "unlisted"; name: string };

/** Resolve a story node's speaker and expression to its portrait. */
export function resolveSpeakerPortrait(
  node: Pick<StoryNode, "speaker" | "expression">,
): SpeakerPortrait {
  const expression = node.expression ?? "neutral";
  if (node.speaker === undefined) return { kind: "narration" };
  if (node.speaker === PLAYER_SPEAKER) return { kind: "player", expression };
  const visual = castVisual(node.speaker);
  if (!visual) return { kind: "unlisted", name: node.speaker };
  return { kind: "npc", name: node.speaker, visual, expression };
}
