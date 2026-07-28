/**
 * Interactable pixel art, authored natively at the v2 hi-res working
 * sizes (no upscale shim): door, terminal, stash, and exit marker. The
 * npc sprite id resolves through the shared character pipeline instead —
 * see characters.ts. Every type carries a subtle idle loop (status-lamp
 * pulse, screen scanline, latch glint, marching strip lights) whose
 * frames recolor pixels but never move a pixel in or out of the
 * silhouette, so highlight outlines and hit flashes bake from one
 * stable shape.
 */
import type { InteractableSpriteId } from "../tilemap";
import type { GlowSource } from "./glow";
import { DIAMOND_WIDTHS, remapped, type PixelGrid } from "./pixel";

export interface InteractableArt {
  frames: readonly PixelGrid[];
  anchorX: number;
  anchorY: number;
  frameMs: number;
  /**
   * Emissive light this interactable casts in the glow pass; offsets
   * are in 1x art pixels relative to the anchor.
   */
  glow?: readonly GlowSource[];
}

const rep = (n: number, row: string): string[] => Array<string>(n).fill(row);
const gap = (n: number): string => ".".repeat(n);

/* --- Door: framed security slab, 48×59. A status lamp in the lintel
 * and the glowing center seam pulse from bright to dim. --- */

const doorPost = (inner: string): string => "..0" + "554" + inner + "433" + "0..";
const doorSlab = "1" + "2".repeat(16) + "gg" + "2".repeat(16) + "1";
const doorLine = "1".repeat(17) + "gg" + "1".repeat(17);
const doorHandle = "1" + "2".repeat(12) + "788" + "2" + "gg" + "2".repeat(16) + "1";
const doorKick = "1" + "6".repeat(16) + "gg" + "6".repeat(16) + "1";
const doorLamp = "0hggggh0";

const doorBright: string[] = [
  ".." + "0".repeat(44) + "..",
  ...rep(2, "..0" + "5".repeat(42) + "0.."),
  ...rep(2, "..0" + "4".repeat(17) + doorLamp + "4".repeat(17) + "0.."),
  "..0" + "3".repeat(42) + "0..",
  doorPost(doorLine),
  ...rep(11, doorPost(doorSlab)),
  doorPost(doorLine),
  ...rep(9, doorPost(doorSlab)),
  ...rep(3, doorPost(doorHandle)),
  ...rep(8, doorPost(doorSlab)),
  doorPost(doorLine),
  ...rep(9, doorPost(doorSlab)),
  ...rep(3, doorPost(doorKick)),
  doorPost(doorLine),
  "..0" + "3".repeat(42) + "0..",
  "0" + "5".repeat(46) + "0",
  "0" + "4".repeat(46) + "0",
  "0".repeat(48),
  ".." + "z".repeat(44) + "..",
  "...." + "z".repeat(40) + "....",
];

const doorDim = remapped(doorBright, { h: "g", g: "i" });

/* --- Terminal: kiosk on a pedestal, 32×43. The glass screen runs a
 * three-frame loop: a scanline sweeps down while the prompt cursor
 * blinks. --- */

const terminalFrame = (scanRow: number, cursorOn: boolean): string[] => {
  const cursor = cursorOn
    ? "fiiiffiiffffffffffffggff"
    : "fiiiffiiffffffffffffffff";
  const screen = [
    "f".repeat(24),
    "fiiiffiiiiifiiifffiiiiff",
    "fiiiiffiifffiiiiifiiffff",
    "f".repeat(24),
    "fiiiffiiiiifiiifffiiiiff",
    "fiiiiffiifffiiiiifiiffff",
    "f".repeat(24),
    cursor,
    "f".repeat(24),
  ].map((row, i) =>
    i === scanRow ? (remapped([row], { f: "g", i: "h" })[0] ?? row) : row,
  );
  const keys = "64".repeat(14);
  const column = gap(11) + "0" + "76544332" + "0" + gap(11);
  const jack = gap(11) + "0" + "76m44332" + "0" + gap(11);
  return [
    ".." + "0".repeat(28) + "..",
    "..0" + "7".repeat(26) + "0..",
    ...screen.map((row) => "..0" + "6" + row + "6" + "0.."),
    "..0" + "3".repeat(26) + "0..",
    ".." + "0".repeat(28) + "..",
    "." + "0".repeat(30) + ".",
    "0" + "7".repeat(30) + "0",
    "0" + "5" + keys + "5" + "0",
    "0" + "3".repeat(30) + "0",
    "." + "0".repeat(30) + ".",
    ...rep(2, column),
    ...rep(2, jack),
    ...rep(14, column),
    gap(8) + "0".repeat(16) + gap(8),
    gap(7) + "0" + "5".repeat(16) + "0" + gap(7),
    gap(5) + "0" + "5".repeat(20) + "0" + gap(5),
    gap(4) + "0" + "4".repeat(22) + "0" + gap(4),
    gap(4) + "0".repeat(24) + gap(4),
    gap(5) + "z".repeat(22) + gap(5),
    gap(8) + "z".repeat(16) + gap(8),
  ];
};

/* --- Stash: latched iso lockbox, 40×29, hazard-striped lid. Holds a
 * closed look for three beats, then fires a one-frame latch glint so
 * players can spot it. --- */

const HAZARD = "ZZZYYY";

const stashLid: string[] = Array.from({ length: 10 }, (_, r) => {
  const w = 4 + 4 * r;
  const pad = (40 - w) / 2;
  let inner = "";
  for (let i = 0; i < w - 2; i++) {
    const x = pad + 1 + i;
    // Lit top face with a hazard band; walls below drop to 4/3.
    inner += r >= 3 && r < 6 ? (HAZARD[(x + 2 * r) % 6] ?? "Z") : "5";
  }
  return gap(pad) + "0" + inner + "0" + gap(pad);
});

const stashWall = "0" + "3".repeat(18) + "1" + "2".repeat(19) + "0";
const stashLatch = (plate: string): string =>
  "0" + "3".repeat(15) + plate + "2".repeat(16) + "0";

const stashBase: string[] = Array.from({ length: 9 }, (_, k) => {
  const w = 36 - 4 * k;
  const pad = (40 - w) / 2;
  const half = (w - 2) / 2;
  return gap(pad) + "0" + "3".repeat(half) + "2".repeat(half) + "0" + gap(pad);
});

const stashFrame = (plate: string): string[] => [
  ...stashLid,
  ...rep(2, stashWall),
  stashLatch("0000000"),
  stashLatch(plate),
  stashLatch("0000000"),
  ...rep(3, stashWall),
  ...stashBase,
  gap(8) + "z".repeat(24) + gap(8),
  gap(14) + "z".repeat(12) + gap(14),
];

const stashClosed = stashFrame("06TTT60");
const stashGlint = stashFrame("0T9h9T0");

/* --- Exit: flat ground marker filling the tile diamond, 64×32 — a
 * dark light-strip ring with marching cyan chips and a double
 * up-chevron at the center. Stays tile-height so it reads as an
 * affordance without dominating the scene. --- */

/** Ring thickness in diamond rows (≈6px horizontally at the waist). */
const EXIT_RING = 3;

const chevronRows: readonly string[] = [
  "....gg....",
  "...gggg...",
  "..gg..gg..",
  ".gg....gg.",
];

const chevronAt = (x: number, r: number): boolean => {
  for (const top of [11, 17]) {
    const row = chevronRows[r - top];
    if (row && row[x - 27] === "g") return true;
  }
  return false;
};

const exitFrame = (phase: number, chevron: string): string[] =>
  DIAMOND_WIDTHS.map((w, r) => {
    const pad = (64 - w) / 2;
    const inner = r - EXIT_RING;
    const innerW =
      inner >= 0 && inner <= 31 - 2 * EXIT_RING
        ? 4 * Math.min(inner, 31 - 2 * EXIT_RING - inner) + 2
        : 0;
    const innerPad = (64 - innerW) / 2;
    let row = "";
    for (let x = 0; x < 64; x++) {
      if (x < pad || x >= pad + w) {
        row += ".";
      } else if (innerW > 0 && x >= innerPad && x < innerPad + innerW) {
        row += chevronAt(x, r) ? chevron : ".";
      } else {
        const step = (Math.floor((x + 2 * r) / 4) + phase) % 4;
        row += step === 0 ? "g" : step === 1 ? "i" : "3";
      }
    }
    return row;
  });

/**
 * Native hi-res art for every drawn interactable sprite; the npc id
 * comes from characters.ts via the sprite provider. Anchors are in
 * native 1x art pixels at the point that lands on the tile-diamond
 * center.
 */
export const INTERACTABLE_ART: Readonly<
  Record<Exclude<InteractableSpriteId, "npc">, InteractableArt>
> = {
  door: {
    frames: [doorBright, doorDim],
    anchorX: 24,
    anchorY: 56,
    frameMs: 800,
    // Cyan spill from the center seam and status lamp.
    glow: [{ color: "g", radius: 14, intensity: 0.26, offsetX: 0, offsetY: -26 }],
  },
  terminal: {
    frames: [terminalFrame(1, true), terminalFrame(4, false), terminalFrame(7, true)],
    anchorX: 16,
    anchorY: 40,
    frameMs: 360,
    // Screen light on whoever stands at the kiosk.
    glow: [{ color: "g", radius: 12, intensity: 0.28, offsetX: 0, offsetY: -34 }],
  },
  stash: {
    // Three held beats, then the glint — brief enough to read as a wink.
    frames: [stashClosed, stashClosed, stashClosed, stashGlint],
    anchorX: 20,
    anchorY: 16,
    frameMs: 340,
  },
  exit: {
    frames: [exitFrame(0, "i"), exitFrame(1, "g"), exitFrame(2, "h")],
    anchorX: 32,
    anchorY: 16,
    frameMs: 420,
    // The light-strip ring pools faintly in its own tile.
    glow: [{ color: "g", radius: 18, intensity: 0.2, offsetX: 0, offsetY: 0 }],
  },
};
