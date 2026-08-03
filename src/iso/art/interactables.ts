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
import type { ArtDensity } from "./density";
import type { GlowSource } from "./glow";
import { DIAMOND_WIDTHS, remapped, type PixelGrid } from "./pixel";

export interface InteractableArt {
  frames: readonly PixelGrid[];
  anchorX: number;
  anchorY: number;
  frameMs: number;
  /**
   * The way-opening sequence, shut (frame 0, pixel-identical to the
   * idle base) through wide open (last frame). Played forward to open
   * and backward to close, so one sequence covers both directions.
   * Absent for interactables nothing passes through.
   */
  openFrames?: readonly PixelGrid[];
  /**
   * Emissive light this interactable casts in the glow pass; offsets are
   * in the entry's own authored pixels relative to the anchor.
   */
  glow?: readonly GlowSource[];
  /**
   * What this entry's grids and coordinates are counted in (see
   * ./density.ts): 1 for art drawn at the original resolution, 2 for art
   * authored at the detail resolution. Absent means 1. A density-2 entry
   * bakes to exactly the same on-screen size — same footprint, same
   * anchor — with four times the authored pixels inside it.
   */
  density?: ArtDensity;
}

const rep = (n: number, row: string): string[] => Array<string>(n).fill(row);
const gap = (n: number): string => ".".repeat(n);

/* --- Door: framed security slab, 48×59. A status lamp in the lintel
 * and the glowing center seam pulse from bright to dim. The slab is
 * two leaves that slide apart into the posts when the door is used;
 * the lit seam rides the leading edge of each leaf out with it. --- */

const doorPost = (inner: string): string => "..0" + "554" + inner + "433" + "0..";
const doorSlab = "1" + "2".repeat(16) + "gg" + "2".repeat(16) + "1";
const doorLine = "1".repeat(17) + "gg" + "1".repeat(17);
const doorHandle = "1" + "2".repeat(12) + "788" + "2" + "gg" + "2".repeat(16) + "1";
const doorKick = "1" + "6".repeat(16) + "gg" + "6".repeat(16) + "1";
const doorLamp = "0hggggh0";

/** The dark of the room behind, revealed between the parted leaves. */
const DOORWAY = "1";

/**
 * A slab row with each leaf retracted `slide` pixels into its post,
 * baring the threshold between them. 0 leaves the row untouched, which
 * is what keeps the shut frame identical to the idle art.
 */
const parted = (inner: string, slide: number): string => {
  if (slide <= 0) return inner;
  const half = inner.length / 2;
  return (
    inner.slice(slide, half) +
    DOORWAY.repeat(slide * 2) +
    inner.slice(half, inner.length - slide)
  );
};

const doorBody = (slide: number): string[] => [
  ".." + "0".repeat(44) + "..",
  ...rep(2, "..0" + "5".repeat(42) + "0.."),
  ...rep(2, "..0" + "4".repeat(17) + doorLamp + "4".repeat(17) + "0.."),
  "..0" + "3".repeat(42) + "0..",
  doorPost(parted(doorLine, slide)),
  ...rep(11, doorPost(parted(doorSlab, slide))),
  doorPost(parted(doorLine, slide)),
  ...rep(9, doorPost(parted(doorSlab, slide))),
  ...rep(3, doorPost(parted(doorHandle, slide))),
  ...rep(8, doorPost(parted(doorSlab, slide))),
  doorPost(parted(doorLine, slide)),
  ...rep(9, doorPost(parted(doorSlab, slide))),
  ...rep(3, doorPost(parted(doorKick, slide))),
  doorPost(parted(doorLine, slide)),
  "..0" + "3".repeat(42) + "0..",
  "0" + "5".repeat(46) + "0",
  "0" + "4".repeat(46) + "0",
  "0".repeat(48),
  ".." + "z".repeat(44) + "..",
  "...." + "z".repeat(40) + "....",
];

const doorBright: string[] = doorBody(0);

const doorDim = remapped(doorBright, { h: "g", g: "i" });

/** Shut through wide open: each leaf slides four pixels a step. */
const doorOpening = [0, 4, 8, 12, 16].map(doorBody);

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

/* --- Memory shard: a crystalline data chip standing in a salvaged
 * chrome clip, 24×28. The glass body is authored once and the loop is
 * pure recolor — the seam dims, then catches the light — so the chip
 * reads as glinting without a pixel ever leaving the silhouette. --- */

/**
 * Opaque width of the chip at each row, top to bottom: a blade that
 * comes to a point and broadens into its clip. Even numbers only, so
 * every row centers in the 24-wide frame.
 */
const SHARD_WIDTHS: readonly number[] = [
  4, 4, 6, 6, 8, 8, 10, 10, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 10, 8, 6,
];

/**
 * One row of the chip: an outline either side, a lit left face, a
 * shaded right one, and the index seam burning down the middle — the
 * part that actually carries the record.
 */
const shardRow = (w: number): string => {
  const inner = w - 2;
  const half = inner / 2;
  let body = "";
  for (let i = 0; i < inner; i++) {
    if (inner >= 4 && (i === half - 1 || i === half)) body += "g";
    else if (i === 0) body += "h";
    else body += i < half ? "U" : "f";
  }
  const pad = (24 - w) / 2;
  return gap(pad) + "0" + body + "0" + gap(pad);
};

const shardLit: string[] = [
  ...SHARD_WIDTHS.map(shardRow),
  // The clip: a scavenged chrome bracket somebody wedged it into.
  gap(5) + "0" + "T".repeat(12) + "0" + gap(5),
  gap(5) + "0" + "6".repeat(12) + "0" + gap(5),
  gap(6) + "0" + "6".repeat(10) + "0" + gap(6),
  gap(7) + "0".repeat(10) + gap(7),
  gap(4) + "z".repeat(16) + gap(4),
  gap(7) + "z".repeat(10) + gap(7),
];

/** Between winks the seam is banked and the glass goes flat. */
const shardDim = remapped(shardLit, { h: "U", U: "f", g: "i" });

/** The wink itself: the whole body catches on the seam for one beat. */
const shardGlint = remapped(shardLit, { U: "h", f: "U", g: "9" });

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

/** Width of the ring's open middle on a diamond row; 0 outside it. */
const exitInnerWidth = (r: number): number => {
  const inner = r - EXIT_RING;
  const span = 31 - 2 * EXIT_RING;
  return inner >= 0 && inner <= span ? 4 * Math.min(inner, span - inner) + 2 : 0;
};

/**
 * Distance from the tile's center in diamond units: 0 dead center, 1 at
 * the tile's edge. The iris grows along it, so the light opens as a
 * diamond in step with the tile rather than as a circle across it.
 */
const exitRadius = (x: number, r: number): number =>
  Math.abs(x - 32) / 32 + Math.abs(r - 15.5) / 16;

/**
 * One exit-marker frame. `phase` marches the strip lights around the
 * ring; `iris` (0..1) is how far the way has opened — at 0 the middle
 * holds the resting chevrons, and light floods out from the center as
 * it climbs.
 */
const exitFrame = (phase: number, chevron: string, iris = 0): string[] =>
  DIAMOND_WIDTHS.map((w, r) => {
    const pad = (64 - w) / 2;
    const innerW = exitInnerWidth(r);
    const innerPad = (64 - innerW) / 2;
    let row = "";
    for (let x = 0; x < 64; x++) {
      if (x < pad || x >= pad + w) {
        row += ".";
      } else if (innerW > 0 && x >= innerPad && x < innerPad + innerW) {
        const radius = exitRadius(x, r);
        if (radius <= iris) {
          row += radius <= iris * 0.4 ? "h" : radius <= iris * 0.75 ? "g" : "i";
        } else {
          row += chevronAt(x, r) ? chevron : ".";
        }
      } else {
        const step = (Math.floor((x + 2 * r) / 4) + phase) % 4;
        row += step === 0 ? "g" : step === 1 ? "i" : "3";
      }
    }
    return row;
  });

/**
 * Shut through wide open: the iris of a way opening under the player's
 * feet, which is what a stair or a tram arch does instead of swinging.
 */
const exitOpening = [0, 0.25, 0.5, 0.75, 1].map((iris) =>
  exitFrame(0, "i", iris),
);

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
    openFrames: doorOpening,
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
  shard: {
    // Banked, banked, lit, wink: a chip you catch out of the corner of
    // your eye rather than one that announces itself.
    frames: [shardDim, shardDim, shardLit, shardGlint],
    anchorX: 12,
    anchorY: 25,
    frameMs: 300,
    // A chip's worth of cyan on the ground around it.
    glow: [{ color: "g", radius: 10, intensity: 0.22, offsetX: 0, offsetY: -14 }],
  },
  exit: {
    frames: [exitFrame(0, "i"), exitFrame(1, "g"), exitFrame(2, "h")],
    openFrames: exitOpening,
    anchorX: 32,
    anchorY: 16,
    frameMs: 420,
    // The light-strip ring pools faintly in its own tile.
    glow: [{ color: "g", radius: 18, intensity: 0.2, offsetX: 0, offsetY: 0 }],
  },
};

/**
 * The way-opening sequence for a sprite kind, or undefined for the ones
 * nothing passes through (terminals, stashes, and NPCs, whose art comes
 * from the character pipeline instead).
 */
export function openingFrames(
  id: InteractableSpriteId,
): readonly PixelGrid[] | undefined {
  return id === "npc" ? undefined : INTERACTABLE_ART[id].openFrames;
}

/** True if using this kind of interactable has an opening to play. */
export function hasOpeningArt(id: InteractableSpriteId): boolean {
  return openingFrames(id) !== undefined;
}
