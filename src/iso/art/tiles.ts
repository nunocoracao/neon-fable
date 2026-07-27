/**
 * Ground tile pixel art. Every tile is a 32×16 (1x) diamond authored as
 * interior rows (see diamond()); walkable tiles get 2-3 texture variants
 * picked deterministically from tile coordinates, and water/glow tiles
 * animate through short frame loops. Light falls from the upper left:
 * upper edges are lit, lower edges shaded.
 */
import type { TileId } from "../tilemap";
import { diamond, type PixelGrid } from "./pixel";

export interface TileArt {
  /** variants[v] is a frame loop; static tiles have a single frame. */
  variants: readonly PixelGrid[][];
  /** Per-frame duration for animated tiles (0 when static). */
  frameMs: number;
}

/* --- Pavement: worn slabs with speckle, grime, and chips. --- */

const pavementA = diamond([
  "5544",
  "55333344",
  "553334333344",
  "5533333323333344",
  "55333343333333323344",
  "553333333323333334333344",
  "5533343333333333333323333344",
  "55333333333323333333433333333344",
  "22333343333333333333333333323311",
  "2233333333333343333333323311",
  "223332333333333333333311",
  "22333333343333323311",
  "2233333333343311",
  "223323333311",
  "22333311",
  "2211",
]);

const pavementB = diamond([
  "5544",
  "55332344",
  "553333233344",
  "5533323333333344",
  "55333223333333433344",
  "553333322333333333333344",
  "5533333332233333333343333344",
  "55333333333322333333333333333344",
  "22333333333333223333333334333311",
  "2233343333333332233333333311",
  "223333333333333223333311",
  "22333333333333322311",
  "2233433333333311",
  "223333332311",
  "22333311",
  "2211",
]);

const pavementC = diamond([
  "5544",
  "55334344",
  "553343333344",
  "5534433333333344",
  "55333333333334433344",
  "553333333233333344333344",
  "5533333333333333333333443344",
  "55332333333333334333333333333344",
  "22333333333433333333333333333311",
  "2233333333333333333433323311",
  "223333334333333333333311",
  "22323333333334333311",
  "2233333333333311",
  "223333433311",
  "22333311",
  "2211",
]);

/* --- Cracked pavement: the same slabs with deep fissures. --- */

const crackedA = diamond([
  "5544",
  "55333344",
  "553331333344",
  "5533333133333344",
  "55333333113333333344",
  "553333333311333333333344",
  "5533333333331133333334333344",
  "55333433333333113333333333333344",
  "22333333333333311333333333333311",
  "2233333333333331133333333311",
  "223333333333333113333311",
  "22333233333333311311",
  "2233333333333111",
  "223333333311",
  "22331311",
  "2211",
]);

const crackedB = diamond([
  "5544",
  "55333344",
  "553333333344",
  "5533113333333344",
  "55333311333332333344",
  "553333331111333333333344",
  "5533333333331133333333333344",
  "55333333333333111133343333333344",
  "22333343333333333111333333333311",
  "2233333333333333331133333311",
  "223332333333333333113311",
  "22333333333333331111",
  "2233333433333311",
  "223333333311",
  "22333311",
  "2211",
]);

const crackedC = diamond([
  "5544",
  "55311344",
  "553313333344",
  "5533133333333344",
  "55333133333343333344",
  "553333133333333333323344",
  "5533333113333333333333333344",
  "55333333311333333333333433333344",
  "22333333333113333333333333333311",
  "2233323333331313333333333311",
  "223333333333311333333311",
  "22333333333333133311",
  "2233333333331311",
  "223343331311",
  "22333311",
  "2211",
]);

/* --- Plaza glow: lighter slabs with an inset neon ring (2-frame pulse). --- */

const plazaBright = diamond([
  "5544",
  "55444444",
  "5544ghhg4444",
  "5544gg4444gg4444",
  "5544gg44444444gg4444",
  "5544gg444444444444gg4444",
  "5544gg4444444444444444gg4444",
  "5544gg44444444444444444444gg4444",
  "2244gg44444444444444444444gg4411",
  "2244gg4444444444444444gg4411",
  "2244gg444444444444gg4411",
  "2244gg44444444gg4411",
  "2244gg4444gg4411",
  "2244ghhg4411",
  "22444411",
  "2211",
]);

const plazaDim = diamond([
  "5544",
  "55444444",
  "5544iggi4444",
  "5544ii4444ii4444",
  "5544ii44444444ii4444",
  "5544ii444444444444ii4444",
  "5544ii4444444444444444ii4444",
  "5544ii44444444444444444444ii4444",
  "2244ii44444444444444444444ii4411",
  "2244ii4444444444444444ii4411",
  "2244ii444444444444ii4411",
  "2244ii44444444ii4411",
  "2244ii4444ii4411",
  "2244iggi4411",
  "22444411",
  "2211",
]);

/* --- Road: dark asphalt, lit curb on the upper edges, amber dashes. --- */

const roadA = diamond([
  "6655",
  "66222255",
  "662222212255",
  "6622222222222255",
  "66222221222222222255",
  "662222222222222212222255",
  "6622222222222222222222222255",
  "66222ommo22222222ommo22222222255",
  "112222ommo22222222ommo2222222200",
  "1122222222221222222222222200",
  "112222222222222222222200",
  "11222212222222222200",
  "1122222222222200",
  "112222212200",
  "11222200",
  "1100",
]);

const roadB = diamond([
  "6655",
  "66222255",
  "662222222255",
  "6622212222222255",
  "66222222222221222255",
  "662222122222222222222255",
  "6622222222222212222222222255",
  "662222222ommo22222222ommo2222255",
  "1122222222ommo22222222ommo222200",
  "1122122222222222222222222200",
  "112222222222122222222200",
  "11222222222222212200",
  "1122212222222200",
  "112222222200",
  "11221200",
  "1100",
]);

/* --- Canal: glowing water, 3-frame ripple loop. --- */

const canalFrame0 = diamond([
  "ffee",
  "ffeeeeee",
  "ffeeffeeeeee",
  "ffeeeeeeddeeeeee",
  "ffeeeegfeeeeeeeeeeee",
  "ffeeeeeeeeeeffeeeeddeeee",
  "ffeeddeeeeeeeeeeeeeeeeffeeee",
  "ffeeeeeeeeffeeeeeeeeeeeeeeeeeeee",
  "ddeeeeeeeeeeeeeeeegfeeeeeeeeeedd",
  "ddeeeeffeeeeeeeeeeeeeeeeeedd",
  "ddeeeeeeeeeeddeeeeeeeedd",
  "ddeeeeeeeeeeeeffeedd",
  "ddeeffeeeeeeeedd",
  "ddeeeeeeeedd",
  "ddeeeedd",
  "dddd",
]);

const canalFrame1 = diamond([
  "ffee",
  "ffefeeee",
  "ffeeeeffeeee",
  "ffeeddeeeeeeeeee",
  "ffeeeeeegfeeeeeeeeee",
  "ffeeeeeeeeeeeeffddeeeeee",
  "ffeeeeddeeeeeeeeeeeeffeeeeee",
  "ffeeeeeeeeeeffeeeeeeeeeeeegfeeee",
  "ddeeeeeegfeeeeeeeeeeeeeeeeeeeedd",
  "ddeeeeeeeeeeeeeeffeeeeeeeedd",
  "ddeeddeeeeeeeeeeeeffeedd",
  "ddeeeeeeffeeeeeeeedd",
  "ddeeeeeeeeddeedd",
  "ddeeffeeeedd",
  "ddeeeedd",
  "dddd",
]);

const canalFrame2 = diamond([
  "ffee",
  "ffeeeeee",
  "ffeffeeeeeee",
  "ffeeeeffeeeeeeee",
  "ffeeddeeeeeeeegfeeee",
  "ffeeeeeeeegfeeeeeeeeeeee",
  "ffeeeeeeeeeeeeeeeeffeeeeeeee",
  "ffeeeeddeeeeeeeeeeeeeeeeeeeeeeee",
  "ddeeffeeeeeeeeeeeeeeeeeegfeeeedd",
  "ddeeeeeeeeeeffeeeeeeeeeeeedd",
  "ddeeeeeeeeeeeeeeddeeeedd",
  "ddeeffeeeeeeeeeeeedd",
  "ddeeeeeeeeeeffdd",
  "ddeeeeeeeedd",
  "ddeeffdd",
  "dddd",
]);

/* --- Foundation: near-black structural fill. --- */

const foundationA = diamond([
  "2211",
  "22111111",
  "221111211111",
  "2211111111111111",
  "22111121111111111111",
  "221111111111112111111111",
  "2211111111111111111111111111",
  "22111111112111111111111111111111",
  "11111111111111111111211111111100",
  "1111111111111111111111111100",
  "111121111111111111111100",
  "11111111111121111100",
  "1111111111111100",
  "111111111100",
  "11111100",
  "1100",
]);

const foundationB = diamond([
  "2211",
  "22111111",
  "221111111111",
  "2211211111112111",
  "22111111111111111111",
  "221111111121111111111111",
  "2211111111111111111112111111",
  "22111111111111111211111111111111",
  "11111211111111111111111111111100",
  "1111111111112111111111111100",
  "111111111111111111211100",
  "11112111111111111100",
  "1111111121111100",
  "111111111100",
  "11111100",
  "1100",
]);

/* --- Rust floor: corroded plates with seams and bolts. --- */

const rustA = diamond([
  "ccbb",
  "ccbbbbbb",
  "ccbbbabbbbbb",
  "ccbbbbbbbbbbcbbb",
  "ccbbbbabbbbbbbbbbbbb",
  "ccbbbbbbbbbbcbbbbbabbbbb",
  "ccbb5bbbbbbbbbbbbbbbbbbbbbbb",
  "ccbbbbbbbbabbbbbbbbbbcbbbbbbbbbb",
  "aabbbbbbbbbbbbbbbabbbbbbbbb5bbaa",
  "aabbbbcbbbbbbbbbbbbbabbbbbaa",
  "aabbbbbbbbabbbbbbbbbbbaa",
  "aabb5bbbbbbbbbbcbbaa",
  "aabbbbbbabbbbbaa",
  "aabbbbbbbbaa",
  "aabbbbaa",
  "aaaa",
]);

const rustB = diamond([
  "ccbb",
  "ccbabbbb",
  "ccbbbbbbabbb",
  "ccbbbbaabbbbbbbb",
  "ccbbcbbbbaabbbbbbbbb",
  "ccbbbbbbbbbaabbbbbb5bbbb",
  "ccbbbbbbbbbbbaabbbbbbbbbbbbb",
  "ccbbbbb5bbbbbbbaabbbbbbbbcbbbbbb",
  "aabbbbbbbbbbbbbbbaabbbbbbbbbbbaa",
  "aabbbbbbcbbbbbbbbbaabbbbbbaa",
  "aabbabbbbbbbbbbbbbbaabaa",
  "aabbbbbbbb5bbbbbbbaa",
  "aabbbbbbbbbbbbaa",
  "aabbcbbbbbaa",
  "aabbbbaa",
  "aaaa",
]);

const rustC = diamond([
  "ccbb",
  "ccbbbbbb",
  "ccbbbbbbbbbb",
  "ccbbbbbbb5bbbbbb",
  "ccbbbbbbbbbbbbbabbbb",
  "ccbabbbbbbbbbbbbbbbbbbbb",
  "ccbbbbbbcbbbbbbbbbbbbabbbbbb",
  "ccbbbbbbbbbbbbbbb5bbbbbbbbbbbbbb",
  "aabbbabbbbbbbbbbbbbbbbcbbbbbbbaa",
  "aabbbbbbbbbbabbbbbbbbbbbbbaa",
  "aabbbbbb5bbbbbbbbbabbbaa",
  "aabbbbbbbbbbbbcbbbaa",
  "aabbabbbbbbbbbaa",
  "aabbbbbbbbaa",
  "aabbbbaa",
  "aaaa",
]);

export const TILE_ART: Readonly<Record<TileId, TileArt>> = {
  pavement: { variants: [[pavementA], [pavementB], [pavementC]], frameMs: 0 },
  "pavement-cracked": {
    variants: [[crackedA], [crackedB], [crackedC]],
    frameMs: 0,
  },
  "plaza-glow": {
    variants: [[plazaBright, plazaDim]],
    frameMs: 900,
  },
  road: { variants: [[roadA], [roadB]], frameMs: 0 },
  canal: {
    variants: [[canalFrame0, canalFrame1, canalFrame2]],
    frameMs: 420,
  },
  foundation: { variants: [[foundationA], [foundationB]], frameMs: 0 },
  "rust-floor": { variants: [[rustA], [rustB], [rustC]], frameMs: 0 },
};
