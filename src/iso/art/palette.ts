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
 * - Lowercase v-y and punctuation: v3 half-steps (see HALF_STEPS), one
 *   between each pair of named steps on the ramps that carry detail.
 *   Art drawn at density 2 has four times the pixels to model a
 *   material with; these are the shades to model it in. They are
 *   additions only — every character above keeps its color and its
 *   place in the lighting, so nothing already drawn changes.
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

/**
 * The shadow channel: the soft ellipse a body casts on the ground. It
 * is under the figure rather than part of it, so it is the one opaque
 * thing a silhouette leaves out — and the one thing the detail pass
 * refuses to light.
 */
export const SHADOW = "z";

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

  // ---- v3 half-steps below: never reassign anything above this line. ----
  //
  // Art authored at density 2 (see ./density.ts) has four times the
  // pixels to spend on the same material, and a three-step ramp runs out
  // of shades long before the pixels run out. Each character here sits
  // exactly between two named steps of an existing ramp, so a five-step
  // gradient is available where a material earns one — and no existing
  // character means anything different than it did. See HALF_STEPS for
  // which sits between which.
  //
  // Punctuation, because every letter and digit is already spoken for.
  // The pairing is deliberate: brackets that open are the darker half of
  // their ramp and brackets that close are the lighter half, so a row of
  // art can be read without the table.
  v: "#bca895", // skin porcelain: shade -> base
  w: "#e4d6c5", // skin porcelain: base -> highlight
  x: "#ae8455", // skin golden tan: shade -> base
  y: "#d8af7a", // skin golden tan: base -> highlight
  "-": "#744930", // skin warm brown: shade -> base
  "+": "#9f6b46", // skin warm brown: base -> highlight
  "=": "#482e22", // skin deep umber: shade -> base
  "~": "#694636", // skin deep umber: base -> highlight
  "(": "#41434a", // concrete: shade -> base
  ")": "#62646c", // concrete: base -> highlight
  "[": "#6d7e9b", // brushed chrome: shade -> base
  "]": "#bbc6dc", // brushed chrome: base -> specular
  "{": "#1e1a2b", // dark fabric: shade -> base
  "}": "#332d48", // dark fabric: base -> highlight
  "<": "#224a5f", // glass: tint -> base
  ">": "#56a8ad", // glass: base -> glint
  "%": "#b56716", // hazard amber: shade -> base
  "&": "#efaf49", // hazard amber: base -> highlight
  "!": "#3c2a20", // rust: dark -> base
  "?": "#5c432e", // rust: base -> light
};

/**
 * Entries that read as their own light source: the neon trios, the
 * danger lamp, and the hologram blues — every color a sign, screen, or
 * warning light is actually drawn in, including the ones the emissive
 * pass casts glows from.
 *
 * Day-phase tinting (see ./tint.ts) leaves these alone, so a tube is
 * exactly as saturated at dusk as it is at 3am and only what it lights
 * up changes. Two channels ride along deliberately: outfit accents are
 * authored in the magenta ramp and face ink in the hologram ramp, so
 * neon trim and lit tattoos keep their bite in every phase.
 */
export const EMISSIVE_COLORS: readonly string[] = [
  "i", "g", "h", // neon cyan
  "l", "j", "k", // neon magenta — also the outfit-accent channel
  "o", "m", "n", // neon amber
  "p", // danger red
  "s", "t", "u", // hologram blue — also the tattoo-ink channel
];

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

/**
 * The palette read as ordered ramps, dark to light — which color is one
 * step further into shadow than which, stated once so the detail pass
 * (./detail.ts) can light a raised edge without inventing a color.
 *
 * The list is resolved in order and each character is claimed by the
 * first ramp that names it, so an entry doing double duty (steel "6"
 * and white ink "9" are also the ends of brushed chrome; "n" is both
 * neon amber's highlight and hazard amber's) takes its neighbors from
 * the ramp it most belongs to and the later ramp still gets a run for
 * its own exclusive entries. Colors named by no ramp — the six hair
 * dyes, danger red — simply have no lighter or darker step, and the
 * detail pass leaves them exactly as authored.
 */
export const SHADING_RAMPS: readonly (readonly string[])[] = [
  ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], // neutrals
  ["a", "b", "c"], // rust
  ["d", "e", "f"], // canal water
  ["i", "g", "h"], // neon cyan
  ["l", "j", "k"], // neon magenta
  ["o", "m", "n"], // neon amber
  ["r", "q", "A"], // skin: porcelain
  ["C", "B", "D"], // skin: golden tan
  ["F", "E", "G"], // skin: warm brown
  ["I", "H", "J"], // skin: deep umber
  ["Q", "R", "S"], // concrete
  ["V", "W", "X"], // dark fabric
  ["s", "t", "u"], // hologram blue
  ["Y", "Z", "n"], // hazard amber
  ["f", "U", "h"], // glass
  ["6", "T", "9"], // brushed chrome
];

/**
 * A palette v3 half-step: a color sitting between two adjacent named
 * steps of one of the ramps above, for art drawn finely enough to want
 * a gradient where a three-step ramp only offers a jump.
 */
export interface HalfStep {
  /** The character art is authored with. */
  readonly char: string;
  /** The named steps it falls between, darker first. */
  readonly between: readonly [string, string];
}

/**
 * Every half-step, and which two named steps it splits. The ramps
 * themselves (SHADING_RAMPS) are untouched: a half-step is a shade an
 * artist may reach for, not a rung the automatic lighting climbs.
 */
export const HALF_STEPS: readonly HalfStep[] = [
  { char: "v", between: ["r", "q"] },
  { char: "w", between: ["q", "A"] },
  { char: "x", between: ["C", "B"] },
  { char: "y", between: ["B", "D"] },
  { char: "-", between: ["F", "E"] },
  { char: "+", between: ["E", "G"] },
  { char: "=", between: ["I", "H"] },
  { char: "~", between: ["H", "J"] },
  { char: "(", between: ["Q", "R"] },
  { char: ")", between: ["R", "S"] },
  { char: "[", between: ["6", "T"] },
  { char: "]", between: ["T", "9"] },
  { char: "{", between: ["V", "W"] },
  { char: "}", between: ["W", "X"] },
  { char: "<", between: ["f", "U"] },
  { char: ">", between: ["U", "h"] },
  { char: "%", between: ["Y", "Z"] },
  { char: "&", between: ["Z", "n"] },
  { char: "!", between: ["a", "b"] },
  { char: "?", between: ["b", "c"] },
];

/**
 * Which ramp a half-step belongs to: the one where its two anchors are
 * adjacent rungs. Resolving it this way rather than by looking up either
 * anchor alone matters for the entries doing double duty — "6" is steel
 * to the neutrals and the shade of brushed chrome, and a half-step
 * between it and "T" is chrome, not neutral. Throws at module load if a
 * half-step names two steps that are not neighbors anywhere, so a
 * mis-declared shade never reaches a sprite.
 */
function halfStepRamp(step: HalfStep): number {
  const [darker, lighter] = step.between;
  const index = SHADING_RAMPS.findIndex((ramp) => {
    const at = ramp.indexOf(darker);
    return at >= 0 && ramp[at + 1] === lighter;
  });
  if (index < 0) {
    throw new Error(
      `half-step "${step.char}" sits between "${darker}" and "${lighter}", which are not adjacent on any ramp`,
    );
  }
  return index;
}

/**
 * A step along a color's ramp, in the given direction.
 *
 * Named steps keep the neighbors they have always had: a base lights to
 * its highlight, not to the half-step in between. The bevel this feeds
 * (./detail.ts) is a single lit pixel along a material edge, and it has
 * to move a whole shade to read as anything at all — half a shade on one
 * pixel is a pixel nobody can see. Half-steps step to the named steps
 * that enclose them, so a hand-painted gradient still lights and shades
 * like the material it belongs to.
 *
 * This is also what keeps palette v3 from touching a single existing
 * sprite: no character that existed before it has a new neighbor.
 */
function rampSteps(direction: 1 | -1): Readonly<Record<string, string>> {
  const steps: Record<string, string> = {};
  for (const ramp of SHADING_RAMPS) {
    for (let i = 0; i < ramp.length; i++) {
      const from = ramp[i] as string;
      const to = ramp[i + direction];
      if (to !== undefined && steps[from] === undefined) steps[from] = to;
    }
  }
  for (const step of HALF_STEPS) {
    steps[step.char] = step.between[direction === 1 ? 1 : 0];
  }
  return Object.freeze(steps);
}

/** One step toward the light along a color's own ramp, where it has one. */
export const LIGHTER_STEP: Readonly<Record<string, string>> = rampSteps(1);

/** One step into shadow along a color's own ramp, where it has one. */
export const DARKER_STEP: Readonly<Record<string, string>> = rampSteps(-1);

/**
 * Which ramp a color belongs to, by the same first-claim rule. Two
 * colors sharing a ramp are the same material at two brightnesses —
 * the artist's own shading — which is how the detail pass tells a
 * boundary between materials from one drawn inside a single one. A
 * half-step joins the ramp it splits, so painting a gradient inside a
 * material never reads as an edge between two of them.
 */
export const RAMP_OF: Readonly<Record<string, number>> = Object.freeze(
  HALF_STEPS.reduce<Record<string, number>>(
    (into, step) => {
      into[step.char] = halfStepRamp(step);
      return into;
    },
    SHADING_RAMPS.reduce<Record<string, number>>((into, ramp, index) => {
      for (const ch of ramp) if (into[ch] === undefined) into[ch] = index;
      return into;
    }, {}),
  ),
);

/** The half-step between two named steps, where one is authored. */
export function halfStepBetween(
  darker: string,
  lighter: string,
): string | undefined {
  return HALF_STEPS.find(
    (step) => step.between[0] === darker && step.between[1] === lighter,
  )?.char;
}
