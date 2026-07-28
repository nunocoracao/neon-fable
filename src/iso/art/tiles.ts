/**
 * Ground tile pixel art, authored as diamond interior rows (see
 * diamond()) — every set is now native v2 64×32. The street and water
 * families are hand-authored grids; the industrial/interior floors
 * (rust plates, foundation, plaza glow, and the bar/clinic/office
 * interior materials) are synthesized deterministically from
 * hash2-seeded paint functions whose seam geometry lives in the shared
 * diagonal-lattice coordinates, so plank runs, tile grout, and plate
 * seams continue across tile boundaries. Walkable tiles get 3+ texture
 * variants picked deterministically from tile coordinates, and
 * water/glow tiles animate through short frame loops. Light falls from
 * the upper left: upper edges are lit, lower edges shaded. Interior
 * floors additionally register per-edge trim variants (baseboardGrid)
 * carrying a baseboard-shadow row for floor-to-wall and doorway
 * transitions, keeping the treatment data-driven per tile id.
 */
import { hash2 } from "../animation";
import {
  INTERIOR_FLOOR_IDS,
  TRIM_EDGES,
  type InteriorFloorId,
  type InteriorTrimId,
  type TileId,
  type TrimEdge,
} from "../tilemap";
import type { GlowSource } from "./glow";
import { DIAMOND_WIDTHS, diamond, type PixelGrid } from "./pixel";

export interface TileArt {
  /** variants[v] is a frame loop; static tiles have a single frame. */
  variants: readonly PixelGrid[][];
  /** Per-frame duration for animated tiles (0 when static). */
  frameMs: number;
  /**
   * Emissive light every tile of this kind casts in the glow pass;
   * offsets are in 1x art pixels relative to the diamond center.
   */
  glow?: readonly GlowSource[];
  /**
   * Wet surface: the tile receives a faint offset copy of nearby prop
   * and interactable glows (a cheap reflection accent, not lighting).
   */
  reflective?: boolean;
}

/* --- Pavement (native 64×32): concrete sidewalk plates split by seam
   grooves with lit far walls, per-plate tone shifts, speckle, and
   grime pooling toward the shaded lower half. --- */

const pavementA = diamond([
  "SS",
  "SSRRRR",
  "SSRRRRRRRR",
  "SSRRRRRRRRRRRR",
  "SSRRRRRRRRRRRRRRSS",
  "SSRRRRRQRRRRRRRRRRRRSS",
  "SSRSRRRRSRRRRRRRRRRRRQQSRR",
  "SSRRRRRRRRRRRQRRRRRRQQQSRRRRRS",
  "SSRRQRRRRSRRRRRRRRRRRQQSRRRRRRRRRR",
  "SSRRRRRRRRRRRRRRRSRRQQQSRRRQSRRRRRQRRS",
  "SSQSRRSRRRRRRRRRRRQRRQQSRRRRRRRRRRRRRRRRRS",
  "SSRRRQQSRRRRRSRRRRRRRQQSRRRRRRRRRRRSRRRRRRRRSR",
  "SSRRRRRRRQQRRRRRRRQRRQQSRRRRRRRRRRRRRQRRRRRRRRRRSR",
  "SSRRRQRRRRRRRQQRSRRRRQQSRRRRRRRRRRRRRRRRRRRRRRRRRRRRSR",
  "SSRRRRRRSRRRRQRRRQQRRQQSRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRQSS",
  "SSRRRRRRRRRRRRRRRRSRRQQSQRRRRRRRRRRRRRRRRRRRRRRRRRSRRRRRRRRRSR",
  "QQRRRQRRRRRRRRRRRRRQQQRQQSSRRRRRRRRRRRRRRRRRRRRRRRRQRRRRRQRRQ1",
  "QQRRRRRRRRRRRRRQQSRRRRRQQSRRRRRRRRRRRRRRRRRRRRRRRRRRQRRRQQ",
  "QQRRRRRRRRRQQSRRRRRRRRRQQSRRRSRRRQRRRRRRRRRQRRRRRRRRQQ",
  "QQRSRRRQQSRRRRRRRRRRRRRQQSQRRRRRRRQRRRRRRRRRRRRRQ1",
  "QQRQQSSRRRRRRRRRRSRRRRQQQSRQRQRRRRRRRRRRRRRRQQ",
  "QQRRRRRRRRQRRQRSRRRRQQRQQSRRQRRRRRRRRRRRQQ",
  "QQRRRRRRRRRRRRRRSRRRSQRQQQQRRRRRRRRRQ1",
  "QQRRQRRRRRRRRRRRRRRRRRQQQQQRRRRRQ1",
  "QQRRRRRQRRRRRRRRRRQRQRQQQRRRQQ",
  "QQSRRRRRRQRRRRRRRRRRRRRQ1Q",
  "QQRRRRRRRRRRRRRQRRRRQQ",
  "QQRRRRRRRRRRRRRRQQ",
  "QQQRRRRRRRRRQ1",
  "QQRRRRRRQ1",
  "QQRR1Q",
  "QQ",
]);

const pavementB = diamond([
  "SS",
  "SSRRSR",
  "SSRRRRSRSS",
  "SSRRRRRRRRRRSS",
  "SSRRRRRRRQRRRRRRSR",
  "SSQRRRSRRRRRRRRRRRRRSR",
  "SSRRRQQSRRRRRRRRRRRRRRRRSR",
  "SSRRRRRRRQQSRRRRRRRRRRRRRRQRSS",
  "SSRQRRRRQRRQRQQSRRRRRRRRRRRRRRRRSS",
  "SSRRRRRRRRRRRSRRRQQSRRRRRRRRRRRRRRRRRR",
  "SSRRRRRRRRRRRRQRRQRRRQQSRRRRRRRRRRRRQRRRRR",
  "SSRRRRRQRRRRRRRRRRRRRRRRRQQSRRRSRRRRSRSRRQQSRS",
  "SSRRRRRRRRRRRRRRRRRRRRRRRSRRRQQSRRRRRRRRRQQSRRRRRR",
  "SSRRRRRRRRRQRRRRRRRRRRRRRRRRRRRRRQQSRRRRRQQSRRRRRRRRRR",
  "SSRRRRSRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRQQSSQQSRRRRRRRRRRRRSS",
  "SSRRRRRQRRRRRRRQRRRRRRRRRRRRRRRRRRRRQRRRRQQSRRRRRRRRRRRRRRRRSR",
  "QQRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRQQSRQQSRRRRRSRRRRRRRRQQ",
  "QQQRRRRRRRRRRRRRRRRRRRRRRQRRRRRRRRQQQSRRRRRQQSRRRRRRRRRRQ1",
  "QQRRRRRRRRRRRRRQRQRRRRRRRRRRRRRQQQQRQQRRRRSQQSRRRRRRQQ",
  "QQRRQRRRRRRRRRRRRRRRRRRRRRRQQSQQRQQRRRRRRRRQQSRRQQ",
  "QQRRRRRRRRRRRRRRRRRRRRRQQSQRRRRSRRRRRRRRRRRQ11",
  "QQRRRRRRRRRRRRRRRRRQQSRRRRRRRRRRRRQQQQRR1Q",
  "QQRRRRRRRRRRRRRQQSRRRRRRRRRRRRRQRQQQ1Q",
  "QQQRRRRRRRRQQSRRRRQRRRRRQRRRRRRRQQ",
  "QQRRRRRQQSRRRRRRRRRRRRRRRRRRQQ",
  "QQRQQSRRRRRRRRRQRRRRRRRRQQ",
  "QQRRRRRRRSRRRRRRRRRR1Q",
  "QQRRQQRRRRRRRRRR11",
  "QQRQRRRQRRRRQ1",
  "QQRRRRRRQQ",
  "QQRRQQ",
  "QQ",
]);

const pavementC = diamond([
  "SS",
  "SSRRSR",
  "SSRRRRRRSS",
  "SSRRRRRRRRQRRR",
  "SSRRRRRRRRRRRRRQRR",
  "SSRRRRRRRRRRRRRQQSRRSR",
  "SSRRQRRRRRRRRQRQQSRRQRRQRS",
  "SSRQQRRRRRRRRRQQQSRRRRRRRRRRRR",
  "SSRRQRQQQSRRRSQQQSRRRRRRRRRRRRRQSS",
  "SSRRRRRRRRSQQRRQQSRRRRRRRRQRRRRQQQSRRR",
  "SSSRRQRRSRRRRRRQQSRRRRRRRRRRRRRQQSRRRRRRRR",
  "SSRRQRRRRRRSRRRQQSRQQRRRRRRQRRRQQSRRQRRRRRRRSR",
  "SSRQRRRRQRRRRRRQQSRRRQRQQSRRRRRQQSRRRQQSRRRSRQRQRR",
  "SSRQQSRQSQRQRRRQQRRRRRRRRRRQQSRQQSRRRRRRRRRRQSRQQSRRSR",
  "SSRRRRRQQSRRRRRQQSRRRRRRRSRRRRRQQRRRRRRRRRRRRRRQQRRRRRQRRS",
  "SSQQRRRRRRRQQSRQQSRRRRRRRRRRRRRQQRRQQSRSQRRRRRRQQSRRRRRRRRRRSR",
  "QQQQRRRRRRRRRQQSRRRRRRRRRRRRRQQSRRRRRQQSRRRRRQQSRRRRRRRRSRRRQ1",
  "QQRRRSRRQQQSRQQSRRRRRRRRRQQSRRRSRRRRRQQSRQQRRRRRRRRRRRRR1Q",
  "QQRRRQQSRRRRRQQSRRRRRQQSRRRRRRRRRRRRRQQSRSRRRRRRRRRRQQ",
  "QQQSRRRRRRRRRQQSRQQSRRRRRRRRRRRRRQQSRQQSRRRRRRQRQ1",
  "QQRRRRRRRRSRRQQSRRRRRRRRRRRRRQQSRRRRRQQSSRRR11",
  "QQRRRRRRRQQSRQQSRRRRRRSRRQQSRRRRRRRRRQQSQQ",
  "QQRRRQQRRRRRRQQSRRQRQQQSRQRRRRRRRRRRQQ",
  "QQQSRRRRRRRRRQQSRQQQRRRQRRRRRRRRQQ",
  "QQRRRRRRRRRRRQQSRRRRRRRRQRRRQQ",
  "QQRRRRSRRQQSRQQRRRRRRRRRQQ",
  "QQRRRQQSSRRRSQQRRRRR1Q",
  "QQQSRRRRRSRQRQQS1Q",
  "QQRRRRQRRRRRQQ",
  "QQRRRRRSQQ",
  "QQRRQQ",
  "QQ",
]);

/* --- Cracked pavement (native 64×32): the same plates with wandering
   fissures (some tar-filled), chipped rubble, and a rimmed pothole. --- */

const crackedA = diamond([
  "SS",
  "SSRRSR",
  "SSRR11RRRS",
  "SSRQR112RRRRSS",
  "SSRRQR112RRRRRRRRR",
  "SSRRRQRR211RRRRRRRRRRR",
  "SSRRRRRRRSSRR11RRQRRRRRSSS",
  "SSSRRRRRRRRRQRRR11RRRRRRRRRRSR",
  "SSRRRRQRRRRRRRRRRR211RRRQSRRRRRRRS",
  "SSRRRRRQRRRRRSRRRRRRR11RRRRRRRRRRRR2RS",
  "SSQRRRRRRRRRRRRRRRQRR2112RRRRRRRRRRRRRRQRS",
  "SSRRRRRRRRRRRSRRSRRRRRRRRR112RRRRRRRR2SQQSRRSR",
  "SSRRRRQRRRRSRRRRRRRSRRRRRRRR11RRRRRRRSRQQSSRRRRRRR",
  "SSRRQRRRRRRRRRRRQRRSRRRRRRRRRRR11S2RRRRQQRRRRRRRRRRRRR",
  "SSR2RRRRRRRRRRRRRRRRRRRRRR2RRRRRRRR11RRQQSRRRRRRRRRRRQRRSR",
  "SSRRRRRRRRRRRRQRRRSRRRRRRRRRRRRRRRQR112QQRRRRRRRRRRRRRRRRRRRSR",
  "QQRRRRRRRRRSRRRRSRRRRR2RRRRRRRR2RRRQ11QRRRRRRRRRRRRQRRRRRRRRQQ",
  "QQRRRRRRRRRRRRRRRRRRRRRRRRRRQRRRR11Q11RRR2RRRRRRRRRRRRRRQQ",
  "QQRRRRQRRRR2RRRRRRRQRRRRRRRRR112RRRR1111RRRRRRRRRRR2QQ",
  "QQRRRRRQRRRRRRRRR2RRRRRRRQQ112RRRRRRRR1111RRQRRQQQ",
  "QQRRRRRRR2RRRRRRRSSRRQQSS112QRRRRRQRRQRQRRRRQQ",
  "QQRRRRSRRRQRRRRRRQQRR211RRRRRRRQR2RRRRRR1Q",
  "QQRRRRRRRRRRQQQRSRRRQ211RRRRQRRRRRRRQQ",
  "QQRRRRRRRQQSSRRRRRR11RRRRRRRRRRRQQ",
  "QQRRSQQSRRRRRRRRRR11RRRRRRRRQ1",
  "QQQRRRRRRRR2RQRRQ211RRRRQQ",
  "QQRRRRSRRRRRRR2112RRQQ",
  "QQRRRRQRRQQRR211Q1",
  "QQRRRRR2RRRR1Q",
  "QQRRRRRRQ1",
  "QQRQ1Q",
  "QQ",
]);

const crackedB = diamond([
  "SS",
  "SSRRRS",
  "SSSRRRSRSS",
  "SSRRRRRRQRRQRR",
  "SS12RRRRRRRRRRRRRS",
  "SSR211RQRRRQRRRRRRRRRS",
  "SSRQRRRRR01RRRRRRRRRRRRRSS",
  "SSRRRQRRRRRR01RRRRQSRRRQRRRRSR",
  "SSRRRRRRQRR2QR11RRRRRQRRRRR01RRRSR",
  "SSSRRR2RRQRRRRS11RRRRQRRRRRRRR112RRQSR",
  "SSRRRRQRRRRRRRRR2112RSRRRQRRQR11SR2RRRRRRR",
  "SSRRRRRRQRRRRRRRQR01RRRRRRSQRQR01QRRRRRQRRRRSR",
  "SSRQRRRRRRRSQRRRRRRR2012RRRRRRRSS2012RRRRRRRRRRRRR",
  "SSRRRRQRRRRRRRRRRRRRRRRRRR01RRRRRR11RRRQRSQRRRRRRRRRSS",
  "SSRRRRRRRQQRRRRRRRRRRQRRRRR211RRRQQ2012RRRRRRRQRRRRRRRRRRR",
  "SSRR2RRRRRRRRRRRRQRRRRRR2RRRRRRRR11RR201QRRRSSRRRRRQRRRRRRRRRR",
  "QQ2SRRRQRRRRRRRRRRRRRRRRRRRRRRRRRRR012RRR2RRRQQRRSRRRRRRRRSRQ1",
  "QQRRRRRRRRRRQQRRQQRRRQRR2RRSRQR01R11RRRRRRRRRRRRRRRRRRRR1Q",
  "QQRRSRRRRRRRRRRRRRRRRRRRRR012QR201RRSRRRRRRRRRRQSRSRQQ",
  "QQR2SRRRRRQRRRRRRRSRRR11SQRRRRRR11111111RRRRRRRRQQ",
  "QQRRRRRRRRRRRRRRRRRR11RRRR2R1111RRRRRRRRRQRRQ1",
  "QQRRRRRRRRQRRRRQ201RRRQRRRR211RRRRRRRRRRQQ",
  "QQRRRRRRRRRRRRR2RRQRRRRRQRRQR01RRRRRQQ",
  "QQRRRRRRRRSRRRRRRRRQRRRSRR11RRRRQQ",
  "QQRRRRRRQRRRRSRRQRRRRRRRRR11Q1",
  "QQRRRRRRRRRRRRRRRRRRRRRRQ1",
  "QQRRSRRRRRRRRRRRRRRR1Q",
  "QQQRRRRRRRRRSSRRQQ",
  "QQRRRRSR2RRRQQ",
  "QQQRRRRR1Q",
  "QQRRQQ",
  "QQ",
]);

const crackedC = diamond([
  "SS",
  "SSRRRR",
  "SSRRRRRRRR",
  "SSRRRQRRRRRRRR",
  "SSRQRRRRQR2RRRRRRR",
  "SSRRRRRRRRRRRRRRRQQSSR",
  "SSRRRRRQRRRRRRRQRQQRRRR2RR",
  "SSRRRRRRRRRRRRRRRQQRSRRRRRRRSS",
  "SSRRRRRRRRRRRRRRRQQRRRRRRR2RR2RRRR",
  "SSRRRQRRRRRRRRRRRQQRRRRRRRRRRRRRRRRRRR",
  "SSRRRSRRRRRRRRRRRQQSRRRRRRRRRRRRR2RRRRRRRR",
  "SSRRR2RRRRQRRRRRRQQRSRR2RRRRRRRRQRRRRRRRRRQ2SS",
  "SSRRRRRRRRRRRRRRRQQSSRRRRQRRRRRRRRQQRRRRRR2RR211RS",
  "SSRRRRQRRRRRRRRRSQQSRRRRRR2RRRRR2RRQ2RRRRRQRRRRRRRR1SS",
  "SSRRRRRRRRRRRRRRRQQSRRRRRRRRRR2RRRRRRRQRRRRRRRRRRRRRRR11SR",
  "SSRRRRRRRR2RRRSRSQQRRQRRRRRRRRRRRRRRRRRQRRRRRRRRRRRRRRRRRRRRSS",
  "QQRRRRRRQRRRRRRQQRSQRRRRRRRQRRRQRRQRRRRRRRRQRRRRRRRRRRR2RRRRQQ",
  "QQRRQRRRRRRQQRSRRRRRRRR2Q1111Q2QRQRRRRRRRRRRRR2RRRRRRRQRQ1",
  "QQRRRRRQQRS2RRRRR2RQ2211211122QQRRRRRR2RRRRRRRRRRRRQQQ",
  "QQSQQRRRRRRRQRRRRRQ221112221222RRRRRRRRRRRRRRRRRQQ",
  "QQRRRRRRRRRRRRRQQ22222211212QRRRRRRRRRRRRRRR1Q",
  "QQRRRRRRRRRRRRRQQ111221222QQRRRRRRR2RRRRQQ",
  "QQRRS2RRRRRRRRRRQ21212Q2QQRRRRRRRRRR11",
  "QQRRRRRRQQ2RRQRQQ2RRRRRRQRRRRRRRQQ",
  "QQRQRRRRRRRRRRRRRQSRRRRQ2RRRQQ",
  "QQRRRRRRRRRRRRRRRRRRRRRRQ1",
  "QQRQRRRRRQRRRRRRRR2R1Q",
  "QQRRRRRRRRQRRRRR1Q",
  "QQRRRRRRRRRRQQ",
  "QQRRRRRRQQ",
  "QQR2QQ",
  "QQ",
]);
/* --- Synthesized floors (native 64×32): shared paint helpers. ---
   floorDiamond paints every interior pixel through a material's paint
   function while applying the standard slab rim — lit upper-left edge,
   shaded lower-left, dark lower-right — for the top-left light source.
   isoCoords maps an art pixel to diagonal-lattice coordinates: `a`
   rises down-right (along the n/s edges), `b` rises down-left (along
   the w/e edges), and both advance by a multiple of 64 between
   adjacent tiles, so any pattern with a period dividing 64 in these
   units tessellates seamlessly across tile boundaries. --- */

interface FloorRim {
  /** Lit upper-left rim color. */
  lit: string;
  /** Shaded lower-left rim color. */
  shade: string;
  /** Darkest lower-right rim color. */
  dark: string;
}

/** One native diamond painted per-pixel with the standard slab rim. */
function floorDiamond(
  rim: FloorRim,
  paint: (x: number, r: number) => string,
): string[] {
  return diamond(
    DIAMOND_WIDTHS.map((width, r) => {
      const pad = (64 - width) / 2;
      let row = "";
      for (let c = 0; c < width; c++) {
        if (r < 16) {
          row += c < 2 ? rim.lit : paint(pad + c, r);
        } else if (c < 2) {
          row += rim.shade;
        } else if (width - 1 - c < 2) {
          row += rim.dark;
        } else {
          row += paint(pad + c, r);
        }
      }
      return row;
    }),
  );
}

/** Offset keeping diagonal coordinates positive for % arithmetic. */
const ISO_LATTICE_OFFSET = 128;

/** Diagonal-lattice coordinates of art pixel (x, r); see note above. */
function isoCoords(x: number, r: number): { a: number; b: number } {
  return {
    a: x - 32 + 2 * r + ISO_LATTICE_OFFSET,
    b: 2 * r - (x - 32) + ISO_LATTICE_OFFSET,
  };
}

/* --- Plaza glow (native 64×32): lighter slabs with speckle and an
   inset 2px neon ring diamond whose caps flash bright (2-frame
   pulse: cyan lit vs dimmed ember). --- */

/** Ring membership for the inset glow diamond, or null off the ring. */
function plazaRingAt(x: number, r: number): "edge" | "cap" | null {
  const inset = 5;
  const iR = r - inset;
  const span = 31 - 2 * inset;
  if (iR < 0 || iR > span) return null;
  const width = 4 * Math.min(iR, span - iR) + 2;
  const pad = (64 - width) / 2;
  const i = x - pad;
  if (i < 0 || i >= width) return null;
  const fromEdge = Math.min(i, width - 1 - i);
  if (width <= 6) return fromEdge >= 2 || width === 2 ? "cap" : "edge";
  return fromEdge < 2 ? "edge" : null;
}

function plazaGlow(seed: number, bright: boolean): string[] {
  return floorDiamond({ lit: "5", shade: "2", dark: "1" }, (x, r) => {
    const ring = plazaRingAt(x, r);
    if (ring === "cap") return bright ? "h" : "g";
    if (ring === "edge") return bright ? "g" : "i";
    const n = hash2(x * 5 + seed * 61, r * 3 + seed) % 23;
    if (n === 0) return "3";
    if (n === 1) return "5";
    return "4";
  });
}

const plazaGlowVariants = [1, 2].map((seed) => [
  plazaGlow(seed, true),
  plazaGlow(seed, false),
]);

/* --- Road (native 64×32): cracked asphalt with wobbly tar seams,
   fresh patches, litter, a storm-drain grate, and a faded amber lane
   dash whose period divides the per-tile shift so dashes continue
   across tile boundaries. Lower edges carry the tar joint line. --- */

const roadA = diamond([
  "22",
  "222222",
  "2232222222",
  "22212122242222",
  "222223222222221222",
  "2221122223222221342222",
  "22222222102222322222222222",
  "222222222222112222232222322222",
  "2222222222222221022222222222212222",
  "2222ooo2322224222221022222222222222222",
  "22232222ooo2252222223242112222222252222222",
  "222222222222ooo2222222221221122222222224222222",
  "22222222222222b2o222122222222211222222222223o21222",
  "2222222222321222212223432222222223111222222322222b2222",
  "2222222122222222221222122212222222222312102221222222222222",
  "22222122233222222212222322222222222222322224114222222222222222",
  "1122222222222122222222222222222mo42222223222112222222222222211",
  "112225222222222222222212222322ooo2222222233210223222222211",
  "112223222322222222222222222222ooo212222222222112222111",
  "112223222222222222222222322222ooo22222222122102211",
  "1121125212222222222222222222222222212222232211",
  "1122222122222232221222b2222212222222122211",
  "11122222222231122222222222222222b22211",
  "1122222222222222222221222223232211",
  "112222222222222222222322222211",
  "11233222322222222221222211",
  "1122222222222221222211",
  "113322232222122211",
  "11242322222211",
  "1121322211",
  "112311",
  "11",
]);

const roadB = diamond([
  "22",
  "221222",
  "2222222222",
  "22222222232222",
  "222322222232212122",
  "222222222221221121o222",
  "22222222322222321122222222",
  "222221222222222112221222222222",
  "22o2223222222221122222322222323222",
  "2212o2o2222122221022222222223222222222",
  "22212222ooo2322112222221222223222223222222",
  "2211222222122oo2102222122222222222222222b22222",
  "2222222223222b22o122222222422122222222222222222222",
  "222222222232122103222222222212222222122222222232222222",
  "2222222232222222112222222223222222242222222221222222222222",
  "2222o2222522222112222222222222232222221222b2322222222242222222",
  "1123222222223102222222232222222om22222222222222212322223222211",
  "113222221210222222222222222222ooo2222232222212222222212211",
  "112211222222222222321222222223ooo221222222222222222211",
  "111122122222323122222222222231ooo12232212222122211",
  "11o222223222123221211222212221o422222222222211",
  "11b222222222222211111222221232222123122111",
  "11222222221111111222222132222222222111",
  "1132222122111111221212222122222211",
  "112222211222222121122232222211",
  "11222221122221122222222211",
  "1122222112222222222211",
  "112222222322241211",
  "11212222222211",
  "1122222211",
  "112111",
  "11",
]);

const roadC = diamond([
  "22",
  "222222",
  "2232232222",
  "22222222222222",
  "222222222322232222",
  "2222222222221222222222",
  "22222222322232211222222222",
  "221223212222132222255552222322",
  "22o2222222222222222556700553322222",
  "2222ooo2222232322225566010176552222222",
  "222222222oo2232222255660000670000552122222",
  "222222222222ooo2211556600016600016600552222222",
  "2222422212222222o222214000066000066000167552222222",
  "222222222o22222222222222222000000660100660000222223322",
  "2222221122222221222322222222222006610006610002222222222222",
  "22222222221132222222132222422321222000166000022222222222222222",
  "11212224222112222223222122222222o22220000002222222221222222211",
  "1112222223221022222213222b2222ooo2212002222222222422222211",
  "112222222221122222132222222224ooo222222222222222242211",
  "112222222222112232222222223223omo22223221222222211",
  "112222222212112222222222222212o222223122223111",
  "112222222322112322222222222222222222222211",
  "11222222121211222222222232222122222211",
  "1112322322211222222222222222212211",
  "112222222222102222222222322111",
  "11223212221122232222222211",
  "1122222232221112222211",
  "112522322211222211",
  "11222222222211",
  "1122222211",
  "112211",
  "11",
]);

const roadD = diamond([
  "22",
  "222222",
  "2252222222",
  "22322122b42222",
  "222222222222222322",
  "2222211222222223222322",
  "2222251211b222232222121222",
  "222221122112121222222222222222",
  "22o2212111211122111222222222222222",
  "2223ooo2211221112111112321222222222222",
  "22213222ooo1111211122112222232222222222222",
  "222221222222ooo2222b21222222222221222322222122",
  "2222222222222222o212211112222222212222222222122322",
  "222321222122222222222324232222222222222222222222211222",
  "2212222322222222232222222222222222122312222232222211223222",
  "22222b10222222212122b32322222222222222223222222221022222222122",
  "11222211221224322222212122223222o22232222222232110222222222211",
  "112222112222212222222221222222o2o222242221211o222222212211",
  "1122221122122222222222222b5212ooo222222112222222224211",
  "112221112222222422222212222222oo222211b22222232311",
  "112222211222321222322222222222o122222222221211",
  "112222210222222212222232221122222222222211",
  "11222221122222222222121122223223222211",
  "11222221122221222221122b2234212211",
  "112232112222222102222223222211",
  "11223221122112222222222211",
  "1122221111222222222211",
  "1110222102222o2211",
  "11251222112211",
  "1122223211",
  "112211",
  "11",
]);

const roadE = diamond([
  "22",
  "222222",
  "2222222422",
  "22222222222222",
  "222222222212222222",
  "2222213222232222222222",
  "22252222222222223223222222",
  "222222222222222222223222222222",
  "22o2222222122222222222222322221122",
  "2223moo3222222223222231112221022222222",
  "22222222ooo3134222221222222222112222222222",
  "22b222222221omo2222222212522211422232222222222",
  "2222222212222222o222222222222112222212122221222222",
  "221422222222222322222222222221122222232222222222522222",
  "2222352222242222222213422222231122122232222232222232222222",
  "2222222o221222122221222222222112332322222223222222222222232322",
  "1122222232222222222122222211222oo22212222222222222222222222211",
  "112222222221222322222221122222mmo2222222222222222322222211",
  "112212122222222222210322222232oob222222123222222222111",
  "112222112222222102222232322222o2m12322222222222211",
  "112222222222114222232222322222o222222222222211",
  "1122322112222232222b2223222122222222122211",
  "11211222232212222222222222222222222211",
  "1122222222222222222221222222222211",
  "112212122322222322222232122211",
  "11222122222222222222122211",
  "1122222522222222322211",
  "112222222222221211",
  "11222212252211",
  "1122222211",
  "112211",
  "11",
]);
/* --- Water family (native 64×32): open canal water and the deep
   channel. Frames are synthesized deterministically from hash2-seeded
   placement data: static diagonal swells in the dark ramp step, ripple
   crests that drift and fade through a 4-frame spawn/travel/peak/decay
   cycle, and sparse neon cyan/magenta flecks — canal-side signage
   reflecting off the water — that blink through the same cycle. Frame
   timing stays data-driven via frameMs on the TILE_ART entry. --- */

export const WATER_FRAME_COUNT = 4;

/** Palette roles for one water look; every color is a palette char. */
interface WaterLook {
  /** Placement seed; different seeds give different variants. */
  seed: number;
  /** Resting surface color. */
  base: string;
  /** Darker undulation bands and the shaded lower edges. */
  swell: string;
  /** Ripple crest highlight and the lit upper-left edge. */
  crest: string;
  /** Brightest single pixel at a crest's peak frame. */
  sparkle: string;
  /** Neon reflection flecks: dim ember -> lit -> flash step. */
  flecks: readonly { dim: string; bright: string; flash: string }[];
  crestCount: number;
  fleckCount: number;
}

const CYAN_FLECK = { dim: "i", bright: "g", flash: "h" } as const;
const MAGENTA_FLECK = { dim: "l", bright: "j", flash: "k" } as const;

const OPEN_WATER: Omit<WaterLook, "seed"> = {
  base: "e",
  swell: "d",
  crest: "f",
  sparkle: "h",
  flecks: [CYAN_FLECK, MAGENTA_FLECK],
  crestCount: 12,
  fleckCount: 5,
};

const DEEP_WATER: Omit<WaterLook, "seed"> = {
  base: "d",
  swell: "0",
  crest: "e",
  sparkle: "f",
  flecks: [
    { dim: "i", bright: "i", flash: "g" },
    { dim: "l", bright: "l", flash: "j" },
  ],
  crestCount: 7,
  fleckCount: 3,
};

/** One 64×32 water frame; pure in (look, frame), safe to bake-cache. */
function waterFrame(look: WaterLook, frame: number): string[] {
  // Base surface with static diagonal swell bands in absolute columns,
  // so the bands sweep across the diamond instead of hugging its edges.
  // Per-row wobble bends the bands and edge dithering breaks them up,
  // keeping them from reading as hard mechanical stripes.
  const interior: string[][] = DIAMOND_WIDTHS.map((width, r) => {
    const pad = (64 - width) / 2;
    const wobble = (hash2(r, look.seed * 13 + 5) % 7) - 3;
    const row: string[] = [];
    for (let c = 0; c < width; c++) {
      const x = pad + c;
      const band = (x + r * 2 + wobble + look.seed * 3 + 270) % 27;
      const inBand =
        band < 4 && hash2(x, r * 5 + look.seed) % 4 < (band === 0 || band === 3 ? 2 : 3);
      row.push(inBand ? look.swell : look.base);
    }
    return row;
  });

  /** Paint one pixel at absolute column x if it lands inside the diamond. */
  const put = (x: number, r: number, ch: string): void => {
    const width = DIAMOND_WIDTHS[r];
    if (width === undefined) return;
    const pad = (64 - width) / 2;
    if (x < pad || x >= pad + width) return;
    const row = interior[r];
    if (row) row[x - pad] = ch;
  };

  // Ripple crests: each one loops spawn -> travel -> peak -> decay,
  // drifting 2px per frame so the surface reads as slowly moving.
  for (let k = 0; k < look.crestCount; k++) {
    const h = hash2(look.seed, k + 1);
    const r0 = 2 + (h % 28);
    const width = DIAMOND_WIDTHS[r0] ?? 2;
    const x0 = (64 - width) / 2 + ((h >>> 8) % width);
    const age = (frame + (h >>> 16)) % WATER_FRAME_COUNT;
    const length = [3, 6, 8, 4][age] ?? 3;
    const x = x0 + age * 2;
    for (let i = 0; i < length; i++) put(x + i, r0, look.crest);
    if (age === 2) put(x + (length >> 1), r0, look.sparkle);
  }

  // Neon signage flecks: dark beat -> lit -> flash with a short
  // vertical smear (the reflection stretching) -> dim ember.
  for (let k = 0; k < look.fleckCount; k++) {
    const h = hash2(look.seed * 31 + 7, k + 1);
    const fleck = look.flecks[k % look.flecks.length];
    if (!fleck) continue;
    const r0 = 3 + (h % 26);
    const width = DIAMOND_WIDTHS[r0] ?? 2;
    const x0 = (64 - width) / 2 + 1 + ((h >>> 7) % Math.max(1, width - 2));
    const age = (frame + (h >>> 15)) % WATER_FRAME_COUNT;
    if (age === 0) continue;
    if (age === 2) {
      put(x0, r0, fleck.flash);
      put(x0, r0 + 1, fleck.bright);
    } else {
      put(x0, r0, age === 1 ? fleck.bright : fleck.dim);
    }
  }

  // Edge light: lit upper-left rim, shaded lower rim (top-left source).
  interior.forEach((row, r) => {
    if (row.length === 0) return;
    if (r < 16) {
      row[0] = look.crest;
    } else {
      row[0] = look.swell;
      row[row.length - 1] = look.swell;
    }
  });

  return diamond(interior.map((row) => row.join("")));
}

/** Full frame loop for one water variant. */
function waterFrames(look: Omit<WaterLook, "seed">, seed: number): string[][] {
  return Array.from({ length: WATER_FRAME_COUNT }, (_, frame) =>
    waterFrame({ ...look, seed }, frame),
  );
}

const canalVariants = [1, 2, 3].map((seed) => waterFrames(OPEN_WATER, seed));
const canalDeepVariants = [4, 5, 6].map((seed) => waterFrames(DEEP_WATER, seed));

/* --- Quay edges: pavement tiles whose water-facing diamond edge grows
   a concrete lip with wet-dark staining, so shorelines read as a built
   boundary instead of two unrelated tiles butted together. Upper edges
   (n/w) show only the lit cap rim; lower edges (e/s) also show the
   shaded stone face dropping to a dark waterline. Inside the lip, a
   hash-dithered stain band feathers into the dry pavement. --- */

type QuayEdge = "n" | "e" | "s" | "w";

/** Lip color profile per edge, outermost pixel first. */
const QUAY_LIPS: Readonly<Record<QuayEdge, readonly string[]>> = {
  n: ["S", "R", "Q"],
  w: ["S", "S", "R"],
  e: ["1", "Q", "Q", "S"],
  s: ["1", "Q", "Q", "S"],
};

const QUAY_EDGE_SEEDS: Readonly<Record<QuayEdge, number>> = {
  n: 11,
  e: 23,
  s: 37,
  w: 53,
};

/** How far the wet stain dithers inland past the lip, in pixels. */
const QUAY_STAIN_DEPTH = 3;

/**
 * Overlay a quay lip on a native pavement grid along one diamond edge.
 * Pure: same base and edge always yield the same grid.
 */
export function quayGrid(base: PixelGrid, edge: QuayEdge): string[] {
  const upperEdge = edge === "n" || edge === "w";
  const leftSide = edge === "w" || edge === "s";
  const lip = QUAY_LIPS[edge];
  return base.map((row, r) => {
    if ((r < 16) !== upperEdge) return String(row);
    const width = DIAMOND_WIDTHS[r] ?? 0;
    const pad = (64 - width) / 2;
    const cells = [...row];
    const depth = Math.min(width, lip.length + QUAY_STAIN_DEPTH);
    for (let i = 0; i < depth; i++) {
      const x = leftSide ? pad + i : pad + width - 1 - i;
      const ch = lip[i];
      if (ch !== undefined) {
        cells[x] = ch;
      } else {
        // Wet staining: mostly damp concrete, some darker pooling, and
        // untouched pixels so the band feathers out irregularly.
        const v = hash2(x, r * 8 + QUAY_EDGE_SEEDS[edge]) % 10;
        if (v < 5) cells[x] = "Q";
        else if (v < 8) cells[x] = "3";
      }
    }
    return cells.join("");
  });
}

const quayVariants = (edge: QuayEdge): PixelGrid[][] =>
  [pavementA, pavementB, pavementC].map((base) => [quayGrid(base, edge)]);

/* --- Foundation (native 64×32): near-black structural fill with faint
   charcoal mottling and rare void pits. --- */

function foundationFill(seed: number): string[] {
  return floorDiamond({ lit: "2", shade: "1", dark: "0" }, (x, r) => {
    const n = hash2(x + seed * 31, r * 7 + seed) % 23;
    if (n === 0) return "2";
    if (n === 1) return "0";
    return "1";
  });
}

/* --- Rust floor (native 64×32): corroded industrial deck plates on the
   diagonal lattice — ink seams between long plates, 2px bolts at the
   seam corners, per-plate tone shifts, and seeded corrosion blotches.
   Plate geometry is seed-independent so seams run across tiles. --- */

function rustPlateFloor(seed: number): string[] {
  return floorDiamond({ lit: "c", shade: "a", dark: "1" }, (x, r) => {
    const { a, b } = isoCoords(x, r);
    if (a % 64 < 2 || b % 32 < 2) return "1";
    if (a % 64 < 5 && b % 32 < 5) return "5";
    const blob = hash2(Math.floor((x + seed * 5) / 3), Math.floor(r / 2) * 9 + seed) % 11;
    if (blob === 0) return "a";
    const n = hash2(x * 7 + seed * 13, r * 11 + seed) % 17;
    if (n === 0) return "a";
    if (n === 1) return "c";
    const plate = hash2(Math.floor(a / 64) * 3 + 1, Math.floor(b / 32) * 7 + 2) % 5;
    return plate === 0 ? "c" : "b";
  });
}

/* --- Interior floors (native 64×32): the three room materials, each
   with 3 seeded variants. Seam geometry (plank runs, grout, strip
   joints) is seed-independent on the diagonal lattice so floors read
   as one continuous surface; seeds only vary wear and speckle. --- */

/** Worn barroom planks: warm wood runs along the down-right diagonal,
    ink seams between planks, staggered butt joints, per-segment tone
    shifts, and seeded scuffs/chips. */
function barPlankFloor(seed: number): string[] {
  return floorDiamond({ lit: "c", shade: "a", dark: "1" }, (x, r) => {
    const { a, b } = isoCoords(x, r);
    if (b % 8 === 0) return "1";
    const plank = Math.floor(b / 8);
    const jointShift = hash2(plank, 71) % 24;
    if ((a + jointShift) % 24 < 2) return "1";
    const wear = hash2(x * 2 + seed * 101, r * 3 + seed) % 29;
    if (wear === 0) return "a";
    if (wear === 1) return "c";
    const segment = Math.floor((a + jointShift) / 24);
    const tone = hash2(plank * 37, segment) % 8;
    if (tone === 0) return "a";
    if (tone <= 2) return "c";
    return "b";
  });
}

/** Clinical tile: a pale checker of quarter-tile diamonds with thin
    grout lines, polish glints on the lit half, and seeded scuffs. */
function clinicTileFloor(seed: number): string[] {
  // Lit rim stays at the pale base: a "9" rim reads as harsh white
  // streaks across a continuous clinical floor; grout defines the tiles.
  return floorDiamond({ lit: "8", shade: "6", dark: "5" }, (x, r) => {
    const { a, b } = isoCoords(x, r);
    if (a % 16 < 2 || b % 16 < 2) return "6";
    const scuff = hash2(Math.floor(x / 2) + seed * 3, r * 7 + seed) % 41;
    if (scuff === 0) return "Q";
    const n = hash2(x * 2 + seed * 7, r + seed * 11) % 37;
    if (n === 0) return "6";
    if (n === 1 && r < 16) return "9";
    return (Math.floor(a / 16) + Math.floor(b / 16)) % 2 === 0 ? "8" : "7";
  });
}

/** Corporate carpet: violet-cast pile noise over broad woven strips,
    with rare amber lint flecks; far softer contrast than the slabs. */
function officeCarpetFloor(seed: number): string[] {
  return floorDiamond({ lit: "X", shade: "V", dark: "V" }, (x, r) => {
    const { a, b } = isoCoords(x, r);
    if (a % 32 < 1) return "V";
    if (hash2(x + seed, r * 11 + b) % 149 === 7) return "o";
    const n = hash2(x * 3 + seed * 131, r * 5 + seed) % 24;
    if (n === 0) return "V";
    if (n === 1) return "X";
    // Soft pile mottling in small patches, biased by the woven strip,
    // so the carpet reads as fabric rather than per-pixel static.
    const strip = Math.floor(a / 32) % 2;
    const patch =
      hash2(Math.floor(x / 4) + seed * 17, Math.floor(r / 2) * 5 + seed) % 8;
    if (patch === 0) return strip === 0 ? "V" : "X";
    return "W";
  });
}

/* --- Baseboard trims: interior floor tiles whose wall-facing diamond
   edge carries a dark baseboard-shadow row — an ink line under the
   wall base feathering into the material's shade — so floor-to-wall
   and doorway transitions read as a built junction instead of an
   abrupt color change. Registered per tile id ("<floor>-<edge>"), so
   maps opt in tile-by-tile and the renderer stays generic. --- */

const TRIM_EDGE_SEEDS: Readonly<Record<TrimEdge, number>> = {
  n: 3,
  e: 17,
  s: 29,
  w: 41,
};

/** Ink depth of the baseboard shadow line, in edge cells. */
const TRIM_INK_DEPTH = 2;
/** How far the shadow dithers into the floor past the ink line. */
const TRIM_SHADE_DEPTH = 3;

/**
 * Overlay a baseboard shadow on a native floor grid along one diamond
 * edge. Pure: same base, edge, and shade always yield the same grid.
 */
export function baseboardGrid(
  base: PixelGrid,
  edge: TrimEdge,
  shade: string,
): string[] {
  const upperEdge = edge === "n" || edge === "w";
  const leftSide = edge === "w" || edge === "s";
  return base.map((row, r) => {
    if ((r < 16) !== upperEdge) return String(row);
    const width = DIAMOND_WIDTHS[r] ?? 0;
    const pad = (64 - width) / 2;
    const cells = [...row];
    const depth = Math.min(width, TRIM_INK_DEPTH + TRIM_SHADE_DEPTH);
    for (let i = 0; i < depth; i++) {
      const x = leftSide ? pad + i : pad + width - 1 - i;
      if (i < TRIM_INK_DEPTH) {
        cells[x] = "1";
      } else if (hash2(x, r * 6 + TRIM_EDGE_SEEDS[edge]) % 8 < 5) {
        cells[x] = shade;
      }
    }
    return cells.join("");
  });
}

/** Variant grids plus the shade its baseboard trim feathers into. */
interface InteriorFloorSet {
  variants: readonly PixelGrid[];
  trimShade: string;
}

const INTERIOR_FLOOR_SEEDS = [1, 2, 3];

const INTERIOR_FLOORS: Readonly<Record<InteriorFloorId, InteriorFloorSet>> = {
  "bar-floor": {
    variants: INTERIOR_FLOOR_SEEDS.map(barPlankFloor),
    trimShade: "a",
  },
  "clinic-floor": {
    variants: INTERIOR_FLOOR_SEEDS.map(clinicTileFloor),
    trimShade: "6",
  },
  "office-floor": {
    variants: INTERIOR_FLOOR_SEEDS.map(officeCarpetFloor),
    trimShade: "V",
  },
};

/** TILE_ART entries for the interior floors and their per-edge trims. */
const INTERIOR_TILE_ART = Object.fromEntries(
  INTERIOR_FLOOR_IDS.flatMap((id) => {
    const { variants, trimShade } = INTERIOR_FLOORS[id];
    const still = (grids: readonly PixelGrid[]): TileArt => ({
      variants: grids.map((grid) => [grid]),
      frameMs: 0,
    });
    return [
      [id, still(variants)],
      ...TRIM_EDGES.map((edge) => [
        `${id}-${edge}`,
        still(variants.map((grid) => baseboardGrid(grid, edge, trimShade))),
      ]),
    ];
  }),
) as Record<InteriorFloorId | InteriorTrimId, TileArt>;

export const TILE_ART: Readonly<Record<TileId, TileArt>> = {
  pavement: { variants: [[pavementA], [pavementB], [pavementC]], frameMs: 0 },
  "pavement-cracked": {
    variants: [[crackedA], [crackedB], [crackedC]],
    frameMs: 0,
  },
  "plaza-glow": {
    variants: plazaGlowVariants,
    frameMs: 900,
    // The inset neon ring lifts the plaza floor a touch.
    glow: [{ color: "g", radius: 20, intensity: 0.14, offsetX: 0, offsetY: 0 }],
  },
  road: {
    variants: [[roadA], [roadB], [roadC], [roadD], [roadE]],
    frameMs: 0,
  },
  canal: { variants: canalVariants, frameMs: 420, reflective: true },
  "canal-deep": { variants: canalDeepVariants, frameMs: 560, reflective: true },
  "quay-n": { variants: quayVariants("n"), frameMs: 0 },
  "quay-e": { variants: quayVariants("e"), frameMs: 0 },
  "quay-s": { variants: quayVariants("s"), frameMs: 0 },
  "quay-w": { variants: quayVariants("w"), frameMs: 0 },
  foundation: {
    variants: [foundationFill(1), foundationFill(2)].map((grid) => [grid]),
    frameMs: 0,
  },
  "rust-floor": {
    variants: [1, 2, 3].map((seed) => [rustPlateFloor(seed)]),
    frameMs: 0,
  },
  ...INTERIOR_TILE_ART,
};
