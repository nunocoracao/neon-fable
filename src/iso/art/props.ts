/**
 * Prop pixel art: buildings, street furniture, and hazards. Each prop is
 * a palette-indexed grid (some with short frame loops for window
 * flicker, neon pulses, and sign shimmer). Anchors are given in 1x art
 * pixels at the point that lands on the tile-diamond center; light is
 * top-left, so left faces read lighter than right faces.
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
}

const rep = (n: number, row: string): string[] => Array<string>(n).fill(row);

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

/* --- Vent stack: squat block with hazard lid and vent slits. --- */

const ventWallPlain = "1" + "333333333333333" + "222222222222222" + "1";
const ventWallSlit = "1" + "331331331331333" + "222122212221222" + "1";

const ventStack: string[] = [
  "..............5544..............",
  "............55444444............",
  "..........554444444444..........",
  "........554444mm44444444........",
  "......55444444444444444444......",
  "....554444444444mmmm44444444....",
  "..5544444444444444444444444444..",
  "55444444444444444444444444444444",
  "13" + "4444444444444444444444444444" + "21",
  "1333" + "444444444444444444444444" + "2221",
  "133333" + "44444444444444444444" + "222221",
  "13333333" + "4444444444444444" + "22222221",
  "1333333333" + "444444444444" + "2222222221",
  "133333333333" + "44444444" + "222222222221",
  "13333333333333" + "4444" + "22222222222221",
  "1333333333333333" + "2222222222222221",
  ventWallPlain,
  ventWallSlit,
  ventWallSlit,
  ventWallPlain,
  ventWallSlit,
  ventWallSlit,
  ventWallPlain,
  ".." + "1" + "3333333333333" + "2222222222222" + "1" + "..",
  "...." + "1" + "33333333333" + "22222222222" + "1" + "....",
  "......" + "1" + "333333333" + "222222222" + "1" + "......",
  "........" + "1" + "3333333" + "2222222" + "1" + "........",
  ".........." + "1" + "33333" + "22222" + "1" + "..........",
  "............" + "1" + "333" + "222" + "1" + "............",
  ".............." + "1321" + "..............",
];

/* --- Crate: rusty cube with a hazard band. --- */

const crate: string[] = [
  "......0000......",
  "....00cccc00....",
  "..00ccbbbbcc00..",
  "00ccbbbbbbbbcc00",
  "0bbbbbb11aaaaaa0",
  "0bbbbbb11aaaaaa0",
  "0mommom11aaaaaa0",
  "0ommomm11aaaaaa0",
  "0bbbbbb11aaaaaa0",
  "0bbbbbb11aaaaaa0",
  "0bbbbbb11aaaaaa0",
  "00bbbb1111aaaa00",
  "..00bb1111aa00..",
  "....00111100....",
  "......0000......",
  "...zzzzzzzzzz...",
];

/* --- Barrier: two posts carrying a magenta-striped panel. --- */

const barrierBase: string[] = [
  "....000000000000000000000000....",
  "...." + "0" + "4444444444444444444444" + "0" + "....",
  "...." + "0" + "jjjjjjjjjjjjjjjjjjjjjj" + "0" + "....",
  "...." + "0" + "2222222222222222222222" + "0" + "....",
  "....000000000000000000000000....",
  "......033.............033.......",
  "......033.............033.......",
  "......033.............033.......",
  ".....0330.............0330......",
  "....zzzz...............zzzz.....",
];

const barrierDim = remapped(barrierBase, { j: "l" });

/* --- Streetlight: cyan lamp on a slim pole; flickers off briefly. --- */

const streetlightOn: string[] = [
  "......0000......",
  ".....0hhhh0.....",
  ".....0hggh0.....",
  "......0gg0......",
  "......0770......",
  ...rep(33, "......0760......"),
  ".....007600.....",
  "....00666600....",
  "...0666666660...",
  "...zzzzzzzzzz...",
];

const streetlightOff = remapped(streetlightOn, { h: "i", g: "i" });

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
  },
  "vent-stack": {
    frames: [ventStack],
    anchorX: 16,
    anchorY: 22,
    frameMs: 0,
    flicker: false,
  },
  crate: {
    frames: [crate],
    anchorX: 8,
    anchorY: 12,
    frameMs: 0,
    flicker: false,
  },
  barrier: {
    frames: [barrierBase, barrierDim],
    anchorX: 16,
    anchorY: 8,
    frameMs: 900,
    flicker: false,
  },
  streetlight: {
    frames: [streetlightOn, streetlightOff],
    anchorX: 8,
    anchorY: 40,
    frameMs: 0,
    flicker: true,
  },
  "holo-sign": {
    frames: [holoSignA, holoSignB, holoSignOff],
    anchorX: 12,
    anchorY: 29,
    frameMs: 700,
    flicker: true,
  },
};
