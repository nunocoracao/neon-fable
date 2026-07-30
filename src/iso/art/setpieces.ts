/**
 * Set-piece pixel art: the machinery that moves through a district
 * rather than standing in it — the cars of the elevated overline, the
 * patrol drones that quarter the market and the quays, and the steam a
 * vent stack blows off when its pumps cycle.
 *
 * These differ from props in exactly one way: they carry no map
 * placement. A prop's art is looked up by the tile it stands on; a set
 * piece is drawn wherever the scheduling logic (../setpiece.ts) says it
 * is this frame, at an explicit frame index. Everything else — palette
 * characters, 1x anchors, GlowSource metadata, the bake path — is the
 * same as every other art set.
 *
 * Nothing here is drawn on the ground, so nothing here carries a "z"
 * shadow: a train is above the rooflines, a drone hovers, and steam has
 * left the grille. The one thing they all owe the scene is a stable
 * silhouette per frame index, which is what lets the bake cache key on
 * the index alone.
 */
import { hash2 } from "../animation";
import type { SetPieceSpriteId } from "../sprites";
import type { GlowSource } from "./glow";
import type { PixelGrid } from "./pixel";
import { isoSlab, stamped, type BoxInk } from "./props";

export interface SetPieceArt {
  frames: readonly PixelGrid[];
  anchorX: number;
  anchorY: number;
  /** ms per frame of the idle loop; 0 = the caller picks the frame. */
  frameMs: number;
  /**
   * Emissive light the piece casts, in 1x art pixels relative to its
   * anchor — the same contract prop glows use. The set-piece pass adds
   * the piece's own elevation on top before placing them.
   */
  glow?: readonly GlowSource[];
}

const gap = (n: number): string => ".".repeat(n);

/* --- Overline train: a maglev car as a two-tile iso slab — a ribbed
 * steel shell with a lit window band running the length of both visible
 * flanks. 96×83, ground contact at (64, 66); the line it rides is above
 * the frame, which is why no guideway is drawn.
 *
 * The window band is found rather than authored: for each column the
 * first long run of a flank color is the pixel just under the deck
 * edge, so the panes follow whichever way that face slopes without a
 * single hand-placed coordinate. The lead car is the same shell with a
 * roof beacon and every bay burning. --- */

/**
 * Deep walls on purpose: a two-tile slab's deck is a 96×48 diamond, and
 * a shallow car under one reads as a plank rather than as rolling stock.
 * Thirty-four rows of flank is what gives the windows somewhere to be.
 */
const CAR_WALL_H = 34;

/**
 * The two faces a slab shows the camera, with the glass and livery each
 * carries. Every character here is distinct from the shell's own (roof,
 * ridge, seam, outline) — the window pass finds these faces by color.
 */
const CAR_FLANKS = [
  { char: "6", frame: "1", lit: "n", dim: "m", dark: "2", stripe: "g" },
  { char: "3", frame: "1", lit: "m", dim: "o", dark: "2", stripe: "i" },
] as const;

const CAR_INK: BoxInk = {
  top: "4",
  rim: "7",
  left: CAR_FLANKS[0].char,
  right: CAR_FLANKS[1].char,
  ink: "1",
  grain: "5",
};

/** Window bay pitch along a flank, and the pillar kept clear each side. */
const BAY_PITCH = 16;
const BAY_PAD = 3;
/** Window band: rows below the deck edge, and how deep it runs. */
const WIN_TOP = 5;
const WIN_H = 10;
/**
 * Livery stripe under the glass: the transit line's cyan, run the whole
 * length of the car so it reads as one vehicle from across the plaza
 * even when the windows are too small to make out.
 */
const STRIPE_TOP = WIN_TOP + WIN_H + 3;
const STRIPE_H = 2;
/**
 * How many rows of one color must stack before a column counts as a
 * flank. The deck's far rim is painted in the lit flank's color too, but
 * it is only two pixels deep — this is what tells the two apart.
 */
const FLANK_RUN_MIN = 6;

const carShell = isoSlab(2, 1, CAR_WALL_H, CAR_INK);

/** First row of the topmost run of `char` at least `runMin` deep. */
function flankTop(
  cells: readonly (readonly string[])[],
  x: number,
  char: string,
  runMin: number,
): number {
  let run = 0;
  for (let y = 0; y < cells.length; y++) {
    if (cells[y]?.[x] === char) {
      run++;
      if (run >= runMin) return y - runMin + 1;
    } else {
      run = 0;
    }
  }
  return -1;
}

/** Cut the window band and livery into a shell, lighting bays by frame. */
const windowed = (grid: PixelGrid, frame: number, allLit: boolean): string[] => {
  const cells = grid.map((row) => [...row]);
  const width = grid[0]?.length ?? 0;
  for (let x = 0; x < width; x++) {
    const within = x % BAY_PITCH;
    const bay = Math.floor(x / BAY_PITCH);
    // A carriage is never uniformly full: a bay or two rides dark, and
    // which ones changes frame to frame so the train reads as occupied.
    const lit = allLit || hash2(bay, frame * 7 + 3) % 5 !== 0;
    const glazed = within >= BAY_PAD && within < BAY_PITCH - BAY_PAD;
    for (const flank of CAR_FLANKS) {
      const top = flankTop(cells, x, flank.char, FLANK_RUN_MIN);
      if (top < 0) continue;
      if (glazed) {
        for (let r = 0; r < WIN_H; r++) {
          const row = cells[top + WIN_TOP + r];
          if (!row || row[x] !== flank.char) continue;
          row[x] =
            r === 0 || r === WIN_H - 1
              ? flank.frame
              : lit
                ? r < 4
                  ? flank.lit
                  : flank.dim
                : flank.dark;
        }
      }
      for (let r = 0; r < STRIPE_H; r++) {
        const row = cells[top + STRIPE_TOP + r];
        if (!row || row[x] !== flank.char) continue;
        row[x] = flank.stripe;
      }
    }
  }
  return cells.map((row) => row.join(""));
};

/**
 * The lead car's roof beacon, sat on the deck's center. Every bay of
 * the head car burns, so this strobe is the only thing that changes
 * between its frames — which is why it cycles through three states and
 * not two, or the loop would repeat itself halfway round.
 */
const trainBeacon = (phase: number): string[] => {
  const lamp = ["9999", "8998", "8888"][phase % 3] ?? "9999";
  const lights = ["pnnp", "1nn1", "1oo1"][phase % 3] ?? "pnnp";
  return [
    "..000000..",
    ".08TTTT80.",
    "0T" + lamp + "T0",
    ".0" + lights + "0.",
    "..000000..",
  ];
};

/** Deck center of a 2×1 slab: half a tile back from the near anchor. */
const BEACON_X = 43;
const BEACON_Y = 22;

const trainCar = (frame: number): string[] => windowed(carShell.grid, frame, false);

const trainHead = (frame: number): string[] =>
  stamped(
    windowed(carShell.grid, frame, true),
    trainBeacon(frame),
    BEACON_X,
    BEACON_Y,
  );

/* --- Patrol drone: a two-rotor scanner, chrome hull with a cyan optic
 * and a red status pair, throwing a dithered scanning cone at the
 * ground below it. 22×28, anchored at the lens (11, 12) so the hover
 * height is measured from the machine and not from the cone. --- */

const DRONE_W = 22;
/** Column the hull and its cone are centered on (between two pixels). */
const DRONE_CENTER = 10.5;
/** Rows of hull, then rows of cone hanging under it. */
const DRONE_HULL_H = 12;
const DRONE_CONE_H = 16;

const droneHull = (spin: number, beacon: boolean): string[] => {
  // Rotor discs blur through three phases; the hull underneath is fixed.
  const disc = ["8888", "T88T", "8TT8"][spin % 3] ?? "8888";
  return [
    gap(2) + disc + gap(10) + disc + gap(2),
    gap(1) + "0TTTT0" + gap(8) + "0TTTT0" + gap(1),
    gap(2) + "0000" + gap(10) + "0000" + gap(2),
    gap(4) + "0" + gap(4) + "0000" + gap(4) + "0" + gap(4),
    gap(5) + "0" + gap(1) + "0TTTTTT0" + gap(1) + "0" + gap(5),
    gap(6) + "08TTTTTT80" + gap(6),
    gap(6) + "08TghhgT80" + gap(6),
    gap(6) + "0166666610" + gap(6),
    gap(7) + "01" + (beacon ? "p66p" : "1661") + "10" + gap(7),
    gap(8) + "016610" + gap(8),
    gap(9) + "0gg0" + gap(9),
    gap(10) + "hh" + gap(10),
  ];
};

/**
 * One row of the scanning cone: a dithered wedge that widens and thins
 * with depth, so the beam fades out before it reaches the ground rather
 * than ending in a hard edge. `sweep` walks the dither across the cone
 * frame to frame — that drift is the "scanning" read.
 */
const droneConeRow = (depth: number, y: number, sweep: number): string => {
  const half = 1 + depth * 0.55;
  // A checkerboard reads as a translucent wash; thinning the lattice
  // further down is what makes the beam fall off before the ground.
  const step = depth < 9 ? 2 : 3;
  let row = "";
  for (let x = 0; x < DRONE_W; x++) {
    const on =
      Math.abs(x - DRONE_CENTER) <= half && (x + y + sweep) % step === 0;
    row += on ? (depth < 6 ? "g" : "i") : ".";
  }
  return row;
};

const patrolDrone = (frame: number): string[] => [
  ...droneHull(frame, frame % 2 === 0),
  ...Array.from({ length: DRONE_CONE_H }, (_, k) =>
    droneConeRow(k, DRONE_HULL_H + k, frame),
  ),
];

/* --- Vent steam: a burst of exhaust leaving a stack's grille and
 * climbing away, drifting up-right the way the vent's own idle wisps
 * do. 20×32, anchored at the grille (10, 31) — the burst is placed over
 * the vent it came out of, so the anchor is the mouth, not the ground.
 *
 * A burst is a puff travelling upward, not a column switching on: each
 * frame occupies a band of heights that rises and spreads, so the
 * earlier frames sit on the grille and the later ones have left it. --- */

const STEAM_W = 20;
const STEAM_H = 32;
/** Steam frames in one burst; the last is the thinnest. */
const STEAM_FRAMES = 5;
/**
 * How far the burst's foot climbs per frame, and how fast its head
 * outruns it: the column stretches tall before the foot finally leaves
 * the grille, which is what a stack blowing off actually looks like.
 */
const STEAM_RISE = 4;
const STEAM_BODY = 10;
const STEAM_REACH = 5;

const steamFrame = (k: number): string[] =>
  Array.from({ length: STEAM_H }, (_, y) => {
    // Height above the grille: the grid's last row is the mouth.
    const h = STEAM_H - 1 - y;
    const lo = k * STEAM_RISE;
    const hi = lo + STEAM_BODY + k * STEAM_REACH;
    let row = "";
    for (let x = 0; x < STEAM_W; x++) {
      if (h < lo || h > hi) {
        row += ".";
        continue;
      }
      const age = (h - lo) / Math.max(1, hi - lo);
      // Widening and drifting with height; thinning as the puff ages.
      const halfW = 2 + age * 3 + k * 0.6;
      const axis = STEAM_W / 2 - 0.5 + h * 0.14;
      // The outermost sliver is cut rather than thinned: a pixel that
      // only survives one time in ten reads as a speck, not as vapour.
      const edge = Math.abs(x - axis) / halfW;
      if (edge > 0.92) {
        row += ".";
        continue;
      }
      // Patch mottling, not per-pixel speckle: 2×2 cells give steam a
      // billow. Per-pixel noise at this scale reads as television snow.
      const noise =
        (hash2(Math.floor(x / 2) * 7 + k * 31, Math.floor(h / 2) * 5 + 3) % 100) /
        100;
      // Solid down the axis, ragged at the rim: the density falls off
      // with the square of the distance from the plume's core, so the
      // noise only ever eats the outside of the burst.
      const density = (1.25 - age * 0.3 - k * 0.06) * (1 - edge * edge * 0.8);
      if (noise > density) {
        row += ".";
        continue;
      }
      // Lit from the top left like everything else, with a dim fringe.
      const tone = noise < density * 0.45 ? "8" : noise < density * 0.8 ? "7" : "6";
      row += edge > 0.72 ? "6" : tone;
    }
    return row;
  });

export const SETPIECE_ART: Readonly<Record<SetPieceSpriteId, SetPieceArt>> = {
  "train-head": {
    frames: [trainHead(0), trainHead(1), trainHead(2)],
    anchorX: carShell.anchorX,
    anchorY: carShell.anchorY,
    frameMs: 240,
    // The headlamp wash, thrown well ahead of the lit window band.
    glow: [
      { color: "n", radius: 22, intensity: 0.4, offsetX: 0, offsetY: -34 },
      { color: "m", radius: 18, intensity: 0.2, offsetX: 0, offsetY: -14 },
    ],
  },
  "train-car": {
    frames: [trainCar(0), trainCar(1), trainCar(2)],
    anchorX: carShell.anchorX,
    anchorY: carShell.anchorY,
    frameMs: 240,
    // Amber spill off the window band, running the length of the car.
    glow: [{ color: "m", radius: 20, intensity: 0.24, offsetX: 0, offsetY: -14 }],
  },
  "patrol-drone": {
    frames: [patrolDrone(0), patrolDrone(1), patrolDrone(2)],
    anchorX: 11,
    anchorY: DRONE_HULL_H,
    frameMs: 90,
    // The scan cone pooling under the machine, plus the optic itself.
    glow: [
      { color: "g", radius: 16, intensity: 0.3, offsetX: 0, offsetY: 14 },
      { color: "g", radius: 8, intensity: 0.24, offsetX: 0, offsetY: -3 },
    ],
  },
  "steam-burst": {
    frames: Array.from({ length: STEAM_FRAMES }, (_, k) => steamFrame(k)),
    anchorX: STEAM_W / 2,
    anchorY: STEAM_H - 1,
    // Bursts are scheduled, not looped: the caller names the frame.
    frameMs: 0,
  },
};
