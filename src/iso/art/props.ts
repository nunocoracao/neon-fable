/**
 * Prop pixel art: buildings, street furniture, and hazards. Each prop is
 * a palette-indexed grid (some with short frame loops for window
 * flicker, neon pulses, and sign shimmer). Anchors are given in 1x art
 * pixels at the point that lands on the tile-diamond center; light is
 * top-left, so left faces read lighter than right faces.
 *
 * Street furniture (streetlight, vent stack, crate, barrier, hydrant,
 * trash heap, cable bundle) is authored natively at the v2 resolution
 * (`native: true`); the building and holo-sign still ride the legacy 2×
 * shim until their own re-authoring passes.
 */
import type { PropId } from "../tilemap";
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
   * Grid is authored at the v2 native resolution and bakes as-is;
   * legacy grids go through the nearest-neighbor 2× shim instead.
   */
  native: boolean;
}

const rep = (n: number, row: string): string[] => Array<string>(n).fill(row);
const gap = (n: number): string => ".".repeat(n);

/* --- Building: roof diamond, two window walls, magenta sign strip. --- */

const wallPlain = "1" + "333333333333333" + "222222222222222" + "1";
const wallWinA = "1" + "33gg33ii33gg333" + "222gg221122gg22" + "1";
const wallWinB = "1" + "33ii33gg3311333" + "222ii22gg221122" + "1";
const wallSign = "1" + "333333333333333" + "222222222jj2222" + "1";
const wallSignDim = "1" + "333333333333333" + "222222222ll2222" + "1";
const wallWinASign = "1" + "33gg33ii33gg333" + "222gg2211jjgg22" + "1";
const wallWinBSign = "1" + "33ii33gg3311333" + "222ii2211jjgg22" + "1";

const buildingBase: string[] = [
  "..............5544..............",
  "............55444444............",
  "..........554444442244..........",
  "........5544444444444444........",
  "......55444422444444444444......",
  "....554444444444444444444444....",
  "..5544444444444444224444444444..",
  "55444444444444444444444444444444",
  "13" + "4444444444444444444444444444" + "21",
  "1333" + "444444444444444444444444" + "2221",
  "133333" + "44444444444444444444" + "222221",
  "13333333" + "4444444444444444" + "22222221",
  "1333333333" + "444444444444" + "2222222221",
  "133333333333" + "44444444" + "222222222221",
  "13333333333333" + "4444" + "22222222222221",
  "1333333333333333" + "2222222222222221",
  wallPlain,
  wallPlain,
  wallWinA,
  wallWinA,
  wallSign,
  wallSign,
  wallWinBSign,
  wallWinBSign,
  wallSignDim,
  wallSignDim,
  wallWinASign,
  wallWinASign,
  wallSign,
  wallSign,
  wallWinBSign,
  wallWinBSign,
  wallPlain,
  wallPlain,
  wallWinB,
  wallWinB,
  wallPlain,
  wallPlain,
  wallPlain,
  ".." + "1" + "3333333333333" + "2222222222222" + "1" + "..",
  "...." + "1" + "33333333333" + "22222222222" + "1" + "....",
  "......" + "1" + "333333333" + "222222222" + "1" + "......",
  "........" + "1" + "3333333" + "2222222" + "1" + "........",
  ".........." + "1" + "33333" + "22222" + "1" + "..........",
  "............" + "1" + "333" + "222" + "1" + "............",
  ".............." + "1321" + "..............",
];

/** Second frame: lit windows dim / dim windows lift, sign shimmers. */
const buildingAlt = remapped(buildingBase, { g: "i", i: "g", j: "k" });

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

/* --- Holo-sign: glyph board on a pole, shimmering and dropping out. --- */

const holoSignA: string[] = [
  ".0000000000000000000000.",
  ".0jjjjjjjjjjjjjjjjjjjj0.",
  ".0j111111111111111111j0.",
  ".0j" + "kk11k11kk1k11kk11k" + "j0.",
  ".0j111111111111111111j0.",
  ".0j" + "1k1kk1k1k1kk1k1k11" + "j0.",
  ".0j111111111111111111j0.",
  ".0j" + "kk1k11kk11k1kk11k1" + "j0.",
  ".0j111111111111111111j0.",
  ".0j" + "11kk1k1kk1k11k1k11" + "j0.",
  ".0j111111111111111111j0.",
  ".0jjjjjjjjjjjjjjjjjjjj0.",
  ".0000000000000000000000.",
  ...rep(16, "..........0760.........."),
  ".........066660.........",
  "........zzzzzzzz........",
];

const holoSignB = remapped(holoSignA, { k: "j", j: "k" });
const holoSignOff = remapped(holoSignA, { k: "l", j: "l" });

export const PROP_ART: Readonly<Record<PropId, PropArt>> = {
  building: {
    frames: [buildingBase, buildingAlt],
    anchorX: 16,
    anchorY: 38,
    frameMs: 1400,
    flicker: false,
    native: false,
  },
  "vent-stack": {
    frames: ventStack,
    anchorX: 24,
    anchorY: 45,
    frameMs: 420,
    flicker: false,
    native: true,
  },
  crate: {
    frames: [crate],
    anchorX: 16,
    anchorY: 20,
    frameMs: 0,
    flicker: false,
    native: true,
  },
  barrier: {
    frames: [barrierFrame(2), barrierFrame(5)],
    anchorX: 28,
    anchorY: 25,
    frameMs: 700,
    flicker: false,
    native: true,
  },
  streetlight: {
    frames: [streetlightOn, streetlightPulse, streetlightOff],
    anchorX: 12,
    anchorY: 84,
    frameMs: 1100,
    flicker: true,
    native: true,
  },
  hydrant: {
    frames: [hydrantOn, hydrantOff],
    anchorX: 9,
    anchorY: 25,
    frameMs: 1300,
    flicker: false,
    native: true,
  },
  "trash-heap": {
    frames: [trashHeap],
    anchorX: 22,
    anchorY: 20,
    frameMs: 0,
    flicker: false,
    native: true,
  },
  "cable-bundle": {
    frames: [cableBundle, remapped(cableBundle, { m: "o", g: "h" })],
    anchorX: 28,
    anchorY: 10,
    frameMs: 800,
    flicker: false,
    native: true,
  },
  "holo-sign": {
    frames: [holoSignA, holoSignB, holoSignOff],
    anchorX: 12,
    anchorY: 29,
    frameMs: 700,
    flicker: true,
    native: false,
  },
};
