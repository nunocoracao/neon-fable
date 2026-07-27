/**
 * The master pixel-art palette: a disciplined set of 28 colors plus a
 * soft shadow tone. Every sprite grid in src/iso/art indexes into this
 * table by single character; "." is transparent. Dark desaturated
 * blue-grays carry the base look, with neon cyan/magenta/amber accents.
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
  "6": "#4c566e", // steel
  "7": "#6b7691", // steel light
  "8": "#9aa3b8", // chrome
  "9": "#e8e6f0", // white ink
  // Rust / grime browns.
  a: "#2e1f1a", // rust dark
  b: "#4a3626", // rust
  c: "#6e5137", // rust light
  // Canal water blues.
  d: "#081018", // water deep
  e: "#0e2233", // water
  f: "#17394f", // water light
  // Neon cyan.
  g: "#2ee6d6", // cyan
  h: "#7ff5ea", // cyan bright
  i: "#14665f", // cyan dim
  // Neon magenta.
  j: "#e63e8f", // magenta
  k: "#ff7ac2", // magenta bright
  l: "#6e2148", // magenta dim
  // Neon amber.
  m: "#f0b429", // amber
  n: "#ffd977", // amber bright
  o: "#7a5a1a", // amber dim
  // Signals and skin.
  p: "#ff4d5e", // danger red
  q: "#d8c9b8", // skin
  r: "#a08872", // skin shade
  // Soft translucent ground shadow.
  z: "rgba(5, 6, 12, 0.45)",
};
