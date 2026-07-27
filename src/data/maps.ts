/**
 * Isometric map content: the Cinder Row hub plaza and the Rustyard
 * combat arena. Maps are authored as character rows expanded through
 * buildMapGrid; interactables reference story node and encounter ids by
 * string only — the iso layer never resolves them.
 */
import { buildMapGrid, type IsoMap, type LegendEntry } from "../iso/tilemap";

/**
 * Cinder Row plaza — the hub. A neon-lit square between tenement
 * blocks: glow-tiled plaza center, a storm canal along the east wall
 * (fenced off where it meets the square), and the Filament bar door in
 * the north face.
 */
const hubLegend: Record<string, LegendEntry> = {
  "#": { tile: "foundation", prop: { propId: "building", blocks: true } },
  d: { tile: "foundation" },
  ".": { tile: "pavement" },
  ",": { tile: "pavement-cracked" },
  "=": { tile: "plaza-glow" },
  r: { tile: "road" },
  "~": { tile: "canal" },
  l: { tile: "pavement", prop: { propId: "streetlight", blocks: true } },
  b: { tile: "pavement", prop: { propId: "barrier", blocks: true } },
  v: { tile: "pavement", prop: { propId: "vent-stack", blocks: true } },
  h: { tile: "pavement", prop: { propId: "holo-sign", blocks: true } },
};

const hubRows = [
  "###d##########",
  "#....,....~~.#",
  "#.l.......~~.#",
  "#...====..~~.#",
  "#...====..bb.#",
  "#...====..,..#",
  "#.,.====....l#",
  "#...........,#",
  "#.l....v.....#",
  "#,...........#",
  "#rrrrrrrrrrrr#",
  "##############",
];

const hubGrid = buildMapGrid(hubLegend, hubRows);

const cinderPlaza: IsoMap = {
  id: "cinder-plaza",
  name: "Cinder Row Plaza",
  width: hubGrid.width,
  height: hubGrid.height,
  tiles: hubGrid.tiles,
  props: hubGrid.props,
  interactables: [
    {
      id: "filament-door",
      x: 3,
      y: 0,
      label: "The Filament",
      spriteId: "door",
      interaction: { kind: "dialogue", nodeId: "filament-door" },
    },
    {
      id: "market-vendor",
      x: 10,
      y: 7,
      label: "Wet-market vendor",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "wet-market" },
    },
    {
      id: "plaza-terminal",
      x: 5,
      y: 5,
      label: "Public terminal",
      spriteId: "terminal",
      interaction: { kind: "dialogue", nodeId: "start" },
    },
    {
      id: "rust-runner",
      x: 11,
      y: 5,
      label: "Rustyard runner",
      spriteId: "npc",
      interaction: { kind: "combat", encounterId: "enc-rustyard-ambush" },
    },
  ],
  spawns: [
    { id: "player-start", x: 6, y: 9 },
    { id: "south-road", x: 6, y: 10 },
  ],
};

/**
 * Combat arenas. Every tile of an arena is open floor: the combat engine
 * has no obstacle rules (movement is bounds + occupancy only), so arena
 * maps must not place blocking props or unwalkable tiles inside the grid
 * — otherwise the picture would disagree with what the engine allows.
 * Dimensions must match the owning encounter's grid; positions are tile
 * coordinates. Each arena keeps a "player-start" spawn mirroring the
 * encounter's playerStart so generic map tooling has a valid anchor.
 */

/**
 * Rustyard arena — a cleared scrap-yard floor (enc-rustyard-ambush, 7x7).
 */
const rustyardLegend: Record<string, LegendEntry> = {
  ".": { tile: "rust-floor" },
  ",": { tile: "pavement-cracked" },
};

const rustyardRows = [
  ".......",
  "..,....",
  "....,..",
  ".......",
  "..,....",
  ".....,.",
  ".......",
];

const rustyardGrid = buildMapGrid(rustyardLegend, rustyardRows);

const rustyardArena: IsoMap = {
  id: "rustyard-arena",
  name: "Rustyard Arena",
  width: rustyardGrid.width,
  height: rustyardGrid.height,
  tiles: rustyardGrid.tiles,
  props: rustyardGrid.props,
  interactables: [],
  spawns: [{ id: "player-start", x: 3, y: 6 }],
};

/**
 * Undercroft junction — flooded service level around the dead drop
 * (enc-auric-scout, 8x6).
 */
const undercroftLegend: Record<string, LegendEntry> = {
  ".": { tile: "pavement" },
  ",": { tile: "pavement-cracked" },
  r: { tile: "rust-floor" },
};

const undercroftRows = [
  ",..rr...",
  "........",
  "..,...r.",
  ".r......",
  "....,...",
  "...r..,.",
];

const undercroftGrid = buildMapGrid(undercroftLegend, undercroftRows);

const undercroftArena: IsoMap = {
  id: "undercroft-arena",
  name: "Undercroft Junction Nine",
  width: undercroftGrid.width,
  height: undercroftGrid.height,
  tiles: undercroftGrid.tiles,
  props: undercroftGrid.props,
  interactables: [],
  spawns: [{ id: "player-start", x: 1, y: 3 }],
};

/**
 * Vault antechamber — polished pre-Combine security floor
 * (enc-vault-guardian, 8x6).
 */
const vaultLegend: Record<string, LegendEntry> = {
  ".": { tile: "pavement" },
  "=": { tile: "plaza-glow" },
};

const vaultRows = [
  "........",
  "..====..",
  "..====..",
  "..====..",
  "..====..",
  "........",
];

const vaultGrid = buildMapGrid(vaultLegend, vaultRows);

const vaultArena: IsoMap = {
  id: "vault-arena",
  name: "Vault Antechamber",
  width: vaultGrid.width,
  height: vaultGrid.height,
  tiles: vaultGrid.tiles,
  props: vaultGrid.props,
  interactables: [],
  spawns: [{ id: "player-start", x: 1, y: 2 }],
};

export const maps: readonly IsoMap[] = [
  cinderPlaza,
  rustyardArena,
  undercroftArena,
  vaultArena,
];

export const HUB_MAP_ID = cinderPlaza.id;

export function getMap(id: string): IsoMap | undefined {
  return maps.find((m) => m.id === id);
}

export function requireMap(id: string): IsoMap {
  const map = getMap(id);
  if (!map) {
    throw new Error(`Unknown map: ${id}`);
  }
  return map;
}
