/**
 * Look families: the two or three authored records every humanoid enemy
 * archetype is drawn from, so a corridor of Cordon plate is a squad
 * rather than a row of clones.
 *
 * A family varies *within* a recognizable identity. What holds an
 * archetype together is its silhouette and its issue: the same outfit
 * layer, the same weapon class, the same build where the build is the
 * point. What varies is everything a person is — skin, hair, face,
 * scars — plus the crew colors an outfit's channels carry (see
 * CharacterVisual.outfitDye).
 *
 * Three grammars run through the roster:
 *
 * - **Corporate.** Auric and Cordon uniforms are crisp and matched: one
 *   issued coat, one issued sidearm, no dye. The variation is who is
 *   wearing it.
 * - **Street.** Rustyard and Greywater crews are patched together: mixed
 *   outfits, mixed weapons, and dyed accents that read as gang colors.
 * - **Chassis.** Machines vary by wear and by what has been bolted on —
 *   which chrome, how much crust — not by face.
 *
 * Every record keeps the hostile-optic cue (a crimson or magenta eye
 * color); enemies.test pins the convention across the whole roster, and
 * enemyLooks.test pins each family's internal distinctness.
 *
 * Which record a given spawn wears is decided by the encounter (an
 * explicit `look` index) or by a seeded pick stable per encounter and
 * slot — see spawnLookIndex in ./encounters.
 */
import type { CharacterVisual } from "../character/appearance";

/** A non-empty family of authored looks; index 0 is the canonical read. */
export type EnemyLookFamily = readonly [CharacterVisual, ...CharacterVisual[]];

/* --- Auric Retrieval: the pressed gray coat. Issue is issue — one suit,
 * one sidearm, no dye. Only the person inside it changes. --- */

export const AURIC_AGENT_LOOKS: EnemyLookFamily = [
  {
    appearance: {
      skinTone: "golden-tan",
      build: "lean",
      hairStyle: "slicked",
      hairColor: "raven",
      eyes: "narrow",
      eyeColor: "crimson",
      brows: "straight",
      mouth: "neutral",
      faceDetail: "none",
      headwear: "none",
    },
    outfit: "out-spire-suit",
    weapon: "wpn-compact-pistol",
  },
  {
    appearance: {
      skinTone: "porcelain",
      build: "lean",
      hairStyle: "buzz",
      hairColor: "chestnut",
      eyes: "narrow",
      eyeColor: "crimson",
      brows: "straight",
      mouth: "frown",
      faceDetail: "none",
      headwear: "none",
    },
    outfit: "out-spire-suit",
    weapon: "wpn-compact-pistol",
  },
  {
    appearance: {
      skinTone: "warm-brown",
      build: "heavy",
      hairStyle: "buzz",
      hairColor: "raven",
      eyes: "narrow",
      eyeColor: "crimson",
      brows: "heavy",
      mouth: "neutral",
      faceDetail: "none",
      headwear: "cap",
    },
    outfit: "out-spire-suit",
    weapon: "wpn-compact-pistol",
  },
];

/* --- Auric Reclamation wardens: flood-grey harness, service cap, riot
 * sidearm. Same issue, three shifts of it. --- */

export const AURIC_WARDEN_LOOKS: EnemyLookFamily = [
  {
    appearance: {
      skinTone: "warm-brown",
      build: "heavy",
      hairStyle: "buzz",
      hairColor: "raven",
      eyes: "narrow",
      eyeColor: "crimson",
      brows: "heavy",
      mouth: "frown",
      faceDetail: "none",
      headwear: "cap",
    },
    outfit: "out-diver-harness",
    weapon: "wpn-compact-pistol",
  },
  {
    appearance: {
      skinTone: "deep-umber",
      build: "heavy",
      hairStyle: "locs",
      hairColor: "raven",
      eyes: "standard",
      eyeColor: "crimson",
      brows: "heavy",
      mouth: "neutral",
      faceDetail: "scar",
      headwear: "none",
    },
    outfit: "out-diver-harness",
    weapon: "wpn-compact-pistol",
  },
  {
    appearance: {
      skinTone: "porcelain",
      build: "lean",
      hairStyle: "ponytail",
      hairColor: "blond",
      eyes: "narrow",
      eyeColor: "crimson",
      brows: "straight",
      mouth: "frown",
      faceDetail: "none",
      headwear: "cap",
    },
    outfit: "out-diver-harness",
    weapon: "wpn-compact-pistol",
    enhancements: { eyes: "cyb-warden-optics" },
  },
];

/* --- Auric Collections: the good coat. Silvered, appraising, magenta;
 * the accent channel is the only thing the department lets them pick. --- */

export const AURIC_COLLECTOR_LOOKS: EnemyLookFamily = [
  {
    appearance: {
      skinTone: "warm-brown",
      build: "lean",
      hairStyle: "slicked",
      hairColor: "silver",
      eyes: "narrow",
      eyeColor: "magenta",
      brows: "arched",
      mouth: "smirk",
      faceDetail: "none",
      headwear: "none",
    },
    outfit: "out-ghostline-mantle",
    weapon: "wpn-compact-pistol",
  },
  {
    appearance: {
      skinTone: "porcelain",
      build: "lean",
      hairStyle: "bob",
      hairColor: "raven",
      eyes: "narrow",
      eyeColor: "magenta",
      brows: "arched",
      mouth: "neutral",
      faceDetail: "cyber-lines",
      headwear: "none",
    },
    outfit: "out-ghostline-mantle",
    weapon: "wpn-compact-pistol",
    // Senior collections: the pale coat, and cyan where the writs go.
    outfitDye: { primary: "concrete", accent: "neonCyan" },
  },
];

/* --- Rustyard muscle: no uniform, no discipline, and colors worn on
 * purpose. Heavy build and salvage chrome are the constant. --- */

export const RUSTYARD_BRUISER_LOOKS: EnemyLookFamily = [
  {
    appearance: {
      skinTone: "deep-umber",
      build: "heavy",
      hairStyle: "none",
      hairColor: "raven",
      eyes: "standard",
      eyeColor: "crimson",
      brows: "heavy",
      mouth: "frown",
      faceDetail: "scar",
      headwear: "none",
    },
    weapon: "wpn-stun-baton",
    enhancements: { arms: "cyb-myomer-arms" },
  },
  {
    appearance: {
      skinTone: "golden-tan",
      build: "heavy",
      hairStyle: "mohawk",
      hairColor: "auburn",
      eyes: "wide",
      eyeColor: "crimson",
      brows: "heavy",
      mouth: "smirk",
      faceDetail: "tattoo",
      headwear: "none",
    },
    outfit: "out-courier-slicker",
    weapon: "wpn-torque-cleaver",
    enhancements: { arms: "cyb-myomer-arms" },
    // Rustyard colors: hazard orange over scavenged cloth.
    outfitDye: { primary: "concrete", accent: "hazardAmber" },
  },
  {
    appearance: {
      skinTone: "warm-brown",
      build: "heavy",
      hairStyle: "locs",
      hairColor: "silver",
      eyes: "standard",
      eyeColor: "crimson",
      brows: "heavy",
      mouth: "frown",
      faceDetail: "brow-split",
      headwear: "hood",
    },
    outfit: "out-courier-slicker",
    weapon: "wpn-stun-baton",
    enhancements: { arms: "cyb-torsion-frame" },
    outfitDye: { primary: "concrete", accent: "hazardAmber" },
  },
];

/* --- Cistern Court sappers: Greywater engineers in patched wet-rigs,
 * magenta work-lenses, cutters. Crew colors run cyan. --- */

export const COURT_SAPPER_LOOKS: EnemyLookFamily = [
  {
    appearance: {
      skinTone: "golden-tan",
      build: "lean",
      hairStyle: "ponytail",
      hairColor: "auburn",
      eyes: "standard",
      eyeColor: "magenta",
      brows: "straight",
      mouth: "neutral",
      faceDetail: "none",
      headwear: "cap",
    },
    outfit: "out-diver-harness",
    weapon: "wpn-shard-knife",
  },
  {
    appearance: {
      skinTone: "deep-umber",
      build: "lean",
      hairStyle: "spikes",
      hairColor: "synth-violet",
      eyes: "wide",
      eyeColor: "magenta",
      brows: "arched",
      mouth: "frown",
      faceDetail: "circuit-ink",
      headwear: "none",
    },
    outfit: "out-diver-harness",
    weapon: "wpn-shard-knife",
    outfitDye: { accent: "neonCyan" },
  },
  {
    appearance: {
      skinTone: "porcelain",
      build: "heavy",
      hairStyle: "buzz",
      hairColor: "chestnut",
      eyes: "standard",
      eyeColor: "magenta",
      brows: "heavy",
      mouth: "breather",
      faceDetail: "scar",
      headwear: "rebreather",
    },
    outfit: "out-diver-harness",
    weapon: "wpn-torque-cleaver",
    outfitDye: { accent: "neonCyan" },
  },
];

/* --- Cordon interdiction: matte plate, patience, a riot gun. The
 * Cordon does not dye anything; it issues. --- */

export const CORDON_ENFORCER_LOOKS: EnemyLookFamily = [
  {
    appearance: {
      skinTone: "porcelain",
      build: "heavy",
      hairStyle: "buzz",
      hairColor: "raven",
      eyes: "narrow",
      eyeColor: "crimson",
      brows: "straight",
      mouth: "frown",
      faceDetail: "none",
      headwear: "hood",
    },
    outfit: "out-cordon-plate",
    weapon: "wpn-rail-spitter",
  },
  {
    appearance: {
      skinTone: "warm-brown",
      build: "heavy",
      hairStyle: "none",
      hairColor: "raven",
      eyes: "cyber-band",
      eyeColor: "crimson",
      brows: "straight",
      mouth: "neutral",
      faceDetail: "none",
      headwear: "none",
    },
    outfit: "out-cordon-plate",
    weapon: "wpn-rail-spitter",
    enhancements: { dermal: "cyb-dermal-weave" },
  },
  {
    appearance: {
      skinTone: "golden-tan",
      build: "heavy",
      hairStyle: "buzz",
      hairColor: "silver",
      eyes: "narrow",
      eyeColor: "crimson",
      brows: "heavy",
      mouth: "frown",
      faceDetail: "brow-split",
      headwear: "hood",
    },
    outfit: "out-cordon-plate",
    weapon: "wpn-rail-spitter",
    enhancements: { arms: "cyb-torsion-frame" },
  },
];

/* --- Vault sentinels: chromed security slabs. Heavy, plated, and
 * visibly bolted together; the variation is how much chrome. --- */

export const VAULT_SENTINEL_LOOKS: EnemyLookFamily = [
  {
    appearance: {
      skinTone: "porcelain",
      build: "heavy",
      hairStyle: "none",
      hairColor: "silver",
      eyes: "cyber-band",
      eyeColor: "crimson",
      brows: "heavy",
      mouth: "breather",
      faceDetail: "none",
      headwear: "none",
    },
    outfit: "out-cordon-plate",
    weapon: "wpn-stun-baton",
    enhancements: { arms: "cyb-torsion-frame", dermal: "cyb-dermal-weave" },
  },
  {
    appearance: {
      skinTone: "deep-umber",
      build: "heavy",
      hairStyle: "none",
      hairColor: "silver",
      eyes: "cyber-band",
      eyeColor: "crimson",
      brows: "heavy",
      mouth: "breather",
      faceDetail: "circuit-ink",
      headwear: "none",
    },
    outfit: "out-cordon-plate",
    weapon: "wpn-torque-cleaver",
    enhancements: {
      arms: "cyb-myomer-arms",
      dermal: "cyb-dermal-weave",
      neural: "cyb-lattice-coprocessor",
    },
    // An older chassis, refinished: bare chrome under cyan service light.
    outfitDye: { primary: "brushedChrome", accent: "neonCyan" },
  },
];

/* --- Pump-deck custodians: barnacled caretaker frames. Mineral crust
 * over dark shell; no coat at all, so the wear is in the face. --- */

export const PUMP_CUSTODIAN_LOOKS: EnemyLookFamily = [
  {
    appearance: {
      skinTone: "deep-umber",
      build: "heavy",
      hairStyle: "none",
      hairColor: "chestnut",
      eyes: "cyber-band",
      eyeColor: "crimson",
      brows: "heavy",
      mouth: "breather",
      faceDetail: "circuit-ink",
      headwear: "none",
    },
    weapon: "wpn-stun-baton",
    enhancements: { arms: "cyb-torsion-frame" },
  },
  {
    appearance: {
      skinTone: "warm-brown",
      build: "heavy",
      hairStyle: "none",
      hairColor: "silver",
      eyes: "cyber-band",
      eyeColor: "crimson",
      brows: "heavy",
      mouth: "breather",
      faceDetail: "scar",
      headwear: "none",
    },
    weapon: "wpn-torque-cleaver",
    enhancements: { arms: "cyb-torsion-frame", dermal: "cyb-dermal-weave" },
  },
];

/* --- Vent crawlers: duct chassis gone feral, wearing whatever they
 * took off the last one. Lean, clawed, scarred. --- */

export const VENT_CRAWLER_LOOKS: EnemyLookFamily = [
  {
    appearance: {
      skinTone: "golden-tan",
      build: "lean",
      hairStyle: "none",
      hairColor: "raven",
      eyes: "cyber-band",
      eyeColor: "crimson",
      brows: "heavy",
      mouth: "breather",
      faceDetail: "scar",
      headwear: "none",
    },
    weapon: "wpn-shard-knife",
    enhancements: { arms: "cyb-myomer-arms" },
  },
  {
    appearance: {
      skinTone: "porcelain",
      build: "lean",
      hairStyle: "none",
      hairColor: "raven",
      eyes: "cyber-band",
      eyeColor: "crimson",
      brows: "heavy",
      mouth: "breather",
      faceDetail: "brow-split",
      headwear: "none",
    },
    weapon: "wpn-torque-cleaver",
    enhancements: { arms: "cyb-myomer-arms", dermal: "cyb-static-veil" },
  },
];

/* --- Halex Mandate proxies: polished civic idols. Telepresence
 * chassis are manufactured in runs, and a run has finishes. --- */

export const HALEX_PROXY_LOOKS: EnemyLookFamily = [
  {
    appearance: {
      skinTone: "porcelain",
      build: "lean",
      hairStyle: "glyph",
      hairColor: "silver",
      eyes: "cyber-band",
      eyeColor: "magenta",
      brows: "arched",
      mouth: "neutral",
      faceDetail: "cyber-lines",
      headwear: "none",
    },
    outfit: "out-spire-suit",
    weapon: "wpn-spindle-projector",
    enhancements: { neural: "cyb-lattice-coprocessor" },
  },
  {
    appearance: {
      skinTone: "golden-tan",
      build: "lean",
      hairStyle: "glyph",
      hairColor: "synth-violet",
      eyes: "cyber-band",
      eyeColor: "magenta",
      brows: "arched",
      mouth: "smirk",
      faceDetail: "cyber-lines",
      headwear: "none",
    },
    outfit: "out-spire-suit",
    weapon: "wpn-spindle-projector",
    enhancements: { neural: "cyb-lattice-coprocessor", eyes: "cyb-optic-suite" },
    // The Mandate's own livery: civic blue over the spire gray.
    outfitDye: { accent: "hologramBlue" },
  },
];

/* --- Locus custodial aspects: founders-era chassis in civic white,
 * woken for the Succession. Two survive; they wore the century
 * differently. --- */

export const LOCUS_ASPECT_LOOKS: EnemyLookFamily = [
  {
    appearance: {
      skinTone: "porcelain",
      build: "heavy",
      hairStyle: "none",
      hairColor: "silver",
      eyes: "cyber-band",
      eyeColor: "crimson",
      brows: "straight",
      mouth: "breather",
      faceDetail: "circuit-ink",
      headwear: "none",
    },
    outfit: "out-ghostline-mantle",
    weapon: "wpn-spindle-projector",
    enhancements: {
      neural: "cyb-lattice-coprocessor",
      dermal: "cyb-dermal-weave",
    },
  },
  {
    appearance: {
      skinTone: "porcelain",
      build: "heavy",
      hairStyle: "none",
      hairColor: "silver",
      eyes: "cyber-band",
      eyeColor: "crimson",
      brows: "heavy",
      mouth: "breather",
      faceDetail: "cyber-lines",
      headwear: "none",
    },
    outfit: "out-ghostline-mantle",
    weapon: "wpn-spindle-projector",
    enhancements: {
      neural: "cyb-lattice-coprocessor",
      dermal: "cyb-dermal-weave",
      arms: "cyb-torsion-frame",
    },
    // Registry white, kept: the chassis that was never left in the damp.
    outfitDye: { primary: "brushedChrome", accent: "hologramBlue" },
  },
];
