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
  "54",
  "533334",
  "5333433334",
  "53333332333334",
  "533334333333332334",
  "5333333332333333433334",
  "53334333333333333332333334",
  "533333333332333333343333333334",
  "233334333333333333333333332331",
  "23333333333334333333332331",
  "2333233333333333333331",
  "233333334333332331",
  "23333333334331",
  "2332333331",
  "233331",
  "21",
]);

const pavementB = diamond([
  "54",
  "533234",
  "5333323334",
  "53332333333334",
  "533322333333343334",
  "5333332233333333333334",
  "53333333223333333334333334",
  "533333333332233333333333333334",
  "233333333333322333333333433331",
  "23334333333333223333333331",
  "2333333333333322333331",
  "233333333333332231",
  "23343333333331",
  "2333333231",
  "233331",
  "21",
]);

const pavementC = diamond([
  "54",
  "533434",
  "5334333334",
  "53443333333334",
  "533333333333443334",
  "5333333323333334433334",
  "53333333333333333333344334",
  "533233333333333433333333333334",
  "233333333343333333333333333331",
  "23333333333333333343332331",
  "2333333433333333333331",
  "232333333333433331",
  "23333333333331",
  "2333343331",
  "233331",
  "21",
]);

/* --- Cracked pavement: the same slabs with deep fissures. --- */

const crackedA = diamond([
  "54",
  "533334",
  "5333133334",
  "53333313333334",
  "533333311333333334",
  "5333333331133333333334",
  "53333333333113333333433334",
  "533343333333311333333333333334",
  "233333333333331133333333333331",
  "23333333333333113333333331",
  "2333333333333311333331",
  "233323333333331131",
  "23333333333311",
  "2333333331",
  "233131",
  "21",
]);

const crackedB = diamond([
  "54",
  "533334",
  "5333333334",
  "53311333333334",
  "533331133333233334",
  "5333333111133333333334",
  "53333333333113333333333334",
  "533333333333311113334333333334",
  "233334333333333311133333333331",
  "23333333333333333113333331",
  "2333233333333333311331",
  "233333333333333111",
  "23333343333331",
  "2333333331",
  "233331",
  "21",
]);

const crackedC = diamond([
  "54",
  "531134",
  "5331333334",
  "53313333333334",
  "533313333334333334",
  "5333313333333333332334",
  "53333311333333333333333334",
  "533333331133333333333343333334",
  "233333333311333333333333333331",
  "23332333333131333333333331",
  "2333333333331133333331",
  "233333333333313331",
  "23333333333131",
  "2334333131",
  "233331",
  "21",
]);

/* --- Plaza glow: lighter slabs with an inset neon ring (2-frame pulse). --- */

const plazaBright = diamond([
  "54",
  "544444",
  "544ghhg444",
  "544gg4444gg444",
  "544gg44444444gg444",
  "544gg444444444444gg444",
  "544gg4444444444444444gg444",
  "544gg44444444444444444444gg444",
  "244gg44444444444444444444gg441",
  "244gg4444444444444444gg441",
  "244gg444444444444gg441",
  "244gg44444444gg441",
  "244gg4444gg441",
  "244ghhg441",
  "244441",
  "21",
]);

const plazaDim = diamond([
  "54",
  "544444",
  "544iggi444",
  "544ii4444ii444",
  "544ii44444444ii444",
  "544ii444444444444ii444",
  "544ii4444444444444444ii444",
  "544ii44444444444444444444ii444",
  "244ii44444444444444444444ii441",
  "244ii4444444444444444ii441",
  "244ii444444444444ii441",
  "244ii44444444ii441",
  "244ii4444ii441",
  "244iggi441",
  "244441",
  "21",
]);

/* --- Road: dark asphalt, lit curb on the upper edges, amber dashes. --- */

const roadA = diamond([
  "65",
  "622225",
  "6222221225",
  "62222222222225",
  "622222122222222225",
  "6222222222222221222225",
  "62222222222222222222222225",
  "6222ommo22222222ommo2222222225",
  "12222ommo22222222ommo222222220",
  "12222222222122222222222220",
  "1222222222222222222220",
  "122221222222222220",
  "12222222222220",
  "1222221220",
  "122220",
  "10",
]);

const roadB = diamond([
  "65",
  "622225",
  "6222222225",
  "62221222222225",
  "622222222222122225",
  "6222212222222222222225",
  "62222222222221222222222225",
  "62222222ommo22222222ommo222225",
  "122222222ommo22222222ommo22220",
  "12212222222222222222222220",
  "1222222222212222222220",
  "122222222222221220",
  "12221222222220",
  "1222222220",
  "122120",
  "10",
]);

/* --- Canal: glowing water, 3-frame ripple loop. --- */

const canalFrame0 = diamond([
  "fe",
  "feeeee",
  "feeffeeeee",
  "feeeeeeddeeeee",
  "feeeegfeeeeeeeeeee",
  "feeeeeeeeeeffeeeeddeee",
  "feeddeeeeeeeeeeeeeeeeffeee",
  "feeeeeeeeffeeeeeeeeeeeeeeeeeee",
  "deeeeeeeeeeeeeeeegfeeeeeeeeeed",
  "deeeeffeeeeeeeeeeeeeeeeeed",
  "deeeeeeeeeeddeeeeeeeed",
  "deeeeeeeeeeeeffeed",
  "deeffeeeeeeeed",
  "deeeeeeeed",
  "deeeed",
  "dd",
]);

const canalFrame1 = diamond([
  "fe",
  "fefeee",
  "feeeeffeee",
  "feeddeeeeeeeee",
  "feeeeeegfeeeeeeeee",
  "feeeeeeeeeeeeffddeeeee",
  "feeeeddeeeeeeeeeeeeffeeeee",
  "feeeeeeeeeeffeeeeeeeeeeeegfeee",
  "deeeeeegfeeeeeeeeeeeeeeeeeeeed",
  "deeeeeeeeeeeeeeffeeeeeeeed",
  "deeddeeeeeeeeeeeeffeed",
  "deeeeeeffeeeeeeeed",
  "deeeeeeeeddeed",
  "deeffeeeed",
  "deeeed",
  "dd",
]);

const canalFrame2 = diamond([
  "fe",
  "feeeee",
  "feffeeeeee",
  "feeeeffeeeeeee",
  "feeddeeeeeeeegfeee",
  "feeeeeeeegfeeeeeeeeeee",
  "feeeeeeeeeeeeeeeeffeeeeeee",
  "feeeeddeeeeeeeeeeeeeeeeeeeeeee",
  "deeffeeeeeeeeeeeeeeeeeegfeeeed",
  "deeeeeeeeeeffeeeeeeeeeeeed",
  "deeeeeeeeeeeeeeddeeeed",
  "deeffeeeeeeeeeeeed",
  "deeeeeeeeeeffd",
  "deeeeeeeed",
  "deeffd",
  "dd",
]);

/* --- Foundation: near-black structural fill. --- */

const foundationA = diamond([
  "21",
  "211111",
  "2111121111",
  "21111111111111",
  "211112111111111111",
  "2111111111111211111111",
  "21111111111111111111111111",
  "211111111211111111111111111111",
  "111111111111111111121111111110",
  "11111111111111111111111110",
  "1112111111111111111110",
  "111111111112111110",
  "11111111111110",
  "1111111110",
  "111110",
  "10",
]);

const foundationB = diamond([
  "21",
  "211111",
  "2111111111",
  "21121111111211",
  "211111111111111111",
  "2111111112111111111111",
  "21111111111111111111211111",
  "211111111111111121111111111111",
  "111121111111111111111111111110",
  "11111111111211111111111110",
  "1111111111111111121110",
  "111211111111111110",
  "11111112111110",
  "1111111110",
  "111110",
  "10",
]);

/* --- Rust floor: corroded plates with seams and bolts. --- */

const rustA = diamond([
  "cb",
  "cbbbbb",
  "cbbbabbbbb",
  "cbbbbbbbbbbcbb",
  "cbbbbabbbbbbbbbbbb",
  "cbbbbbbbbbbcbbbbbabbbb",
  "cbb5bbbbbbbbbbbbbbbbbbbbbb",
  "cbbbbbbbbabbbbbbbbbbcbbbbbbbbb",
  "abbbbbbbbbbbbbbbabbbbbbbbb5bba",
  "abbbbcbbbbbbbbbbbbbabbbbba",
  "abbbbbbbbabbbbbbbbbbba",
  "abb5bbbbbbbbbbcbba",
  "abbbbbbabbbbba",
  "abbbbbbbba",
  "abbbba",
  "aa",
]);

const rustB = diamond([
  "cb",
  "cbabbb",
  "cbbbbbbabb",
  "cbbbbaabbbbbbb",
  "cbbcbbbbaabbbbbbbb",
  "cbbbbbbbbbaabbbbbb5bbb",
  "cbbbbbbbbbbbaabbbbbbbbbbbb",
  "cbbbbb5bbbbbbbaabbbbbbbbcbbbbb",
  "abbbbbbbbbbbbbbbaabbbbbbbbbbba",
  "abbbbbbcbbbbbbbbbaabbbbbba",
  "abbabbbbbbbbbbbbbbaaba",
  "abbbbbbbb5bbbbbbba",
  "abbbbbbbbbbbba",
  "abbcbbbbba",
  "abbbba",
  "aa",
]);

const rustC = diamond([
  "cb",
  "cbbbbb",
  "cbbbbbbbbb",
  "cbbbbbbb5bbbbb",
  "cbbbbbbbbbbbbbabbb",
  "cbabbbbbbbbbbbbbbbbbbb",
  "cbbbbbbcbbbbbbbbbbbbabbbbb",
  "cbbbbbbbbbbbbbbb5bbbbbbbbbbbbb",
  "abbbabbbbbbbbbbbbbbbbcbbbbbbba",
  "abbbbbbbbbbabbbbbbbbbbbbba",
  "abbbbbb5bbbbbbbbbabbba",
  "abbbbbbbbbbbbcbbba",
  "abbabbbbbbbbba",
  "abbbbbbbba",
  "abbbba",
  "aa",
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
