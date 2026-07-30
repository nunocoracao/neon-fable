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
import { mirrored, remapped, type PixelGrid } from "./pixel";

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

/* --- Market dressing. The Vertical Market's aisles are built out of
 * four pieces of stall furniture: the striped awning a broker trades
 * under, the caged lamps strung over the walkways, lashed crate stacks
 * waiting on the boards, and a hot noodle counter steaming into the
 * night. All four are native hi-res and share the street's light —
 * top-left, amber at street level, chrome where the scaffold shows.
 *
 * The boxy pieces are built from one isometric-box painter rather than
 * hand-laid rows: a stall's counter and a food bar are the same solid
 * seen at different sizes, and a shared painter keeps their edges,
 * facing shades, and footprints in agreement. --- */

/** Ink colors an isometric box is painted in, lit from the top left. */
export interface BoxInk {
  /** The top face. */
  top: string;
  /** Lit rim along the top face's upper-left edge. */
  rim: string;
  /** The lit (left) wall face. */
  left: string;
  /** The shaded (right) wall face. */
  right: string;
  /** Silhouette outline. */
  ink: string;
  /** Plank/plate seams across the top face, along the iso grain. */
  grain?: string;
}

/**
 * An isometric box: a `w`-wide lid diamond (w must be a multiple of 4)
 * over `wallH` rows of wall, tapering back to the footprint diamond's
 * bottom vertex. Rows are `w` wide and the grid is `w / 2 + wallH`
 * tall; the footprint's center — the point that lands on the tile
 * diamond's center — sits at row `wallH + w / 4`.
 */
export const isoBox = (w: number, wallH: number, ink: BoxInk): string[] => {
  const lidH = w / 2;
  /** Horizontal span [from, to) of a lid diamond at row r, if any. */
  const lidSpan = (r: number): readonly [number, number] | null => {
    if (r < 0 || r >= lidH) return null;
    const width = 4 * Math.min(r, lidH - 1 - r) + 4;
    return [(w - width) / 2, (w + width) / 2] as const;
  };
  return Array.from({ length: lidH + wallH }, (_, y) => {
    const top = lidSpan(y);
    const foot = lidSpan(y - wallH);
    let from = w;
    let to = 0;
    for (const span of [top, foot]) {
      if (!span) continue;
      from = Math.min(from, span[0]);
      to = Math.max(to, span[1]);
    }
    // Between the two diamonds' waists the side walls run full width.
    if (y >= lidH / 2 - 1 && y <= wallH + lidH / 2) {
      from = 0;
      to = w;
    }
    let row = "";
    for (let x = 0; x < w; x++) {
      if (x < from || x >= to) {
        row += ".";
      } else if (x === from || x === to - 1) {
        row += ink.ink;
      } else if (top && x >= top[0] && x < top[1]) {
        // Top face: lit along its upper-left rim, a darker step on the
        // far one, and between them the surface, seamed along one axis
        // of the iso grain where the box asks for planking.
        const surface =
          ink.grain !== undefined && (x - 2 * y + 4 * w) % 10 === 0
            ? ink.grain
            : ink.top;
        if (x < top[0] + 2) row += ink.rim;
        else if (x >= top[1] - 2) row += ink.left;
        else row += surface;
      } else {
        row += x < w / 2 ? ink.left : ink.right;
      }
    }
    return row;
  });
};

/**
 * An isometric slab standing on a rectangular footprint: `wx` tiles
 * along the map's x axis by `wy` along its y, raised `wallH` rows off
 * the ground. isoBox draws one tile's worth of solid; this draws the
 * set-piece case — a hull, a gantry deck — whose bulk lies across
 * several, and which is placed with a PropPlacement footprint to match.
 *
 * Geometry follows from the tile diamond alone (64x32 at 1x, so a step
 * along x is +32/+16 art pixels and a step along y is -32/+16): the
 * grid is exactly the footprint's parallelogram plus the wall, anchored
 * on the near tile — the one with the greatest x + y — so a placement's
 * own tile is the nearest one its bulk covers and painter's order needs
 * no special case. Exactly 16 rows fall below the anchor, the same half
 * tile every other prop is held to.
 */
export interface SlabArt {
  grid: string[];
  /** Ground contact, in art pixels: the near tile's diamond center. */
  anchorX: number;
  anchorY: number;
}

/** Tile-space coordinates of an art pixel offset from a tile's center. */
const tileU = (px: number, py: number): number => px / 64 + py / 32;
const tileV = (px: number, py: number): number => py / 32 - px / 64;

export const isoSlab = (
  wx: number,
  wy: number,
  wallH: number,
  ink: BoxInk,
): SlabArt => {
  const anchorX = 32 * wx;
  const anchorY = wallH + 16 * (wx + wy - 1);
  const width = 32 * (wx + wy);
  const height = 16 * (wx + wy) + wallH + 1;
  /** Whether a ground-plane point lies on the footprint. */
  const onFootprint = (px: number, py: number): boolean => {
    const u = tileU(px, py);
    const v = tileV(px, py);
    return u >= 0.5 - wx && u <= 0.5 && v >= 0.5 - wy && v <= 0.5;
  };
  const grid = Array.from({ length: height }, (_, y) => {
    const cells: string[] = [];
    // Deck span of this row, for the rim and the far step.
    let deckFrom = -1;
    let deckTo = -1;
    let solidFrom = -1;
    let solidTo = -1;
    for (let x = 0; x < width; x++) {
      // Sample at the pixel's center; a pixel drawn at py stands for
      // ground py + k when the solid is k rows tall under it.
      const px = x - anchorX + 0.5;
      const py = y - anchorY + 0.5;
      const deck = onFootprint(px, py + wallH);
      let solid = deck;
      for (let k = 0; !solid && k < wallH; k++) solid = onFootprint(px, py + k);
      if (!solid) {
        cells.push(".");
        continue;
      }
      if (solidFrom < 0) solidFrom = x;
      solidTo = x;
      if (deck) {
        if (deckFrom < 0) deckFrom = x;
        deckTo = x;
        // Deck planking, seamed along one axis of the iso grain — the
        // same treatment isoBox gives a lid, at slab scale.
        cells.push(
          ink.grain !== undefined && (x - 2 * y + 4 * width) % 12 === 0
            ? ink.grain
            : ink.top,
        );
      } else {
        // Below the deck: the wall face the pixel hangs off is whichever
        // footprint edge it has fallen furthest past.
        const overU = tileU(px, py + wallH) - 0.5;
        const overV = tileV(px, py + wallH) - 0.5;
        cells.push(overU > overV ? ink.right : ink.left);
      }
    }
    // The deck lit along its near-left rim, stepped down on the far one.
    for (let i = 0; i < 2; i++) {
      if (deckFrom >= 0 && deckFrom + i <= deckTo) cells[deckFrom + i] = ink.rim;
      if (deckTo >= 0 && deckTo - i >= deckFrom) cells[deckTo - i] = ink.left;
    }
    if (solidFrom >= 0) cells[solidFrom] = ink.ink;
    if (solidTo >= 0) cells[solidTo] = ink.ink;
    return cells.join("");
  });
  return { grid, anchorX, anchorY };
};

/** Stamp `art` onto a copy of `base` at (x, y); transparency shows through. */
export const stamped = (
  base: readonly string[],
  art: readonly string[],
  x: number,
  y: number,
): string[] =>
  base.map((row, r) => {
    const source = art[r - y];
    if (source === undefined) return row;
    const cells = [...row];
    for (let i = 0; i < source.length; i++) {
      const ch = source[i] ?? ".";
      if (ch !== "." && x + i >= 0 && x + i < cells.length) cells[x + i] = ch;
    }
    return cells.join("");
  });

/** A transparent canvas to stamp onto. */
export const blank = (w: number, h: number): string[] => rep(h, gap(w));

/* --- Stall awning: a striped canopy on chrome poles over a plank
 * counter of goods, an amber strip lamp burning under the fabric.
 * 56×64, ground contact at (28, 50). --- */

const AWNING_W = 56;
/** Awning stripe ramps, shade -> base -> highlight, alternating bands. */
const AWNING_BANDS = [
  ["Y", "Z", "n"],
  ["V", "W", "X"],
] as const;

/** Canopy pixel: band by column, brightness by facet (top-left is lit). */
const canopyPaint = (x: number, lit: boolean): string => {
  const band = AWNING_BANDS[Math.floor(x / 7) % 2] ?? AWNING_BANDS[0];
  const step = (lit ? 1 : 0) + (x < AWNING_W / 2 ? 1 : 0);
  return band[step] ?? band[1];
};

const awningCanopy: string[] = Array.from({ length: 21 }, (_, y) => {
  // Rows 0-13 are the canopy's sloping half; 14-18 its front skirt;
  // 19-20 the scalloped fringe hanging off it.
  const width = y < 14 ? 4 * y + 4 : AWNING_W;
  const pad = (AWNING_W - width) / 2;
  let row = "";
  for (let x = 0; x < AWNING_W; x++) {
    if (x < pad || x >= pad + width) row += ".";
    else if (y >= 19 && Math.floor(x / 4) % 2 === 1) row += ".";
    else if (x === pad || x === pad + width - 1) row += "1";
    else if (y === 14) row += "1";
    else if (y === 17) row += x % 6 === 0 ? "m" : "o";
    else row += canopyPaint(x, y < 14);
  }
  return row;
});

/** A crate of goods on the counter: a small iso box in its own ramp. */
const awningGoods = (ink: BoxInk): string[] => isoBox(12, 5, ink);

/** The strip lamp under the canopy, chasing by frame phase. */
const awningStrip = (phase: number): string[] => [
  "1".repeat(30),
  Array.from({ length: 30 }, (_, i) => (i % 5 === phase ? "m" : "o")).join(""),
];

/** The stall without its canopy: poles, counter, goods, strip lamp. */
const awningStall = (phase: number): string[] => {
  let grid = blank(AWNING_W, 64);
  // Poles first, so the canopy laps over their tops and the counter
  // stands in front of them.
  grid = stamped(grid, rep(39, "0761"), 5, 14);
  grid = stamped(grid, rep(39, "0761"), 47, 14);
  grid = stamped(
    grid,
    isoBox(40, 14, {
      top: "b",
      rim: "c",
      left: "b",
      right: "a",
      ink: "1",
      grain: "a",
    }),
    8,
    26,
  );
  grid = stamped(
    grid,
    awningGoods({ top: "4", rim: "5", left: "4", right: "3", ink: "1" }),
    14,
    28,
  );
  grid = stamped(
    grid,
    awningGoods({ top: "b", rim: "c", left: "b", right: "a", ink: "1" }),
    30,
    30,
  );
  // A lantern jar burning on the counter's shaded end.
  grid = stamped(
    grid,
    ["..00..", ".0mn0.", "0mnnm0", "0omoo0", ".0oo0.", "..00.."],
    38,
    34,
  );
  grid = stamped(grid, awningStrip(phase), 13, 46);
  // Ground shadow under the counter and the poles.
  return stamped(
    grid,
    [
      gap(5) + "z".repeat(14) + gap(18) + "z".repeat(14) + gap(5),
      gap(8) + "z".repeat(9) + gap(22) + "z".repeat(9) + gap(8),
    ],
    0,
    60,
  );
};

const stallAwning: string[] = stamped(awningStall(0), awningCanopy, 0, 0);
/** Alternate frame: the strip lamp chases and the lantern jar pulses. */
const stallAwningAlt = remapped(
  stamped(awningStall(2), awningCanopy, 0, 0),
  { n: "m", m: "n" },
);

/* --- Cage lamp: a caged amber bulb strung from the scaffolding over a
 * walkway, pooling light on the boards below. Nothing of it touches the
 * ground, so the pool is its only ground contact. 20×64, anchor
 * (10, 60). Walkable clutter — characters pass underneath. --- */

const cageCable = gap(9) + "76" + gap(9);

const cageLampLit: string[] = [
  ...rep(8, cageCable),
  gap(7) + "0TT99TT0" + gap(5),
  gap(7) + "0T6666T0" + gap(5),
  gap(6) + "0T999999T0" + gap(4),
  gap(4) + "0TT9" + "6".repeat(6) + "9TT0" + gap(2),
  gap(4) + "0T" + "6".repeat(10) + "T0" + gap(2),
  gap(4) + "06" + "o".repeat(10) + "60" + gap(2),
  gap(4) + "06o" + "m".repeat(3) + "nn" + "m".repeat(3) + "o60" + gap(2),
  gap(4) + "T6o" + "m".repeat(2) + "nnnn" + "m".repeat(2) + "o6T" + gap(2),
  gap(4) + "96o" + "mnnnnnn" + "m" + "o69" + gap(2),
  gap(4) + "96o" + "mnnnnnn" + "m" + "o69" + gap(2),
  gap(4) + "T6o" + "m".repeat(2) + "nnnn" + "m".repeat(2) + "o6T" + gap(2),
  gap(4) + "06o" + "m".repeat(3) + "nn" + "m".repeat(3) + "o60" + gap(2),
  gap(4) + "06" + "o".repeat(10) + "60" + gap(2),
  gap(4) + "0T" + "6".repeat(10) + "T0" + gap(2),
  gap(5) + "0T" + "6666" + "9" + "6".repeat(2) + "T0" + gap(4),
  gap(6) + "0T6666T0" + gap(6),
  gap(8) + "0oo0" + gap(8),
  ...rep(33, gap(20)),
  gap(6) + "oo".repeat(4) + gap(6),
  gap(4) + "o.o.o.o.o.o." + gap(4),
  gap(3) + "o.o.o.o.o.o.o." + gap(3),
  gap(4) + "o.o.o.o.o.o." + gap(4),
  gap(6) + "o.o.o.o." + gap(6),
  gap(20),
];

/** Soft pulse: the filament relaxes and the pool dims with it. */
const cageLampDim = remapped(cageLampLit, { n: "m", m: "o" });
/** Flicker dropout: dead glass, and the boards below go dark. */
const cageLampDead: string[] = remapped(cageLampLit, {
  n: "o",
  m: "o",
  o: "1",
}).map((row, y) => (y >= 40 ? gap(20) : row));

/* --- Crate stack: freight lashed three high on the boards — a street
 * crate on the bottom, a steel case above it, a tarped bundle on top,
 * with the crate's own chrome strap carried up the front of the whole
 * stack. 48×44, anchor (24, 34). Static. --- */

const crateStack: string[] = stamped(
  stamped(
    stamped(
      stamped(blank(48, 44), crate, 8, 14),
      // A steel case above it, set back off the crate's near corner.
      isoBox(24, 10, { top: "4", rim: "5", left: "4", right: "3", ink: "1" }),
      9,
      6,
    ),
    // Topped by a tarped bundle.
    isoBox(16, 7, { top: "W", rim: "X", left: "W", right: "V", ink: "1" }),
    13,
    1,
  ),
  // The lashing strap, carried up the front from the crate's own.
  rep(23, "T6"),
  23,
  6,
);

/* --- Noodle counter: a hot bar with a chrome pot steaming over its
 * burner, bowls set out along the boards, and an amber service strip
 * down the front. 56×58, anchor (28, 46). --- */

const NOODLE_W = 56;

const noodlePot: string[] = [
  gap(4) + "0TT99TT0" + gap(4),
  gap(3) + "0T999999T0" + gap(3),
  gap(2) + "0T99" + "8".repeat(4) + "99T0" + gap(2),
  gap(2) + "09" + "8".repeat(10) + "90" + gap(2),
  gap(1) + "0T9" + "8".repeat(10) + "9T0" + gap(1),
  "0TT9" + "8".repeat(12) + "9TT0",
  "0T99" + "8".repeat(12) + "99T0",
  "0T96" + "6".repeat(12) + "69T0",
  "0T96" + "6".repeat(12) + "69T0",
  "0T96" + "m".repeat(12) + "69T0",
  "0T96" + "o".repeat(12) + "69T0",
  ".0T6" + "6".repeat(12) + "6T0.",
  "..0T" + "6".repeat(12) + "T0..",
  "...0" + "m".repeat(12) + "0...",
  "....0" + "o".repeat(10) + "0....",
  gap(5) + "z".repeat(10) + gap(5),
];

/** A bowl set out on the boards: pale rim, dark broth, chopsticks. */
const noodleBowl: string[] = [
  gap(3) + "99" + gap(3),
  gap(1) + "0T9999T0",
  "0T99aa99T0",
  "0T9aaaa9T0",
  ".0T9aa9T0.",
  "..0TTTT0..",
  "...zzzz...",
];

/** Steam wisp column drifting up off the pot, phase by frame. */
const noodleSteam = (phase: number): string[] =>
  Array.from({ length: 16 }, (_, y) => {
    const drift = Math.round(Math.sin((y + phase * 2) / 3) * 3);
    const x = 26 + drift + Math.floor((16 - y) / 4);
    if ((y + phase) % 3 === 2) return gap(NOODLE_W);
    const ch = y < 5 ? "8" : y < 10 ? "7" : "8";
    return gap(x) + ch + ch + gap(NOODLE_W - x - 2);
  });

/** The bar itself: shadow, counter, pot, bowls, service strip. */
const noodleBar = ((): string[] => {
  let grid = blank(NOODLE_W, 60);
  // Ground shadow, hugging the counter's near vertex.
  grid = stamped(
    grid,
    [gap(19) + "z".repeat(18) + gap(19), gap(24) + "z".repeat(8) + gap(24)],
    0,
    57,
  );
  grid = stamped(
    grid,
    isoBox(48, 12, {
      top: "b",
      rim: "c",
      left: "b",
      right: "a",
      ink: "1",
      grain: "a",
    }),
    4,
    22,
  );
  grid = stamped(grid, noodlePot, 18, 16);
  grid = stamped(grid, noodleBowl, 12, 36);
  grid = stamped(grid, noodleBowl, 34, 38);
  return grid;
})();

/** The service strip down the counter's front, chasing by frame phase. */
const noodleStrip = (phase: number): string[] => [
  "1".repeat(34),
  Array.from({ length: 34 }, (_, i) => (i % 6 === phase * 2 ? "m" : "o")).join(""),
  "1".repeat(34),
];

const noodleFrame = (phase: number): string[] =>
  stamped(
    stamped(noodleBar, noodleStrip(phase), 11, 44),
    noodleSteam(phase),
    0,
    0,
  );

/* --- Quayside dressing. The Flooded Quays are furnished out of three
 * pieces: the mooring posts every walkway span is tied off to, tarped
 * salvage waiting on the boards for a buyer, and the half-sunk barge
 * the district is built around. Same street light as everything else —
 * top-left, chrome where the metal shows, rust everywhere it has been
 * wet for twenty years. --- */

/* --- Mooring post: a chromed bollard gone rusty at the waterline,
 * a coil of rope round its shaft, set in a concrete pad. 20x23,
 * ground contact at (10, 20). --- */

const POST_CAP = gap(5) + "0TT" + "9".repeat(4) + "TT0" + gap(5);
const POST_CAP_LOW = gap(5) + "0T9" + "6".repeat(4) + "9T0" + gap(5);
const POST_COLLAR = gap(5) + "0" + "6".repeat(8) + "0" + gap(5);
/** One row of the shaft: chrome, with four columns of rust bleed. */
const postShaft = (bleed: string): string => gap(6) + "07" + bleed + "60" + gap(6);
/** A wrap of rope round the shaft, standing proud of it. */
const postRope = (wrap: string): string => gap(5) + "0" + wrap + "0" + gap(5);

const mooringPost: string[] = [
  POST_CAP,
  POST_CAP_LOW,
  POST_COLLAR,
  postShaft("6666"),
  postShaft("66a6"),
  postShaft("6aa6"),
  postShaft("66a6"),
  postShaft("6666"),
  postRope("cbccbccb"),
  postRope("bccbccbc"),
  postShaft("6666"),
  postShaft("6a66"),
  postShaft("aa66"),
  postShaft("6a66"),
  postShaft("6666"),
  postShaft("66aa"),
  postShaft("666a"),
  postShaft("6666"),
  gap(4) + "0" + "6".repeat(10) + "0" + gap(4),
  gap(4) + "0S" + "R".repeat(8) + "Q0" + gap(4),
  gap(4) + "0Q" + "Q".repeat(8) + "Q0" + gap(4),
  gap(3) + "z".repeat(14) + gap(3),
  gap(6) + "z".repeat(8) + gap(6),
];

/* --- Salvage tarp: whatever came up off the bottom this week, roped
 * under a sheet and left on the boards. Two bundles under one cover,
 * lashed with hazard webbing. 40x40, ground contact at (20, 30). --- */

const TARP_INK = { top: "W", rim: "X", left: "W", right: "V", ink: "1" };

const salvageTarp: string[] = ((): string[] => {
  let grid = blank(40, 40);
  // The ground shadow goes down first, so the pile lands on top of it.
  grid = stamped(
    grid,
    [gap(5) + "z".repeat(30) + gap(5), gap(10) + "z".repeat(20) + gap(10)],
    0,
    34,
  );
  // A smaller bundle set back behind the main one, only its top showing.
  grid = stamped(grid, isoBox(20, 6, TARP_INK), 12, 4);
  grid = stamped(grid, isoBox(28, 9, TARP_INK), 6, 14);
  // Hazard webbing lashed over the cover, and a rope tail off the near
  // corner where somebody meant to come back for it.
  grid = stamped(grid, rep(11, "ZY"), 19, 22);
  grid = stamped(grid, ["YZZZZZZZZZZZZY"], 13, 26);
  return stamped(grid, ["..c", ".c.", "cb.", "b.."], 31, 28);
})();

/* --- Sunken barge: a salvage lighter that went down at its mooring
 * and stayed there. Three tiles of hull by two, flooded to the deck at
 * the bow, its stern still riding high enough to keep a wheelhouse and
 * a derrick out of the water — and one amber riding lamp still burning
 * on the mast, which is what the district steers by. The bulk lies
 * across six tiles; the placement declares them (see PropPlacement's
 * footprint) so the water closes over the hull instead of the map
 * pretending a boat is a bollard. --- */

const BARGE_TILES_X = 3;
const BARGE_TILES_Y = 2;
const BARGE_FREEBOARD = 18;
const bargeHull = isoSlab(BARGE_TILES_X, BARGE_TILES_Y, BARGE_FREEBOARD, {
  top: "b",
  rim: "c",
  left: "b",
  right: "a",
  ink: "1",
  grain: "a",
});

/** How far along the hull (in tiles, from the stern) the water closes. */
const BARGE_WATERLINE = -1;
/** Width of the band of surface water washing over the sinking deck. */
const BARGE_WASH = 0.14;

/** A point on the barge's deck, in art pixels, by tile position. */
const bargeDeck = (i: number, j: number): readonly [number, number] => [
  Math.round(bargeHull.anchorX + 32 * (i - (BARGE_TILES_X - 1)) - 32 * (j - (BARGE_TILES_Y - 1))),
  Math.round(
    bargeHull.anchorY +
      16 * (i - (BARGE_TILES_X - 1)) +
      16 * (j - (BARGE_TILES_Y - 1)) -
      BARGE_FREEBOARD,
  ),
];

/** The open cargo hold, in deck coordinates: it is full of the canal. */
const BARGE_HOLD = { fromU: -0.82, toU: -0.26, fromV: -1.15, toV: 0.05 };

/**
 * Drown the bow and flood the hold. Everything forward of the waterline
 * is gone under; the pixels just aft of it are the surface washing over
 * the deck; and the hold amidships is open water inside a coaming.
 * `phase` shifts both dithers, so the water moves between frames.
 */
const bargeSunk = (phase: number): string[] =>
  bargeHull.grid.map((row, y) =>
    [...row]
      .map((ch, x) => {
        if (ch === ".") return ch;
        // Where this pixel sits on the deck plane, in tiles from the
        // stern corner — the one coordinate frame the water knows.
        const px = x - bargeHull.anchorX + 0.5;
        const py = y - bargeHull.anchorY + 0.5 + BARGE_FREEBOARD;
        const u = tileU(px, py);
        const v = tileV(px, py);
        if (u < BARGE_WATERLINE) return ".";
        if (u < BARGE_WATERLINE + BARGE_WASH) {
          return (x + y + phase) % 2 === 0 ? "f" : "e";
        }
        const onDeck =
          u <= 0.5 && u >= 0.5 - BARGE_TILES_X && v <= 0.5 && v >= 0.5 - BARGE_TILES_Y;
        const inHold =
          onDeck &&
          u > BARGE_HOLD.fromU &&
          u < BARGE_HOLD.toU &&
          v > BARGE_HOLD.fromV &&
          v < BARGE_HOLD.toV;
        if (!inHold) return ch;
        const coaming =
          u - BARGE_HOLD.fromU < 0.05 ||
          BARGE_HOLD.toU - u < 0.05 ||
          v - BARGE_HOLD.fromV < 0.05 ||
          BARGE_HOLD.toV - v < 0.05;
        if (coaming) return "1";
        return (x + y + phase) % 4 === 0 ? "e" : "d";
      })
      .join(""),
  );

/** The wheelhouse, standing on the stern quarter of the deck. */
const bargeHouse = isoBox(20, 12, {
  top: "4",
  rim: "5",
  left: "4",
  right: "3",
  ink: "1",
});

/** The derrick boom, dipped off the mast and into the flooded bow. */
const bargeBoom: string[] = Array.from({ length: 24 }, (_, k) =>
  gap(46 - 2 * k) + "T6" + gap(2 * k),
);

/** The riding lamp on the masthead: a caged bulb, lit and dimmed. */
const bargeLamp = (core: string): string[] => [
  "..66..",
  ".0" + core.repeat(2) + "0.",
  "06" + core.repeat(2) + "60",
  ".0" + core.repeat(2) + "0.",
  "..00..",
];

const bargeFrame = (phase: number): string[] => {
  const [houseX, houseY] = bargeDeck(2, 0.35);
  const [mastX, mastY] = bargeDeck(1.7, 0.9);
  let grid = bargeSunk(phase);
  // Freight still lashed to the deck where the water has not reached.
  grid = stamped(grid, isoBox(12, 5, TARP_INK), houseX - 34, houseY - 4);
  grid = stamped(grid, isoBox(16, 6, TARP_INK), houseX - 26, houseY + 6);
  // Wheelhouse, then the mast rising through the deck in front of it.
  grid = stamped(grid, bargeHouse, houseX - 10, houseY - 17);
  grid = stamped(grid, rep(mastY - 18, "T60"), mastX - 1, 18);
  grid = stamped(grid, bargeBoom, mastX - 46, 24);
  grid = stamped(grid, bargeLamp(phase === 0 ? "n" : "m"), mastX - 4, 13);
  return grid;
};

/* --- Corp tower dressing. The Auric Spire's two interior floors are
 * furnished from one vocabulary, and it is the opposite of the street's:
 * nothing rusts, nothing leans, nothing is improvised. Glazed screens
 * divide the plans, a reception counter faces whoever comes through the
 * doors, service columns stand where a district would stand a lamp, and
 * the directors' floor is dressed in black timber. Light is still
 * top-left; the accents are chrome, hologram blue, and the brass the
 * atrium's inlay is laid in.
 *
 * All five stand on the boxy painters (isoBox/stamped/blank) rather than
 * hand-laid rows, so counters, cabinets, and planters keep their facing
 * shades and footprints in agreement with the market's furniture. --- */

/** The tower's chrome-and-glass frame ink, used by every fixed piece. */
const SPIRE_CHROME: BoxInk = {
  top: "7",
  rim: "9",
  left: "6",
  right: "4",
  ink: "1",
};

/* --- Glass partition: a floor-to-ceiling glazed screen in a chrome
 * frame. A pane is a wall segment, so it lies along one of the two iso
 * axes and its head slopes with that axis; the pane is exactly one tile
 * step wide (64px), so panes laid along a row butt into one another and
 * a run of them reads as one unbroken wall. The x variant slopes away
 * to the right and the y variant is its mirror, which is all the
 * difference there is between a north curtain wall and a west one.
 * Privacy frit bands the glass at eye height and one cold glint runs
 * each pane. 64×80, ground contact at (32, 64). --- */

const PARTITION_W = 64;
/** Pane height in rows, before the panel's iso slant is added. */
const PARTITION_PANE_H = 48;
/** Chrome mullion width at each end of the run. */
const PARTITION_POST = 3;

const glassPartition: string[] = ((): string[] => {
  const height = 80;
  const grid: string[][] = Array.from({ length: height }, () =>
    Array<string>(PARTITION_W).fill("."),
  );
  for (let c = 0; c < PARTITION_W; c++) {
    const slant = Math.floor(c / 2);
    const post = c < PARTITION_POST || c >= PARTITION_W - PARTITION_POST;
    for (let k = 0; k < PARTITION_PANE_H; k++) {
      const row = grid[slant + k];
      if (!row) continue;
      let ch: string;
      if (post) ch = k === 0 ? "9" : c < PARTITION_POST ? "T" : "6";
      else if (k < 2) ch = k === 0 ? "9" : "T";
      else if (k >= PARTITION_PANE_H - 2) ch = "6";
      // Privacy frit: an etched band at eye height across the pane.
      else if (k >= 20 && k <= 25) ch = (c + k) % 2 === 0 ? "8" : "7";
      else ch = (c + k) % 2 === 0 ? "U" : "f";
      // One cold glint down each pane, on the lit side of its mullion.
      if (!post && k > 3 && k < PARTITION_PANE_H - 3 && c % 20 === 7) {
        ch = k % 4 === 0 ? "U" : "h";
      }
      row[c] = ch;
    }
    const foot = grid[slant + PARTITION_PANE_H];
    if (foot) foot[c] = "z";
    const spill = grid[slant + PARTITION_PANE_H + 1];
    if (spill && c >= PARTITION_POST && c < PARTITION_W - PARTITION_POST) {
      spill[c] = "z";
    }
  }
  return grid.map((row) => row.join(""));
})();

/* --- Reception desk: a stone counter faced in polished slab with a
 * lit service strip along its front and the tower's mark hanging over
 * it in hologram blue. 56×44, ground contact at (28, 30). --- */

/** The hanging mark: a logo block and two lines of civic type, blocked
    out two pixels thick so the panel's dither cannot eat the strokes. */
const RECEPTION_SIGN: readonly string[] = [
  "------------------------",
  "--####--##############--",
  "--####--##############--",
  "--####------------------",
  "--####--##########------",
  "--####--##########------",
  "------------------------",
];

const receptionCounter = isoBox(48, 14, {
  top: "S",
  rim: "9",
  left: "R",
  right: "Q",
  ink: "1",
  grain: "7",
});

/** Service strip along the counter's front face, lit hologram blue. */
const receptionStrip = (phase: number): string[] =>
  Array.from({ length: 2 }, (_, k) =>
    Array.from({ length: 34 }, (_, i) =>
      (i + phase + k) % 5 === 0 ? "u" : "t",
    ).join(""),
  );

const receptionFrame = (phase: number): string[] => {
  let grid = blank(56, 44);
  // The ground shadow spreads either side of the counter's near corner,
  // laid down first so the plinth stands on top of it.
  grid = stamped(grid, [gap(6) + "z".repeat(44) + gap(6)], 0, 38);
  grid = stamped(grid, [gap(12) + "z".repeat(32) + gap(12)], 0, 40);
  grid = stamped(grid, receptionCounter, 4, 4);
  grid = stamped(grid, receptionStrip(phase), 11, 26);
  grid = stamped(grid, holoPanel(RECEPTION_SIGN, phase), 16, 0);
  return grid;
};

/* --- Service column: a chrome data cabinet running floor to ceiling,
 * its status ladder blinking cyan down the lit face. The atrium stands
 * these where a district stands a lamp post. 28×58, ground contact at
 * (14, 47). --- */

const serverCabinet = isoBox(20, 40, SPIRE_CHROME);

/** Status ladder: a rung of lamps every four rows down the lit face. */
const serverLamps = (frame: number): string[] =>
  Array.from({ length: 32 }, (_, k) => {
    if (k % 4 !== 0) return gap(10);
    return Array.from({ length: 10 }, (_, i) => {
      const lit = hash2(k * 7 + i, frame + 1) % 3;
      if (i > 6) return ".";
      return lit === 0 ? "g" : lit === 1 ? "i" : "m";
    }).join("");
  });

const serverColumn = (frame: number): string[] => {
  let grid = blank(28, 58);
  grid = stamped(grid, [gap(3) + "z".repeat(22) + gap(3)], 0, 52);
  grid = stamped(grid, [gap(8) + "z".repeat(12) + gap(8)], 0, 54);
  grid = stamped(grid, serverCabinet, 4, 2);
  grid = stamped(grid, serverLamps(frame), 7, 16);
  return grid;
};

/* --- Planter column: a stone tub of salt-plants, the only living thing
 * in the building and, like everything else here, kept. 28×44, ground
 * contact at (14, 35). --- */

const planterTub = isoBox(20, 12, {
  top: "R",
  rim: "S",
  left: "R",
  right: "Q",
  ink: "1",
});

const PLANTER_W = 28;
/** Where the blades root, in art columns: the tub's own center. */
const PLANTER_STEM = 13;

/**
 * One salt-plant blade: a stroke that leaves the tub upright and falls
 * away as it climbs, thick at the root, tipped in cyan. `spread` is how
 * far the tip leans (negative to the left), `length` its rows.
 */
const saltBlade = (spread: number, length: number): string[] =>
  Array.from({ length }, (_, k) => {
    // t runs 1 at the tip to 0 at the root; squaring it makes the lean
    // gather toward the tip so the blade reads as curved, not straight.
    const t = 1 - k / (length - 1);
    const x = Math.max(0, PLANTER_STEM + Math.round(spread * t * t));
    const ch = k === 0 ? "h" : k < 3 ? "i" : k < length - 5 ? "O" : "7";
    const width = k < 2 ? 1 : 2;
    return (
      gap(x) + ch.repeat(width) + gap(Math.max(0, PLANTER_W - x - width))
    );
  });

const planterColumn: string[] = ((): string[] => {
  let grid = blank(PLANTER_W, 44);
  grid = stamped(grid, [gap(3) + "z".repeat(22) + gap(3)], 0, 40);
  grid = stamped(grid, [gap(8) + "z".repeat(12) + gap(8)], 0, 42);
  // Blades first, all rooted at the same row, so the tub's rim closes
  // over the roots when it is stamped on top of them.
  for (const [spread, length] of [
    [-9, 12],
    [-4, 16],
    [0, 18],
    [5, 15],
    [10, 11],
  ] as const) {
    grid = stamped(grid, saltBlade(spread, length), 0, 24 - length);
  }
  return stamped(grid, planterTub, 4, 18);
})();

/* --- Executive desk: a slab of black timber on a chrome frame with a
 * ledger terminal glowing on it and the director's chair standing
 * behind. 52×40, ground contact at (26, 27). --- */

const execSlab = isoBox(36, 12, {
  top: "a",
  rim: "b",
  left: "a",
  right: "1",
  ink: "1",
  grain: "b",
});

/** The chair back, a padded fabric slab behind the desk. */
const execChair: readonly string[] = [
  gap(1) + "1".repeat(10) + gap(1),
  ...rep(6, "1" + "X" + "W".repeat(8) + "V" + "1"),
  "1" + "X" + "W".repeat(8) + "V" + "1",
  gap(1) + "1".repeat(10) + gap(1),
  gap(4) + "16" + "61" + gap(4),
];

/** The desk terminal: a small pane of ledger, on and idling. */
const execScreen = (bright: boolean): string[] => [
  "0" + "6".repeat(12) + "0",
  ...["-###--##--###-", "-#--#-#---#---", "-###--##--###-", "-#----#-----#-"].map(
    (row) =>
      [...row]
        .map((ch) => (ch === "#" ? (bright ? "u" : "t") : bright ? "t" : "s"))
        .join(""),
  ),
  "0" + "6".repeat(12) + "0",
];

const execDesk = (bright: boolean): string[] => {
  let grid = blank(52, 40);
  grid = stamped(grid, [gap(5) + "z".repeat(42) + gap(5)], 0, 33);
  grid = stamped(grid, [gap(11) + "z".repeat(30) + gap(11)], 0, 35);
  grid = stamped(grid, execChair, 32, 3);
  grid = stamped(grid, execSlab, 8, 6);
  grid = stamped(grid, execScreen(bright), 13, 8);
  return grid;
};

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
  "stall-awning": {
    frames: [stallAwning, stallAwningAlt],
    anchorX: 28,
    anchorY: 50,
    frameMs: 780,
    flicker: false,
    // The strip lamp under the canopy, washing the goods below it.
    glow: [{ color: "m", radius: 18, intensity: 0.3, offsetX: 0, offsetY: -6 }],
  },
  "cage-lamp": {
    frames: [cageLampLit, cageLampDim, cageLampDead],
    anchorX: 10,
    anchorY: 60,
    frameMs: 820,
    flicker: true,
    // A caged bulb burning over the walkway, pooling on the boards.
    glow: [
      { color: "m", radius: 20, intensity: 0.46, offsetX: 0, offsetY: -44 },
      { color: "m", radius: 14, intensity: 0.16, offsetX: 0, offsetY: 0 },
    ],
  },
  "crate-stack": {
    frames: [crateStack],
    anchorX: 24,
    anchorY: 34,
    frameMs: 0,
    flicker: false,
  },
  "noodle-counter": {
    frames: [noodleFrame(0), noodleFrame(1), noodleFrame(2)],
    anchorX: 28,
    anchorY: 46,
    frameMs: 440,
    flicker: false,
    // Burner and service strip, amber through the steam.
    glow: [{ color: "m", radius: 18, intensity: 0.32, offsetX: 0, offsetY: -14 }],
  },
  "mooring-post": {
    frames: [mooringPost],
    anchorX: 10,
    anchorY: 20,
    frameMs: 0,
    flicker: false,
  },
  "salvage-tarp": {
    frames: [salvageTarp],
    anchorX: 20,
    anchorY: 30,
    frameMs: 0,
    flicker: false,
  },
  "sunken-barge": {
    frames: [bargeFrame(0), bargeFrame(1)],
    anchorX: bargeHull.anchorX,
    anchorY: bargeHull.anchorY,
    frameMs: 900,
    flicker: false,
    // The riding lamp on the masthead — the one light out on the water,
    // and what the quays' reflections are drawn from.
    glow: [{ color: "m", radius: 20, intensity: 0.4, offsetX: -8, offsetY: -66 }],
  },
  "glass-partition-x": {
    frames: [glassPartition],
    anchorX: 32,
    anchorY: 64,
    frameMs: 0,
    flicker: false,
  },
  "glass-partition-y": {
    // The same pane turned onto the other axis. Mirroring moves the
    // contact column one to the left of center, which is where the
    // mirrored anchor has to land for the run to stand on its tiles.
    frames: [mirrored(glassPartition)],
    anchorX: PARTITION_W - 1 - 32,
    anchorY: 64,
    frameMs: 0,
    flicker: false,
  },
  "reception-desk": {
    frames: [receptionFrame(0), receptionFrame(2), receptionFrame(4)],
    anchorX: 28,
    anchorY: 30,
    frameMs: 520,
    flicker: false,
    // The hanging mark and the counter's service strip, hologram blue.
    glow: [{ color: "t", radius: 18, intensity: 0.32, offsetX: 0, offsetY: -26 }],
  },
  "server-column": {
    frames: [serverColumn(0), serverColumn(1), serverColumn(2)],
    anchorX: 14,
    anchorY: 47,
    frameMs: 600,
    flicker: false,
    // Status light off the cabinet's face, at head height.
    glow: [{ color: "g", radius: 14, intensity: 0.22, offsetX: 0, offsetY: -26 }],
  },
  "planter-column": {
    frames: [planterColumn],
    anchorX: 14,
    anchorY: 35,
    frameMs: 0,
    flicker: false,
  },
  "exec-desk": {
    frames: [execDesk(true), execDesk(false)],
    anchorX: 26,
    anchorY: 27,
    frameMs: 940,
    flicker: false,
    // The ledger pane, lighting whoever is reading it.
    glow: [{ color: "t", radius: 12, intensity: 0.26, offsetX: -8, offsetY: -20 }],
  },
};
