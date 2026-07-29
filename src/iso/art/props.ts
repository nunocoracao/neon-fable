/**
 * Prop pixel art: buildings, street furniture, and hazards. Each prop is
 * a palette-indexed grid (some with short frame loops for window
 * flicker, neon pulses, and sign shimmer). Anchors are given in 1x art
 * pixels at the point that lands on the tile-diamond center; light is
 * top-left, so left faces read lighter than right faces. Every prop is
 * authored natively at the v2 resolution and bakes as-is.
 */
import { hash2 } from "../animation";
import type { PropId } from "../tilemap";
import type { GlowSource } from "./glow";
import { remapped, type PixelGrid } from "./pixel";

export interface PropArt {
  frames: readonly PixelGrid[];
  anchorX: number;
  anchorY: number;
  /** ms per frame for slow loops; 0 = static. */
  frameMs: number;
  /** Neon flicker: dropouts briefly show the last frame instead. */
  flicker: boolean;
  /**
   * Emissive light this prop casts in the glow pass. Offsets are in 1x
   * art pixels relative to the anchor. Flicker props go dark with their
   * dropout frame.
   */
  glow?: readonly GlowSource[];
}

const rep = (n: number, row: string): string[] => Array<string>(n).fill(row);
const gap = (n: number): string => ".".repeat(n);

/* --- Building: a full-tile tenement block, native 64×92 — a roof
 * diamond carrying a chrome duct housing with a red service beacon,
 * a lit west face and shaded south face banded with cornices, five
 * floors of cyan-lit and dead glass windows, a vertical magenta
 * tenant-sign board down the shaded face, and a concrete plinth at
 * street level. Ground contact at (32, 76); painted per-pixel so the
 * detail stays deterministic. --- */

const BUILDING_H = 92;
/** Wall band rows (inclusive) between roof expansion and base taper. */
const WALL_TOP = 32;
const WALL_BOTTOM = 76;
/** Window frame width and per-face column offsets (0-based in-face). */
const WIN_W = 4;
const LEFT_WINDOW_COLS = [3, 10, 17, 24];
const RIGHT_WINDOW_COLS = [4, 19, 25];
/** Window-band top rows: frame, two glass rows, then the sill. */
const FLOOR_ROWS = [37, 44, 51, 58, 65];
/** Sign board span on the shaded face: in-face columns and wall rows. */
const SIGN_COLS = { from: 12, to: 15 };
const SIGN_ROWS = { from: 40, to: 63 };
/** Two-pixel rune strokes down the sign board, top to bottom. */
const SIGN_RUNES =
  "jj kj jj l1 jj jk kk jj 1l jj jj kj ll jj jk jj kk j1 jj lj jj jj".split(" ");

/** Roof slate with seam speckle and a lit ridge fleck here and there. */
const roofPaint = (x: number, y: number): string => {
  const n = hash2(x * 3 + 7, y * 5 + 1) % 19;
  return n === 0 ? "5" : n === 1 ? "2" : "4";
};

/** The rooftop duct housing (chrome box) with its red beacon pair. */
const ductPaint = (x: number, y: number): string | null => {
  if (x < 26 || x > 37 || y < 6 || y > 12) return null;
  if (y === 6 && (x === 27 || x === 28)) return "p";
  if (y <= 8) {
    if (x === 26 || x === 37 || y === 6) return "6";
    return hash2(x, y * 9) % 7 === 0 ? "9" : "T";
  }
  return x < 32 ? "7" : "6";
};

/** One wall-face pixel: c is the in-face column (0..30), y the row. */
const facePaint = (leftFace: boolean, c: number, y: number): string => {
  const fill = leftFace ? "3" : "2";
  // Sign board (shaded face only) paints over everything in its span.
  if (
    !leftFace &&
    c >= SIGN_COLS.from &&
    c <= SIGN_COLS.to &&
    y >= SIGN_ROWS.from &&
    y <= SIGN_ROWS.to
  ) {
    if (y === SIGN_ROWS.from || y === SIGN_ROWS.to) return "1";
    if (c === SIGN_COLS.from || c === SIGN_COLS.to) return "1";
    return SIGN_RUNES[y - SIGN_ROWS.from - 1]?.[c - SIGN_COLS.from - 1] ?? "j";
  }
  // Cornice lines and the street-level concrete plinth.
  if (y === 34 || y === 70) return leftFace ? "5" : "4";
  if (y >= 72) return leftFace ? "R" : "Q";
  // Window bands: frame, two glass rows, sill.
  for (const top of FLOOR_ROWS) {
    if (y < top || y > top + 3) continue;
    const cols = leftFace ? LEFT_WINDOW_COLS : RIGHT_WINDOW_COLS;
    for (const [i, at] of cols.entries()) {
      if (c < at || c >= at + WIN_W) continue;
      if (y === top) return "1";
      if (y === top + 3) return leftFace ? "5" : "4";
      // Most west-face windows are lit; the shaded face is mostly dark.
      const lit =
        hash2(FLOOR_ROWS.indexOf(top) * 7 + i, leftFace ? 5 : 11) % 3 <
        (leftFace ? 2 : 1);
      const w = c - at;
      if (y === top + 1) return lit ? (w === 0 ? "h" : "g") : w === 0 ? "f" : "U";
      return lit ? (w === 0 || w === 3 ? "i" : "g") : w === 3 ? "f" : "U";
    }
  }
  return fill;
};

const buildingBase: string[] = Array.from({ length: BUILDING_H }, (_, y) => {
  let row = "";
  for (let x = 0; x < 64; x++) {
    if (y < 16) {
      // Roof diamond, top half: lit near rim, shaded far rim.
      const w = 4 * y + 4;
      const pad = (64 - w) / 2;
      if (x < pad || x >= pad + w) row += ".";
      else if (x < pad + 2) row += "5";
      else if (x >= pad + w - 2) row += "2";
      else row += ductPaint(x, y) ?? roofPaint(x, y);
    } else if (y < WALL_TOP) {
      // Walls rise as the roof's lower half contracts.
      const k = y - 16;
      if (x === 0 || x === 63) row += "1";
      else if (x <= 2 * k + 1) row += "3";
      else if (x >= 62 - 2 * k) row += "2";
      else if (x <= 2 * k + 3) row += "5";
      else if (x >= 60 - 2 * k) row += "2";
      else row += ductPaint(x, y) ?? roofPaint(x, y);
    } else if (y <= WALL_BOTTOM) {
      if (x === 0 || x === 63) row += "1";
      else if (x <= 31) row += facePaint(true, x - 1, y);
      else row += facePaint(false, x - 32, y);
    } else {
      // Base taper following the footprint diamond to its vertex.
      const k = y - (WALL_BOTTOM + 1);
      const inset = 2 * k + 2;
      const half = 29 - 2 * k;
      if (x < inset || x > 63 - inset) row += ".";
      else if (x === inset || x === 63 - inset) row += "1";
      else if (x < inset + 1 + half) row += "3";
      else row += "2";
    }
  }
  return row;
});

/** Second frame: lit windows dim / dim windows lift, sign shimmers. */
const buildingAlt = remapped(buildingBase, {
  g: "i",
  i: "g",
  h: "f",
  f: "h",
  j: "k",
  k: "j",
});

/* --- Streetlight: cyan lamp head on a slim steel pole (native).
 * The lamp casts its own light: a soft halo around the head and a
 * pooled glow diamond on the pavement, both of which die in the
 * flicker-dropout frame. 24×88, ground contact at (12, 84). --- */

const pole = gap(9) + "076610" + gap(9);
const poleGlint = gap(9) + "087610" + gap(9);
/** Mid-pole maintenance plate rows; interior is 8 art pixels wide. */
const plate = (interior: string): string => gap(7) + "0" + interior + "0" + gap(7);

const streetlightOn: string[] = [
  "......000000000000......",
  ".....0T9TTTTTTTT660.....",
  "....i0hhhhhhhhhhhh0i....",
  "...i0ghhhhhhhhhhhhg0i...",
  "...i0ghhhhhhhhhhhhg0i...",
  "....i0gggggggggggg0i....",
  ".....0iggggggggggi0.....",
  "......000000000000......",
  ".......i.076610.i.......",
  pole,
  ...rep(4, poleGlint),
  ...rep(32, pole),
  gap(7) + "0000000000" + gap(7),
  plate("55555553"),
  plate("54444443"),
  plate("54444m43"),
  plate("54444443"),
  plate("54444443"),
  plate("33333333"),
  gap(7) + "0000000000" + gap(7),
  ...rep(24, pole),
  gap(8) + "07666610" + gap(8),
  gap(8) + "07666610" + gap(8),
  gap(7) + "0766666110" + gap(7),
  gap(7) + "0766666110" + gap(7),
  gap(6) + "076666666110" + gap(6),
  gap(6) + "076666666110" + gap(6),
  gap(5) + "06666666666110" + gap(5),
  "....ziiiggggggggiiiz....",
  "......ziiiiiiiiiiz......",
  "........zzzzzzzz........",
];

/** Soft pulse: the lens loses its hot core, the plate LED dims. */
const streetlightPulse = remapped(streetlightOn, { h: "g", m: "o" });

/** Flicker dropout: dead lens, no halo, only the plain ground shadow. */
const streetlightOff: string[] = [
  ...remapped(streetlightOn.slice(0, 85), { h: "i", g: "i", i: ".", m: "o" }),
  "......zzzzzzzzzzzz......",
  "........zzzzzzzz........",
  gap(24),
];

/* --- Vent stack: squat slate housing with a hazard-dashed lid rim, a
 * center exhaust grille, amber-glowing wall slits, and a three-frame
 * steam wisp loop drifting up-right. 48×59, anchor (24, 45). --- */

const GRILLE_EDGE = "111111111111";
const GRILLE_SLAT = "131313131313";
const GRILLE_GLOW = "1313o1o31313";

/** Lid top half, row k of 12: width 4k+4, lit edge left, shaded right. */
const ventLid = (k: number, body: string): string =>
  gap(22 - 2 * k) + "55" + body + "43" + gap(22 - 2 * k);

/** Lid bottom half: side walls grow in as the lid contracts. */
const ventContract = (k: number, lid: string): string =>
  "1" + "3".repeat(2 * k + 1) + lid + "2".repeat(2 * k + 1) + "1";

/** Straight wall band; slit rows carry an amber glow char per face. */
const ventWall = (glowL: string, glowR: string): string =>
  "1" +
  "333" + "1" + glowL + "1" + "3333" + "1" + glowL + "1" + "3333" + "1" + glowL + "1" + "333" +
  "222" + "1" + glowR + "1" + "2222" + "1" + glowR + "1" + "2222" + "1" + glowR + "1" + "222" +
  "1";
const ventWallPlain = "1" + "3".repeat(23) + "2".repeat(23) + "1";

/** Wall bottom following the footprint diamond, with a z shadow fringe. */
const ventTaper = (k: number): string =>
  gap(2 * k + 2) +
  "1" + "3".repeat(21 - 2 * k) + "2".repeat(21 - 2 * k) + "1" +
  (k <= 8 ? "zz" + gap(2 * k) : gap(2 * k + 2));

const ventHazardLid = (k: number): string => {
  const lidW = 44 - 4 * k;
  return k % 2 === 0 ? "ZZ" + "4".repeat(lidW - 4) + "YY" : "4".repeat(lidW);
};

const ventBody: string[] = [
  ventLid(0, ""),
  ventLid(1, "4444"),
  ventLid(2, "44444444"),
  ventLid(3, "444444444444"),
  ventLid(4, "4444m444444m4444"),
  ventLid(5, "44444444444444444444"),
  ventLid(6, "444444444444444444444444"),
  ventLid(7, "4444444444444444444444444444"),
  ventLid(8, "44444444444444444444444444444444"),
  ventLid(9, "444444444444" + GRILLE_EDGE + "444444444444"),
  ventLid(10, "44444444444444" + GRILLE_SLAT + "44444444444444"),
  ventLid(11, "4444444444444444" + GRILLE_GLOW + "4444444444444444"),
  ventContract(0, "4444444444444444" + GRILLE_GLOW + "4444444444444444"),
  ventContract(1, "44444444444444" + GRILLE_SLAT + "44444444444444"),
  ventContract(2, "444444444444" + GRILLE_EDGE + "444444444444"),
  ventContract(3, ventHazardLid(3)),
  ventContract(4, ventHazardLid(4)),
  ventContract(5, ventHazardLid(5)),
  ventContract(6, ventHazardLid(6)),
  ventContract(7, ventHazardLid(7)),
  ventContract(8, ventHazardLid(8)),
  ventContract(9, ventHazardLid(9)),
  ventContract(10, ventHazardLid(10)),
  ventWallPlain,
  ventWallPlain,
  ventWall("o", "o"),
  ventWall("m", "o"),
  ventWall("m", "o"),
  ventWall("m", "o"),
  ventWall("m", "o"),
  ventWall("m", "o"),
  ventWall("m", "o"),
  ventWall("o", "o"),
  ventWallPlain,
  ventWallPlain,
  ventTaper(0),
  ventTaper(1),
  ventTaper(2),
  ventTaper(3),
  ventTaper(4),
  ventTaper(5),
  ventTaper(6),
  ventTaper(7),
  ventTaper(8),
  ventTaper(9),
  ventTaper(10),
  gap(26) + "zzzzzz" + gap(16),
];

/** Alternate body: the amber glow chars trade places so slits shimmer. */
const ventBodyGlow = remapped(ventBody, { m: "o", o: "m" });

const ventSteamA: string[] = [
  gap(48),
  gap(48),
  gap(29) + "7" + gap(18),
  gap(27) + "77" + gap(19),
  gap(48),
  gap(24) + "77" + gap(22),
  gap(23) + "887" + gap(22),
  gap(48),
  gap(21) + "88" + gap(25),
  gap(20) + "798" + gap(25),
  gap(21) + "88" + gap(25),
  gap(22) + "8" + gap(25),
];

const ventSteamB: string[] = [
  gap(31) + "7" + gap(16),
  gap(29) + "77" + gap(17),
  gap(48),
  gap(26) + "77" + gap(20),
  gap(25) + "87" + gap(21),
  gap(48),
  gap(22) + "88" + gap(24),
  gap(21) + "887" + gap(24),
  gap(48),
  gap(22) + "98" + gap(24),
  gap(21) + "88" + gap(25),
  gap(48),
];

const ventSteamC: string[] = [
  gap(33) + "77" + gap(13),
  gap(48),
  gap(30) + "7" + gap(17),
  gap(48),
  gap(27) + "78" + gap(19),
  gap(26) + "8" + gap(21),
  gap(48),
  gap(23) + "87" + gap(23),
  gap(22) + "88" + gap(24),
  gap(48),
  gap(22) + "8" + gap(25),
  gap(21) + "98" + gap(25),
];

const ventStack: readonly PixelGrid[] = [
  [...ventSteamA, ...ventBody],
  [...ventSteamB, ...ventBodyGlow],
  [...ventSteamC, ...ventBody],
];

/* --- Crate: rusty iso cube with a hazard band, chrome corner strap,
 * and stencil marks. 32×30, anchor (16, 20). --- */

/** Cube lid top half, row k of 8: width 4k+4. */
const crateLid = (k: number, body: string): string =>
  gap(14 - 2 * k) + "cc" + body + "ba" + gap(14 - 2 * k);

const crateContract = (k: number, lid: string): string =>
  "1" + "b".repeat(2 * k + 1) + lid + "a".repeat(2 * k + 1) + "1";

const crateHazardLid = (k: number): string => {
  const lidW = 28 - 4 * k;
  return k % 2 === 0 ? "ZZ" + "b".repeat(lidW - 4) + "YY" : "b".repeat(lidW);
};

/** Straight wall row with the chrome strap down the front corner. */
const crateWall = (left: string, right: string): string =>
  "1" + left + "T" + "6" + right + "1";

const crateTaper = (k: number): string =>
  gap(2 * k + 2) +
  "1" + "b".repeat(12 - 2 * k) + "T" + "6" + "a".repeat(12 - 2 * k) + "1" +
  (k <= 5 ? "zz" + gap(2 * k) : gap(2 * k + 2));

const crate: string[] = [
  crateLid(0, ""),
  crateLid(1, "bbbb"),
  crateLid(2, "bbbabbbb"),
  crateLid(3, "bbbbabbbbbbb"),
  crateLid(4, "bbbbbabbbbbbbabb"),
  crateLid(5, "bbbabbbbbbbbabbbbbbb"),
  crateLid(6, "bbbbbbabbbb11bbbbabbbbbb"),
  crateLid(7, "bbbabbbbbbbbbbbbbbbbabbbbbbb"),
  crateContract(0, crateHazardLid(0)),
  crateContract(1, crateHazardLid(1)),
  crateContract(2, crateHazardLid(2)),
  crateContract(3, crateHazardLid(3)),
  crateContract(4, crateHazardLid(4)),
  crateContract(5, crateHazardLid(5)),
  crateContract(6, crateHazardLid(6)),
  crateWall("cbbbbbbbbbbbbb", "aaaaaaaaaaaaaa"),
  crateWall("bbb11bbbbbbbbb", "aaaaaaaaaaaaaa"),
  crateWall("ZZZZZZZZZZZZZZ", "YYYYYYYYYYYYYY"),
  crateWall("ZZZZZZZZZZZZZZ", "YYYYYYYYYYYYYY"),
  crateWall("11111111111111", "11111111111111"),
  crateWall("bbbbbbbbbbbbbb", "aaaaaaaaaaaaaa"),
  crateWall("bbbbbbbbbbbbbb", "aaaaaaaaaaaaaa"),
  crateTaper(0),
  crateTaper(1),
  crateTaper(2),
  crateTaper(3),
  crateTaper(4),
  crateTaper(5),
  crateTaper(6),
  gap(18) + "zzzzzz" + gap(8),
];

/* --- Barrier: two concrete posts carrying a hazard-striped panel with
 * a chasing LED strip along the top channel. 56×27, anchor (28, 25). --- */

const BAR_STRIPE_UNIT = "ZZZZ1111";

/** One 52-wide row of the 45° hazard stripes, shifted per panel row. */
const barStripe = (offset: number): string => {
  const doubled = BAR_STRIPE_UNIT + BAR_STRIPE_UNIT;
  const shifted = doubled.slice(offset % 8, (offset % 8) + 8);
  return ".0" + shifted.repeat(7).slice(0, 52) + "0.";
};

/** The LED channel: an amber dot every 6 px, offset per frame. */
const barLed = (offset: number): string => {
  let channel = "";
  for (let c = 0; c < 52; c++) channel += c % 6 === offset ? "m" : "1";
  return ".0" + channel + "0.";
};

const barPost = gap(8) + "0SRRQ0" + gap(28) + "0SRRQ0" + gap(8);
const barFeet =
  gap(6) + "0" + "66666666" + "0" + gap(24) + "0" + "66666666" + "0" + gap(6);

const barrierFrame = (ledOffset: number): string[] => [
  "." + "0".repeat(54) + ".",
  ".0" + "9" + "T".repeat(49) + "66" + "0.",
  barLed(ledOffset),
  barStripe(0).replaceAll("Z", "n"),
  barStripe(1),
  barStripe(2),
  barStripe(3),
  barStripe(4),
  barStripe(5),
  barStripe(6),
  ".0" + "1".repeat(52) + "0.",
  "." + "0".repeat(54) + ".",
  ...rep(13, barPost),
  barFeet,
  gap(5) + "z".repeat(13) + gap(20) + "z".repeat(13) + gap(5),
];

/* --- Hydrant: squat coolant hydrant — chrome dome, rust body with a
 * danger-red band, side nozzles, blinking status LED. 18×28,
 * anchor (9, 25). --- */

const hydrantBody = gap(4) + "0ccbbbbaa0" + gap(4);

const hydrantOn: string[] = [
  gap(7) + "0TT0" + gap(7),
  gap(5) + "0T99T60" + gap(6),
  gap(4) + "0T99TT6660" + gap(4),
  gap(4) + "0777666660" + gap(4),
  gap(4) + "0ccbgbbaa0" + gap(4),
  gap(4) + "0ppppppp10" + gap(4),
  gap(4) + "0ppppppp10" + gap(4),
  hydrantBody,
  "." + "000" + "0ccbbbbaa0" + "000" + ".",
  "0T96" + "0ccbbbbaa0" + "66a0",
  "0T96" + "0ccbbbbaa0" + "66a0",
  "0966" + "0ccbbbbaa0" + "61a0",
  "." + "000" + "0ccbbbbaa0" + "000" + ".",
  hydrantBody,
  hydrantBody,
  gap(4) + "0c9bbbb9a0" + gap(4),
  hydrantBody,
  hydrantBody,
  hydrantBody,
  hydrantBody,
  hydrantBody,
  gap(4) + "0ccbbbbaa0" + gap(4),
  gap(3) + "0ccbbbbbbaa0" + gap(3),
  gap(2) + "0cbbbbbbbbbba0" + gap(2),
  gap(2) + "01111111111110" + gap(2),
  gap(2) + "00000000000000" + gap(2),
  gap(4) + "zzzzzzzzzzzz" + gap(2),
  gap(6) + "zzzzzz" + gap(6),
];

const hydrantOff = remapped(hydrantOn, { g: "i" });

/* --- Trash heap: mounded refuse bags in dark fabric with rust-can and
 * paper-scrap detail. 44×24, anchor (22, 20). Static. --- */

const trashHeap: string[] = [
  gap(44),
  gap(12) + "0000" + gap(28),
  gap(10) + "00XX50" + gap(28),
  gap(9) + "0XXXXWWW50" + gap(25),
  gap(8) + "0XXXXWWWWW50" + gap(24),
  gap(7) + "0XXXWWWWWWWW50" + gap(23),
  gap(6) + "0XXWWWWVVWWWWWX0" + gap(22),
  gap(5) + "0XWWWWWVV5VWWWWWV00" + gap(20),
  gap(4) + "0XXWWWWWVVVWWWWWWWV000" + gap(18),
  gap(3) + "0XWWWWWWWWWWWWWWWWWV0XX500" + gap(15),
  gap(3) + "0XWWWWWWWWWWWWWWWWWV0XXXWW50" + gap(13),
  gap(2) + "0XWWWWWVVWWWWWWWWWWWV0XXWWWWW50" + gap(11),
  gap(2) + "0WWWWWWWWWWWWWWWWWWWWV0XWWWWWWW00" + gap(9),
  gap(1) + "0WWWWVVWWWWWWWWWWVVWWWV0WWWVVWWWWW00" + gap(7),
  gap(1) + "0WWWWWW8888WWWWWWWWWWWVVWWWWWWWWWWWW0" + gap(6),
  "0VWWWWWW8887WWWWWWWWWWWWWWWWWWWWVVWWW00" + gap(5),
  "0V" + "WWWW" + "877" + "W".repeat(22) + "VV" + "WWWWWWW" + "V0" + gap(2),
  gap(1) + "0" + "VVVV" + "W".repeat(11) + "VVV" + "W".repeat(8) + "VV" +
    "WW" + "cba" + "WWWW" + "V" + "00" + gap(2),
  gap(2) + "00" + "V".repeat(34) + "00" + gap(4),
  gap(3) + "0".repeat(36) + gap(5),
  gap(2) + "89" + gap(29) + "8" + gap(3) + "m" + gap(6),
  gap(3) + "z".repeat(36) + gap(5),
  gap(6) + "z".repeat(30) + gap(8),
  gap(10) + "z".repeat(20) + gap(14),
];

/* --- Cable bundle: sagging power cables draped across the tile with a
 * junction box whose LED blinks; the cyan line shimmers. 56×14,
 * anchor (28, 10). Walkable clutter — characters step over it. --- */

const cableBundle: string[] = [
  gap(56),
  gap(56),
  gap(20) + "000000000000" + gap(24),
  gap(20) + "055555555540" + gap(24),
  gap(20) + "054444444430" + gap(24),
  gap(20) + "05444444m430" + gap(24),
  "5".repeat(13) + gap(7) + "054444444430" + gap(11) + "5".repeat(13),
  "4".repeat(13) + "5".repeat(7) + "054444444430" + "5".repeat(11) + "4".repeat(13),
  "1".repeat(13) + "4".repeat(7) + "000000000000" + "4".repeat(11) + "1".repeat(13),
  "g".repeat(8) + gap(4) + "1".repeat(8) + "z".repeat(12) + "1".repeat(11) +
    gap(5) + "g".repeat(8),
  "i".repeat(7) + "gg" + gap(38) + "gg" + "i".repeat(7),
  gap(9) + "ii" + "g".repeat(34) + "ii" + gap(9),
  gap(11) + "i".repeat(34) + gap(11),
  gap(11) + "z".repeat(34) + gap(11),
];

/* --- Signage: neon boards, holo ads, and a projected billboard.
 * All signage is native hi-res and carries the street's night light:
 * neon glyphs run a bright core stroke inside a dim halo ring, holo
 * projections read translucent through checker dithering with a
 * sweeping scanline and an occasional one-pixel glitch slip. Brands
 * are invented in-world marks — abstract glyph shapes only, nothing
 * readable, so nothing needs localizing. --- */

/**
 * Ring the background pixels around neon strokes with their halo char:
 * every `bg` pixel touching (8-neighborhood) a stroke char listed in
 * `halo` takes that stroke's halo color.
 */
const haloed = (
  grid: readonly string[],
  halo: Readonly<Record<string, string>>,
  bg: string,
): string[] =>
  grid.map((row, y) =>
    [...row]
      .map((ch, x) => {
        if (ch !== bg) return ch;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const glow = halo[grid[y + dy]?.[x + dx] ?? ""];
            if (glow !== undefined) return glow;
          }
        }
        return ch;
      })
      .join(""),
  );

/**
 * Weave a hologram panel from a stroke mask: "#" pixels are the solid
 * bright glyph, "-" the translucent field — checker-dithered so the
 * scene shows through — with a dim border and a bright scanline row
 * that sweeps with `scanPhase` to give the projection its shimmer.
 */
const holoPanel = (mask: readonly string[], scanPhase: number): string[] =>
  mask.map((row, y) =>
    [...row]
      .map((ch, x) => {
        if (ch === "#") return "u";
        if (ch !== "-") return ch;
        if ((x + y) % 2 !== 0) return ".";
        if ((y + scanPhase) % 6 === 0) return "u";
        const edge =
          y === 0 || y === mask.length - 1 || x < 2 || x >= row.length - 2;
        return edge ? "s" : "t";
      })
      .join(""),
  );

/** Holo glitch: the rows in [from, to) slip one pixel to the right. */
const glitched = (grid: readonly string[], from: number, to: number): string[] =>
  grid.map((row, y) => (y >= from && y < to ? "." + row.slice(0, -1) : row));

/** One row of a dithered projection beam centered on `center`. */
const beamRow = (
  width: number,
  center: number,
  half: number,
  y: number,
): string => {
  let row = "";
  for (let x = 0; x < width; x++) {
    row += Math.abs(x - center) <= half && (x + y) % 2 === 0 ? "s" : ".";
  }
  return row;
};

const dash = (n: number): string => "-".repeat(n);

/* --- Neon sign: a vertical bar totem (the Drowned Kite's mark).
 * Magenta glyph runes between cyan trim tubes on an ink board, slim
 * pole to a street base. 24×88, anchor (12, 84). --- */

const NEON_RUNES: string[] = [
  "gggggghhgggggg",
  gap(14),
  "......kk......",
  ".....j..j.....",
  "....j....j....",
  ".....j..j.....",
  "......jj......",
  "........j.....",
  ".........j....",
  gap(14),
  "..jjjjjjjjjj..",
  gap(14),
  "..jjj.kk.jjj..",
  gap(14),
  "..jjjjj..jjj..",
  gap(14),
  "....jjjjjj....",
  gap(14),
  "...jjjjjj.....",
  "..j......j....",
  "..j..kk..j....",
  "..j....jj.....",
  "..j...........",
  "...jjjjjjj....",
  gap(14),
  "......jjj.....",
  ".....jj.......",
  "....jj........",
  "...jjkkjjj....",
  "......jj......",
  ".....jj.......",
  "....jj........",
  gap(14),
  "..jjjj..jjjj..",
  gap(14),
  "..jjjjjjjjjj..",
  gap(14),
  "....kk..jjjj..",
  gap(14),
  gap(14),
  "gggggghhgggggg",
  gap(14),
];

const neonBoard = remapped(
  haloed(NEON_RUNES, { j: "l", k: "l", g: "i", h: "i" }, "."),
  { ".": "1" },
);

const neonEdge = gap(4) + "0".repeat(16) + gap(4);

const neonSignLit: string[] = [
  neonEdge,
  ...neonBoard.map((row) => gap(4) + "0" + row + "0" + gap(4)),
  neonEdge,
  ...rep(36, pole),
  gap(8) + "07666610" + gap(8),
  gap(8) + "07666610" + gap(8),
  gap(7) + "0766666110" + gap(7),
  gap(7) + "0766666110" + gap(7),
  gap(6) + "066666666110" + gap(6),
  gap(4) + "z".repeat(16) + gap(4),
  gap(6) + "z".repeat(12) + gap(6),
  gap(8) + "z".repeat(8) + gap(8),
];

/** Shimmer: hot cores relax to the base stroke, then the whole flares. */
const neonSignSoft = remapped(neonSignLit, { k: "j", h: "g" });
const neonSignFlare = remapped(neonSignLit, { j: "k", g: "h" });
/** Flicker dropout: dead tubes keep a dim tint, halos vanish to ink. */
const neonSignDead = remapped(neonSignLit, {
  j: "l",
  k: "l",
  l: "1",
  g: "i",
  h: "i",
  i: "1",
});

/* --- Shop sign: a sidewalk A-frame glyph board — an amber bowl-and-
 * steam mark over abstract menu lines. 28×28, anchor (14, 24). --- */

const SHOP_RUNES: string[] = [
  gap(18),
  ".......mm.........",
  ".....mm...mm......",
  gap(18),
  "...mmmmmmmmmmmm...",
  "....m..nn....m....",
  ".....mmmmmmmm.....",
  gap(18),
  gap(18),
  "..mm.nn.mm.mm.....",
  gap(18),
  gap(18),
  "...mmmmm..mmmm....",
  gap(18),
  gap(18),
];

const shopBoard = remapped(haloed(SHOP_RUNES, { m: "o", n: "o" }, "."), {
  ".": "1",
});

const shopEdge = gap(4) + "0".repeat(20) + gap(4);

const shopSignLit: string[] = [
  shopEdge,
  ...shopBoard.map((row) => gap(4) + "0" + row + "0" + gap(4)),
  shopEdge,
  gap(4) + "06" + gap(16) + "60" + gap(4),
  gap(3) + "06" + gap(18) + "60" + gap(3),
  gap(3) + "06" + gap(18) + "60" + gap(3),
  gap(2) + "06" + gap(8) + "1111" + gap(8) + "60" + gap(2),
  gap(2) + "06" + gap(20) + "60" + gap(2),
  gap(1) + "06" + gap(22) + "60" + gap(1),
  gap(1) + "011" + gap(20) + "110" + gap(1),
  "0111" + gap(20) + "1110",
  gap(2) + "zzzz" + gap(16) + "zzzz" + gap(2),
  gap(5) + "z".repeat(18) + gap(5),
  gap(8) + "z".repeat(12) + gap(8),
];

const shopSignSoft = remapped(shopSignLit, { n: "m" });
const shopSignDead = remapped(shopSignLit, { n: "o", m: "o", o: "1" });

/* --- Holo ad: a floating hologram panel projected from a chrome
 * pedestal — an orbit-ring mark over abstract glyph lines and a small
 * price tag. 48×46, anchor (24, 42). --- */

const HOLO_AD_MASK: string[] = [
  dash(40),
  dash(40),
  dash(17) + "######" + dash(17),
  dash(15) + "##" + dash(6) + "##" + dash(15),
  dash(14) + "#" + dash(10) + "#" + dash(14),
  dash(13) + "#" + dash(12) + "#" + dash(13),
  dash(13) + "#" + dash(5) + "##" + dash(5) + "#" + dash(13),
  dash(2) + "#".repeat(36) + dash(2),
  dash(13) + "#" + dash(5) + "##" + dash(5) + "#" + dash(13),
  dash(13) + "#" + dash(12) + "#" + dash(13),
  dash(14) + "#" + dash(10) + "#" + dash(14),
  dash(15) + "##" + dash(6) + "##" + dash(15),
  dash(17) + "######" + dash(17),
  dash(40),
  dash(5) + "####" + dash(2) + "##" + dash(2) + "######" + dash(2) + "##" + dash(2) + "####" + dash(9),
  dash(40),
  dash(7) + "##" + dash(2) + "####" + dash(2) + "########" + dash(2) + "##" + dash(11),
  dash(40),
  dash(24) + "####" + dash(2) + "##" + dash(8),
  dash(40),
];

const holoPedestal = (lit: boolean): string[] => [
  gap(20) + "00000000" + gap(20),
  gap(20) + (lit ? "0T9t6660" : "0T916660") + gap(20),
  gap(20) + "0T966660" + gap(20),
  gap(20) + "00000000" + gap(20),
  ...rep(6, gap(21) + "076610" + gap(21)),
  gap(20) + "07666610" + gap(20),
  gap(19) + "0766666110" + gap(19),
  gap(18) + "076666666110" + gap(18),
  gap(14) + "z".repeat(20) + gap(14),
  gap(17) + "z".repeat(14) + gap(17),
  gap(20) + "z".repeat(8) + gap(20),
];

const holoAdFrame = (scanPhase: number): string[] => [
  ...holoPanel(HOLO_AD_MASK, scanPhase).map((row) => gap(4) + row + gap(4)),
  ...Array.from({ length: 10 }, (_, i) =>
    beamRow(48, 24, 8 - Math.floor(i / 2), 20 + i),
  ),
  ...holoPedestal(true),
];

const holoAdA = holoAdFrame(0);
const holoAdOff: string[] = [...rep(30, gap(48)), ...holoPedestal(false)];

/* --- Holo billboard: a wide district ad projected high off a street
 * mast — a meridian-orb mark with glyph lines and a banner strip.
 * 64×88, anchor (32, 84). --- */

const HOLO_BILLBOARD_MASK: string[] = [
  dash(60),
  dash(60),
  dash(60),
  dash(60),
  dash(15) + "#".repeat(10) + dash(35),
  dash(13) + "##" + dash(8) + "##" + dash(35),
  dash(12) + "#" + dash(12) + "#" + dash(34),
  dash(11) + "#" + dash(14) + "#" + dash(33),
  dash(11) + "#" + dash(14) + "#" + dash(6) + "######" + dash(2) + "##" + dash(2) + "########" + dash(7),
  dash(10) + "#" + dash(16) + "#" + dash(32),
  dash(10) + "#" + dash(7) + "##" + dash(7) + "#" + dash(32),
  dash(10) + "#" + dash(6) + "####" + dash(6) + "#" + dash(32),
  dash(8) + "#".repeat(22) + dash(30),
  dash(10) + "#" + dash(6) + "####" + dash(6) + "#" + dash(32),
  dash(10) + "#" + dash(7) + "##" + dash(7) + "#" + dash(32),
  dash(10) + "#" + dash(16) + "#" + dash(32),
  dash(11) + "#" + dash(14) + "#" + dash(6) + "####" + dash(2) + "########" + dash(2) + "####" + dash(7),
  dash(11) + "#" + dash(14) + "#" + dash(33),
  dash(12) + "#" + dash(12) + "#" + dash(34),
  dash(13) + "##" + dash(8) + "##" + dash(35),
  dash(15) + "#".repeat(10) + dash(35),
  dash(60),
  dash(60),
  dash(60),
  dash(10) + "####" + dash(3) + "##" + dash(2) + "######" + dash(4) + "####" + dash(2) + "##########" + dash(13),
  dash(60),
  dash(60),
  dash(60),
  dash(60),
  dash(60),
];

const billboardMast = (lit: boolean): string[] => [
  gap(26) + "000000000000" + gap(26),
  gap(26) + (lit ? "0T99t6666660" : "0T9916666660") + gap(26),
  gap(26) + "0T9666666660" + gap(26),
  gap(26) + "000000000000" + gap(26),
  ...rep(34, gap(29) + "076610" + gap(29)),
  gap(28) + "07666610" + gap(28),
  gap(28) + "07666610" + gap(28),
  gap(27) + "0766666110" + gap(27),
  gap(26) + "076666666110" + gap(26),
  gap(25) + "06666666666110" + gap(25),
  gap(20) + "z".repeat(24) + gap(20),
  gap(24) + "z".repeat(16) + gap(24),
  gap(28) + "z".repeat(8) + gap(28),
];

const holoBillboardFrame = (scanPhase: number): string[] => [
  ...holoPanel(HOLO_BILLBOARD_MASK, scanPhase).map((row) => gap(2) + row + gap(2)),
  ...Array.from({ length: 12 }, (_, i) =>
    beamRow(64, 32, 10 - Math.floor(i / 2), 30 + i),
  ),
  ...billboardMast(true),
];

const holoBillboardA = holoBillboardFrame(0);
const holoBillboardOff: string[] = [...rep(42, gap(64)), ...billboardMast(false)];

export const PROP_ART: Readonly<Record<PropId, PropArt>> = {
  building: {
    frames: [buildingBase, buildingAlt],
    anchorX: 32,
    anchorY: 76,
    frameMs: 1400,
    flicker: false,
    // Magenta wash off the tenant-sign board and lit windows.
    glow: [{ color: "j", radius: 22, intensity: 0.24, offsetX: 8, offsetY: -24 }],
  },
  "vent-stack": {
    frames: ventStack,
    anchorX: 24,
    anchorY: 45,
    frameMs: 420,
    flicker: false,
    // Amber seeping from the exhaust grille and wall slits.
    glow: [{ color: "m", radius: 14, intensity: 0.2, offsetX: 0, offsetY: -12 }],
  },
  crate: {
    frames: [crate],
    anchorX: 16,
    anchorY: 20,
    frameMs: 0,
    flicker: false,
  },
  barrier: {
    frames: [barrierFrame(2), barrierFrame(5)],
    anchorX: 28,
    anchorY: 25,
    frameMs: 700,
    flicker: false,
  },
  streetlight: {
    frames: [streetlightOn, streetlightPulse, streetlightOff],
    anchorX: 12,
    anchorY: 84,
    frameMs: 1100,
    flicker: true,
    // A halo at the lamp head plus the pooled light on the pavement.
    glow: [
      { color: "g", radius: 22, intensity: 0.42, offsetX: 0, offsetY: -80 },
      { color: "g", radius: 18, intensity: 0.18, offsetX: 0, offsetY: 0 },
    ],
  },
  hydrant: {
    frames: [hydrantOn, hydrantOff],
    anchorX: 9,
    anchorY: 25,
    frameMs: 1300,
    flicker: false,
  },
  "trash-heap": {
    frames: [trashHeap],
    anchorX: 22,
    anchorY: 20,
    frameMs: 0,
    flicker: false,
  },
  "cable-bundle": {
    frames: [cableBundle, remapped(cableBundle, { m: "o", g: "h" })],
    anchorX: 28,
    anchorY: 10,
    frameMs: 800,
    flicker: false,
  },
  "holo-sign": {
    frames: [holoAdA, holoAdFrame(3), glitched(holoAdA, 5, 9), holoAdOff],
    anchorX: 24,
    anchorY: 42,
    frameMs: 460,
    flicker: true,
    // Hologram-blue projection haze around the floating panel.
    glow: [{ color: "t", radius: 20, intensity: 0.36, offsetX: 0, offsetY: -32 }],
  },
  "neon-sign": {
    frames: [neonSignLit, neonSignSoft, neonSignFlare, neonSignDead],
    anchorX: 12,
    anchorY: 84,
    frameMs: 640,
    flicker: true,
    // Magenta bloom off the rune board, centered on the totem.
    glow: [{ color: "j", radius: 26, intensity: 0.46, offsetX: 0, offsetY: -62 }],
  },
  "holo-billboard": {
    frames: [
      holoBillboardA,
      holoBillboardFrame(3),
      glitched(holoBillboardA, 10, 15),
      holoBillboardOff,
    ],
    anchorX: 32,
    anchorY: 84,
    frameMs: 520,
    flicker: true,
    // Wide district-ad wash high on the mast.
    glow: [{ color: "t", radius: 32, intensity: 0.34, offsetX: 0, offsetY: -69 }],
  },
  "shop-sign": {
    frames: [shopSignLit, shopSignSoft, shopSignDead],
    anchorX: 14,
    anchorY: 24,
    frameMs: 900,
    flicker: true,
    // Amber A-frame board at street level.
    glow: [{ color: "m", radius: 15, intensity: 0.36, offsetX: 0, offsetY: -16 }],
  },
};
