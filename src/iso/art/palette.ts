/**
 * The master pixel-art palette (v2): a disciplined curated set for the
 * hi-res art push. Every sprite grid in src/iso/art indexes into this
 * table by single character; "." is transparent. Dark desaturated
 * blue-grays carry the base look, with neon cyan/magenta/amber accents
 * and a consistent top-left light source.
 *
 * Layout:
 * - Digits + lowercase a-r, z: the original v1 set. These characters
 *   MUST keep their exact colors forever — existing art depends on them.
 * - Uppercase A-Z + lowercase s-u: v2 slots — skin-tone ramps, hair
 *   colors, and material ramps for the layered-character and hi-res
 *   tile work. Ramps run shade -> base -> highlight so the top-left
 *   light source stays consistent.
 *
 * Ramp/channel membership (see the typed constants below):
 * - Skin ramps:      [r q A] [C B D] [F E G] [I H J]
 * - Hair colors:     K L M N O P
 * - Concrete:        Q R S
 * - Brushed chrome:  6 T 9   (reuses steel + white ink at the ends)
 * - Glass:           f U h   (reuses water light + cyan bright)
 * - Dark fabric:     V W X
 * - Hazard amber:    Y Z n   (reuses amber bright as the highlight)
 * - Hologram blue:   s t u
 * - Neon cyan:       i g h   (the cyan neon trio as a ramp)
 */

export const TRANSPARENT = ".";

export const PALETTE: Readonly<Record<string, string>> = {
  // Neutrals, dark to light (consistent top-left light source).
  "0": "#05060c", // void / outline
  "1": "#0d0f18", // ink
  "2": "#161a26", // charcoal
  "3": "#202534", // slate dark
  "4": "#2b3244", // slate
  "5": "#3a4257", // slate light
  "6": "#4c566e", // steel — also brushed-chrome shade
  "7": "#6b7691", // steel light
  "8": "#9aa3b8", // chrome
  "9": "#e8e6f0", // white ink — also brushed-chrome specular
  // Rust / grime browns.
  a: "#2e1f1a", // rust dark
  b: "#4a3626", // rust
  c: "#6e5137", // rust light
  // Canal water blues.
  d: "#081018", // water deep
  e: "#0e2233", // water
  f: "#17394f", // water light — also glass tint (shade)
  // Neon cyan.
  g: "#2ee6d6", // cyan — canonical eye/iris channel color
  h: "#7ff5ea", // cyan bright — also glass glint (highlight)
  i: "#14665f", // cyan dim
  // Neon magenta — also the canonical outfit-accent channel ramp.
  j: "#e63e8f", // magenta (accent base)
  k: "#ff7ac2", // magenta bright (accent highlight)
  l: "#6e2148", // magenta dim (accent shade)
  // Neon amber.
  m: "#f0b429", // amber
  n: "#ffd977", // amber bright — also hazard-amber highlight
  o: "#7a5a1a", // amber dim
  // Signals and skin (skin ramp 1: porcelain — the canonical skin channel).
  p: "#ff4d5e", // danger red
  q: "#d8c9b8", // skin (ramp 1 base)
  r: "#a08872", // skin shade (ramp 1 shade)
  // Soft translucent ground shadow.
  z: "rgba(5, 6, 12, 0.45)",

  // ---- v2 slots below: never reassign anything above this line. ----

  // Skin ramp 1 highlight (base/shade are the legacy q/r above).
  A: "#f1e4d3", // porcelain highlight
  // Skin ramp 2: golden tan.
  B: "#c79a66", // tan base
  C: "#966f45", // tan shade
  D: "#eac48f", // tan highlight
  // Skin ramp 3: warm brown.
  E: "#8a583a", // brown base
  F: "#5e3a26", // brown shade
  G: "#b57e53", // brown highlight
  // Skin ramp 4: deep umber.
  H: "#57392c", // umber base
  I: "#392318", // umber shade
  J: "#7b5340", // umber highlight
  // Hair colors — each reads as a solid at 1-2px strokes.
  K: "#1b1826", // raven black (blue-cast; canonical hair channel color)
  L: "#5a3a22", // chestnut brown
  M: "#cf9c4a", // blond
  N: "#93341f", // auburn red
  O: "#cdd2dd", // silver
  P: "#7c4bd8", // synth violet
  // Concrete ramp — warm near-neutral grays, distinct from the blue slates.
  Q: "#33343a", // concrete shade
  R: "#50525a", // concrete base
  S: "#75777e", // concrete highlight
  // Brushed metal / chrome base with a cool blue sheen
  // (ramp: 6 steel shade -> T base -> 9 white-ink specular).
  T: "#8ea6c8", // brushed chrome base
  // Glass base — teal-tinted pane (ramp: f tint -> U base -> h glint).
  U: "#2e5b70", // glass base
  // Dark fabric ramp — violet-cast cloth, the canonical outfit-primary
  // channel; distinct from the blue-gray neutrals.
  V: "#16131f", // fabric shade
  W: "#272138", // fabric base
  X: "#403a58", // fabric highlight
  // Hazard amber ramp — dirty signage orange, duller than the neon amber
  // (ramp: Y shade -> Z base -> n highlight).
  Y: "#8a4a10", // hazard shade
  Z: "#e0851c", // hazard base
  // Hologram blue ramp — a true blue, distinct from the cyan neon.
  s: "#1e3d85", // hologram dim
  t: "#4477e8", // hologram base
  u: "#a8c4ff", // hologram bright
};

/** A three-step material/skin ramp, ordered for the top-left light. */
export interface ColorRamp {
  /** Darkest step — shadowed faces (bottom/right). */
  readonly shade: string;
  /** The material's local color. */
  readonly base: string;
  /** Lightest step — lit faces (top/left) and speculars. */
  readonly highlight: string;
}

/**
 * The four skin-tone ramps, light to deep. Ramp 0 (porcelain) is the
 * canonical ramp character layers are authored in; picking another tone
 * remaps ramp 0's characters onto the chosen ramp position-for-position.
 */
export const SKIN_RAMPS: readonly ColorRamp[] = [
  { shade: "r", base: "q", highlight: "A" }, // porcelain (canonical)
  { shade: "C", base: "B", highlight: "D" }, // golden tan
  { shade: "F", base: "E", highlight: "G" }, // warm brown
  { shade: "I", base: "H", highlight: "J" }, // deep umber
];

/**
 * The six hair colors. Hair layers are authored in raven ("K", the
 * canonical hair channel character) and remapped to the chosen color.
 */
export const HAIR_COLORS: readonly string[] = ["K", "L", "M", "N", "O", "P"];

/**
 * Material ramps for hi-res tiles, props, and gear. Some steps reuse
 * legacy entries where an existing color already earns the slot.
 */
export const MATERIAL_RAMPS = {
  concrete: { shade: "Q", base: "R", highlight: "S" },
  brushedChrome: { shade: "6", base: "T", highlight: "9" },
  glass: { shade: "f", base: "U", highlight: "h" },
  darkFabric: { shade: "V", base: "W", highlight: "X" },
  hazardAmber: { shade: "Y", base: "Z", highlight: "n" },
  hologramBlue: { shade: "s", base: "t", highlight: "u" },
  // The cyan neon trio as a ramp — optic glow and cyberware accents.
  neonCyan: { shade: "i", base: "g", highlight: "h" },
} as const satisfies Readonly<Record<string, ColorRamp>>;

export type MaterialName = keyof typeof MATERIAL_RAMPS;

/**
 * Reserved remap channels for the layered-character system. Each layer
 * grid is authored using its channel's canonical characters; appearance
 * choices recolor by remapping those characters (via `remapped`) before
 * baking. Channels are mutually disjoint so one grid can carry several
 * channels without collisions. Membership applies per layer grid — a
 * character like "6" or "9" is only channel-remapped inside layers that
 * declare the channel, never in environment art.
 */
export const REMAP_CHANNELS = {
  /** Body/face layers: skin ramp 0, shade -> base -> highlight. */
  skin: ["r", "q", "A"],
  /** Hair/brow layers: authored in raven. */
  hair: ["K"],
  /** Iris pixels: authored in neon cyan. */
  eyes: ["g"],
  /** Outfit main cloth: the dark-fabric ramp. */
  outfitPrimary: ["V", "W", "X"],
  /** Outfit trim/detail: the magenta ramp, dim -> base -> bright. */
  outfitAccent: ["l", "j", "k"],
  /** Cyberware plating: the brushed-chrome ramp. */
  cyberChrome: ["6", "T", "9"],
  /**
   * Tattoo / face-ink pigment: authored in the hologram-blue ramp
   * (unused by any other channel), so later ink-dye options recolor
   * tattoos by remap without touching skin, hair, or gear channels.
   */
  tattooInk: ["s", "t", "u"],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export type RemapChannelName = keyof typeof REMAP_CHANNELS;
