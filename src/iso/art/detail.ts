/**
 * The detail pass: what turns a 1x authored grid into the finer grid
 * that actually gets painted.
 *
 * Every sprite in the game is authored at 1x and baked at ART_SCALE, so
 * one authored pixel has always covered a 2×2 block of screen pixels —
 * four screen pixels forced to carry one decision. This pass spends
 * them. It doubles the grid first (edge-aware, so diagonals step at
 * half the old size instead of the same staircase drawn twice), then
 * bevels the half-pixel that is now available along every interior
 * material edge. Same picture, same size, four times the pixels, each
 * one able to differ from its neighbors.
 *
 * Three rules keep this from being a filter that "improves" art behind
 * the artist's back:
 *
 * - **No color is invented.** Lighting a pixel means stepping one place
 *   along its own authored ramp (see SHADING_RAMPS); a color with no
 *   ramp neighbor in that direction stays exactly as it is. Emissive
 *   entries opt out entirely — a neon tube is its own light source and
 *   does not get a shaded side, the same reasoning day-phase tinting
 *   uses to leave them alone.
 * - **Shading the artist drew is left alone.** The bevel only fires
 *   where two *materials* meet, never where one material meets its own
 *   darker step, so a face that was already modeled does not get a
 *   second set of highlights scribbled over it.
 * - **The silhouette is never beveled.** Only opaque neighbors count as
 *   edges, so no shape gets an outline it was not drawn with. That is
 *   also what keeps ground tiles tessellating: a diamond that lit its
 *   own outer edge would draw a lattice across every paved street.
 *
 * Pure grid → grid, so what the renderer paints can be checked without
 * a canvas. ../pixel.ts calls this from bakeSprite; nothing else needs
 * to know it happened.
 */
import {
  DARKER_STEP,
  EMISSIVE_COLORS,
  LIGHTER_STEP,
  RAMP_OF,
  SHADOW,
  TRANSPARENT,
} from "./palette";
import type { PixelGrid } from "./pixel";

/** How many detail pixels one authored pixel becomes per axis. */
export const DETAIL_SCALE = 2;

/**
 * The outline character. It is the one color the bevel never rewrites:
 * an outline that lightened on one side and darkened on the other would
 * stop reading as a drawn line and start reading as a bevel of its own.
 */
const OUTLINE = "0";

/**
 * Per-character lookup tables, built once. Both passes run over every
 * pixel of every sprite the game bakes, so each asks its questions
 * ("can this take the bevel?", "what does it shade to?") as one array
 * index off the character code rather than a set lookup or a chain of
 * comparisons.
 */
const TABLE_SIZE = 128;

function charTable<T>(fill: T, entries: Iterable<[string, T]>): T[] {
  const table = Array<T>(TABLE_SIZE).fill(fill);
  for (const [ch, value] of entries) table[ch.charCodeAt(0)] = value;
  return table;
}

/** Whether a character is part of the picture and takes the bevel. */
const SHADEABLE: readonly boolean[] = charTable(
  true,
  ([TRANSPARENT, SHADOW, OUTLINE, ...EMISSIVE_COLORS] as string[]).map(
    (ch) => [ch, false] as [string, boolean],
  ),
);

/** Whether a character is part of the picture at all. */
const OPAQUE: readonly boolean[] = charTable(
  true,
  [TRANSPARENT, SHADOW].map((ch) => [ch, false] as [string, boolean]),
);

/** Ramp index per character; -1 for colors belonging to no ramp. */
const RAMP: readonly number[] = charTable(
  -1,
  Object.entries(RAMP_OF).map(([ch, index]) => [ch, index] as [string, number]),
);

const LIGHTER: readonly (string | undefined)[] = charTable<string | undefined>(
  undefined,
  Object.entries(LIGHTER_STEP) as [string, string][],
);

const DARKER: readonly (string | undefined)[] = charTable<string | undefined>(
  undefined,
  Object.entries(DARKER_STEP) as [string, string][],
);

/**
 * Edge-aware doubling (the Scale2x / AdvMAME2x rule). Each pixel
 * becomes 2×2; a corner sub-pixel takes a neighbor's color only where
 * two adjacent neighbors agree with each other and the opposing pair
 * does not — which is the inside of a diagonal step, and nothing else.
 * Isolated pixels, straight runs, and deliberate single-pixel details
 * (an eye, a rivet) come through untouched, so the pass halves the
 * staircase on every diagonal without eroding anything anybody drew.
 *
 * Out-of-bounds neighbors read as the center pixel, so the frame border
 * is never mistaken for an edge to round against.
 */
export function doubled(grid: PixelGrid): string[] {
  const height = grid.length;
  if (height === 0) return [];
  const out = Array<string>(height * 2);
  for (let y = 0; y < height; y++) {
    const row = grid[y] ?? "";
    const width = row.length;
    const above = (y > 0 ? grid[y - 1] : row) ?? row;
    const below = (y < height - 1 ? grid[y + 1] : row) ?? row;
    const top = Array<string>(width * 2);
    const bottom = Array<string>(width * 2);
    for (let x = 0; x < width; x++) {
      const e = row[x] as string;
      const b = above[x] ?? e;
      const h = below[x] ?? e;
      const d = x > 0 ? (row[x - 1] as string) : e;
      const f = x < width - 1 ? (row[x + 1] as string) : e;
      const i = x * 2;
      if (b !== h && d !== f) {
        top[i] = d === b ? d : e;
        top[i + 1] = b === f ? f : e;
        bottom[i] = d === h ? d : e;
        bottom[i + 1] = h === f ? f : e;
      } else {
        top[i] = e;
        top[i + 1] = e;
        bottom[i] = e;
        bottom[i + 1] = e;
      }
    }
    out[y * 2] = top.join("");
    out[y * 2 + 1] = bottom.join("");
  }
  return out;
}

/**
 * Whether the character code `n` is a different *material* from the
 * pixel whose code is `c` and whose ramp is `ramp`: opaque, and not
 * simply another step of the ramp `c` is drawn in. A color belonging to
 * no ramp (a hair dye, danger red) borders everything that is not
 * itself — it has no shading of its own for this pass to step on.
 */
function bordersMaterial(n: number, c: number, ramp: number): boolean {
  if (n === c || !OPAQUE[n]) return false;
  return ramp < 0 || RAMP[n] !== ramp;
}

/**
 * Interior bevel: along the top-left border of a material, step one
 * place up its ramp; along its bottom-right border, one place down —
 * the top-left light source the whole palette is authored for, now that
 * there is a half-pixel to spend on it.
 *
 * Pixels bordered on both sides belong to a run one detail pixel thick;
 * those keep their authored color, since a pixel that is both the lit
 * and the shaded edge of something is neither.
 */
export function beveled(grid: PixelGrid): string[] {
  const height = grid.length;
  if (height === 0) return [];
  const blank = TRANSPARENT.charCodeAt(0);
  const out = Array<string>(height);
  for (let y = 0; y < height; y++) {
    const row = grid[y] ?? "";
    const width = row.length;
    const above = y > 0 ? grid[y - 1] : undefined;
    const below = y < height - 1 ? grid[y + 1] : undefined;
    const cells = Array<string>(width);
    for (let x = 0; x < width; x++) {
      const ch = row[x] as string;
      const c = row.charCodeAt(x);
      if (!SHADEABLE[c]) {
        cells[x] = ch;
        continue;
      }
      const ramp = RAMP[c] as number;
      const up = above ? (above.charCodeAt(x) || blank) : blank;
      const down = below ? (below.charCodeAt(x) || blank) : blank;
      const left = x > 0 ? row.charCodeAt(x - 1) : blank;
      const right = x < width - 1 ? row.charCodeAt(x + 1) : blank;
      const lit =
        bordersMaterial(up, c, ramp) || bordersMaterial(left, c, ramp);
      const shaded =
        bordersMaterial(down, c, ramp) || bordersMaterial(right, c, ramp);
      cells[x] = lit === shaded ? ch : ((lit ? LIGHTER[c] : DARKER[c]) ?? ch);
    }
    out[y] = cells.join("");
  }
  return out;
}

/** The full pass — double, then bevel. This is what bakeSprite paints. */
export function refined(grid: PixelGrid): string[] {
  return beveled(doubled(grid));
}
