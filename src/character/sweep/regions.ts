/**
 * Region masks: where each layer slot is allowed to put pixels.
 *
 * Every layer module authors its art to a declared box (see the region
 * contracts in src/iso/art/layers/*) and its own tests check its own
 * grids. What those tests cannot see is the *resolved* stack: whether
 * the thing a catalog id or an item's layer reference actually points
 * at is the art that box was declared for. A hair id resolved into the
 * headwear registry, an outfit keyed to the wrong build, a face part
 * that drifted a row — all of them are region violations at compose
 * time and nowhere else.
 *
 * So the sweep re-checks the masks against whatever `resolveLayers`
 * produced, for every combination it renders. The boxes are imported,
 * never restated: this module is the map from slot to contract, and the
 * contract itself stays with the art.
 */
import type { LayerSlot } from "../../iso/art/layers";
import { BODY_FRAME, type BodyViewId } from "../../iso/art/layers/body";
import { CYBER_REGION } from "../../iso/art/layers/cyberware";
import { FACE_REGION } from "../../iso/art/layers/face";
import { HAIR_REGION } from "../../iso/art/layers/hair";
import { HEADWEAR_REGION } from "../../iso/art/layers/headwear";
import { OUTFIT_REGION } from "../../iso/art/layers/outfits";
import { WEAPON_REGION } from "../../iso/art/layers/weapons";
import { PORTRAIT_FRAME } from "../../iso/art/layers/portrait";
import { SHADOW, type PixelGrid } from "../../iso/art/pixel";

/** A box of rows and columns, inclusive on every side. */
export interface Region {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/** The whole 32×48 frame — the body layer owns all of it. */
export const FRAME_REGION: Region = {
  top: 0,
  bottom: BODY_FRAME.height - 1,
  left: 0,
  right: BODY_FRAME.width - 1,
};

/** The declared region for every layer slot, straight from the art. */
export const SLOT_REGIONS: Readonly<Record<LayerSlot, Region>> = {
  body: FRAME_REGION,
  outfit: OUTFIT_REGION,
  face: FACE_REGION,
  hair: HAIR_REGION,
  headwear: HEADWEAR_REGION,
  weapon: WEAPON_REGION,
  cyberware: CYBER_REGION,
};

/** One pixel that broke a rule, as `(x, y)="ch"`. */
export type PixelFault = string;

const at = (x: number, y: number, ch: string): PixelFault =>
  `(${x}, ${y})="${ch}"`;

/**
 * Every opaque pixel of a grid that falls outside a region. Empty means
 * the layer honors its contract.
 */
export function pixelsOutside(grid: PixelGrid, region: Region): PixelFault[] {
  const faults: PixelFault[] = [];
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === undefined || ch === ".") continue;
      if (y < region.top || y > region.bottom || x < region.left || x > region.right) {
        faults.push(at(x, y, ch));
      }
    }
  });
  return faults;
}

/**
 * Every ground-shadow pixel in a grid. Only the body layer may cast
 * one — a shadow drawn by a hat would follow the head through the idle
 * bob and swim across the floor.
 */
export function shadowPixels(grid: PixelGrid): PixelFault[] {
  const faults: PixelFault[] = [];
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === SHADOW) faults.push(at(x, y, SHADOW));
    }
  });
  return faults;
}

/** Rule broken by one resolved layer, as a printable line. */
export interface RegionFault {
  readonly slot: LayerSlot;
  readonly art: string;
  readonly view: BodyViewId;
  readonly rule: string;
  readonly pixels: readonly PixelFault[];
}

/** Format a fault for a test failure message. */
export function describeFault(fault: RegionFault): string {
  const shown = fault.pixels.slice(0, 6).join(", ");
  const more = fault.pixels.length > 6 ? ` (+${fault.pixels.length - 6} more)` : "";
  return `${fault.slot}:${fault.art}[${fault.view}] ${fault.rule}: ${shown}${more}`;
}

/**
 * Check one resolved layer's grid against its slot's contract: pixels
 * inside the declared region, and ground shadow only from the body.
 */
export function layerFaults(
  slot: LayerSlot,
  art: string,
  view: BodyViewId,
  grid: PixelGrid,
): RegionFault[] {
  const faults: RegionFault[] = [];
  const outside = pixelsOutside(grid, SLOT_REGIONS[slot]);
  if (outside.length > 0) {
    faults.push({
      slot,
      art,
      view,
      rule: `outside its ${slot} region`,
      pixels: outside,
    });
  }
  if (slot !== "body") {
    const shadow = shadowPixels(grid);
    if (shadow.length > 0) {
      faults.push({
        slot,
        art,
        view,
        rule: "draws ground shadow, which only the body may",
        pixels: shadow,
      });
    }
  }
  return faults;
}

/* --- Portraits ------------------------------------------------------
 *
 * The 48×48 head-and-shoulders frame has its own contract (see the
 * module comment in src/iso/art/layers/portrait): a 16×12 face box
 * every overlay is authored on, the head and hair free of it, and the
 * Static tear laid over the lot.
 */

/** The whole 48×48 portrait frame. */
export const PORTRAIT_FRAME_REGION: Region = {
  top: 0,
  bottom: PORTRAIT_FRAME.height - 1,
  left: 0,
  right: PORTRAIT_FRAME.width - 1,
};

/** The 16×12 overlay window: brow line at the top, chin at the bottom. */
export const PORTRAIT_FACE_BOX: Region = {
  top: PORTRAIT_FRAME.face.top,
  bottom: PORTRAIT_FRAME.face.top + PORTRAIT_FRAME.face.height - 1,
  left: PORTRAIT_FRAME.face.left,
  right: PORTRAIT_FRAME.face.left + PORTRAIT_FRAME.face.width - 1,
};

/**
 * The declared region per portrait part kind — the prefix of the
 * cache-key fragment each resolved part carries (`eyes:narrow`,
 * `detail:scar`, `hair:bob`). Face parts and every face-box overlay
 * live in the face box; the head, the hair crown, and the Static tear
 * span the frame.
 */
export const PORTRAIT_PART_REGIONS: Readonly<Record<string, Region>> = {
  head: PORTRAIT_FRAME_REGION,
  eyes: PORTRAIT_FACE_BOX,
  brows: PORTRAIT_FACE_BOX,
  mouth: PORTRAIT_FACE_BOX,
  detail: PORTRAIT_FACE_BOX,
  headwear: PORTRAIT_FACE_BOX,
  cyber: PORTRAIT_FACE_BOX,
  hair: PORTRAIT_FRAME_REGION,
  static: PORTRAIT_FRAME_REGION,
};

/** The part kind a portrait part key names (`eyes:narrow~m` → `eyes`). */
export function portraitPartKind(key: string): string {
  return key.split(":")[0] ?? key;
}

/**
 * The two columns of the face box a crown is *meant* to touch: the
 * temples and the jaw edge, where a bob's curtains and a set of locs
 * frame the face. Everything inside them is the face proper.
 */
export const FACE_FRAMING_COLUMNS = 2;

/** The forehead-and-features window a hair crown must never cover. */
export const PORTRAIT_FACE_PROPER: Region = {
  top: PORTRAIT_FACE_BOX.top,
  bottom: PORTRAIT_FRAME_REGION.bottom,
  left: PORTRAIT_FACE_BOX.left + FACE_FRAMING_COLUMNS,
  right: PORTRAIT_FACE_BOX.right - FACE_FRAMING_COLUMNS,
};

/**
 * Hair pixels that landed on the face itself. A crown may fall past
 * the jaw beside the head — that is what shoulder locs are, and a bob
 * frames the jaw on purpose — but from the brow row down, the face
 * proper stays clear: the fringe stops above row 9, which is where the
 * brows begin.
 */
export function hairOverFace(grid: PixelGrid): PixelFault[] {
  const faults: PixelFault[] = [];
  const box = PORTRAIT_FACE_PROPER;
  grid.forEach((row, y) => {
    if (y < box.top || y > box.bottom) return;
    for (let x = box.left; x <= box.right; x++) {
      const ch = row[x];
      if (ch !== undefined && ch !== ".") faults.push(at(x, y, ch));
    }
  });
  return faults;
}

/**
 * Whether an upper layer completely hides a lower one: every opaque
 * pixel of `under` is opaque in `over`. How the sweep knows, from the
 * art alone, that a full-face rebreather masks the mouth beneath it —
 * no list of which headwear covers what.
 */
export function fullyCovers(over: PixelGrid, under: PixelGrid): boolean {
  return under.every((row, y) =>
    [...row].every(
      (ch, x) => ch === "." || (over[y]?.[x] !== undefined && over[y]?.[x] !== "."),
    ),
  );
}

/** Every opaque pixel of every grid, flattened into one mask. */
export function unionMask(grids: readonly PixelGrid[]): string[] {
  const height = Math.max(0, ...grids.map((grid) => grid.length));
  const width = Math.max(
    0,
    ...grids.flatMap((grid) => grid.map((row) => row.length)),
  );
  const mask: string[][] = Array.from({ length: height }, () =>
    Array<string>(width).fill("."),
  );
  for (const grid of grids) {
    grid.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== undefined && row[x] !== ".") {
          const cells = mask[y];
          if (cells) cells[x] = "#";
        }
      }
    });
  }
  return mask.map((cells) => cells.join(""));
}

/**
 * Whether two stacks of the same shape differ anywhere a viewer could
 * see — a layer that changed under something that completely covers it
 * changed nothing. Used to decide, from the art alone, whether two
 * expressions are supposed to draw two faces or one.
 */
export function differsVisibly(
  a: readonly PixelGrid[],
  b: readonly PixelGrid[],
): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    const under = a[i];
    const other = b[i];
    if (!under || !other) return true;
    if (under.join("\n") === other.join("\n")) continue;
    const above = unionMask(a.slice(i + 1));
    for (let y = 0; y < Math.max(under.length, other.length); y++) {
      const rowA = under[y] ?? "";
      const rowB = other[y] ?? "";
      for (let x = 0; x < Math.max(rowA.length, rowB.length); x++) {
        const chA = rowA[x] ?? ".";
        const chB = rowB[x] ?? ".";
        if (chA === chB) continue;
        if (above[y]?.[x] !== "#") return true;
      }
    }
  }
  return false;
}
