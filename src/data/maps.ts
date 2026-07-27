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
 * Rustyard arena — a cleared scrap-yard floor used as a combat map.
 * Dimensions match the enc-rustyard-ambush encounter grid (7x7).
 */
const arenaLegend: Record<string, LegendEntry> = {
  ".": { tile: "rust-floor" },
  c: { tile: "rust-floor", prop: { propId: "crate", blocks: true } },
  b: { tile: "rust-floor", prop: { propId: "barrier", blocks: true } },
};

const arenaRows = [
  ".......",
  "..c....",
  "....b..",
  ".......",
  "..c....",
  ".....c.",
  ".......",
];

const arenaGrid = buildMapGrid(arenaLegend, arenaRows);

const rustyardArena: IsoMap = {
  id: "rustyard-arena",
  name: "Rustyard Arena",
  width: arenaGrid.width,
  height: arenaGrid.height,
  tiles: arenaGrid.tiles,
  props: arenaGrid.props,
  interactables: [],
  spawns: [
    { id: "player", x: 1, y: 5 },
    { id: "enemy-1", x: 5, y: 1 },
    { id: "enemy-2", x: 3, y: 1 },
  ],
};

export const maps: readonly IsoMap[] = [cinderPlaza, rustyardArena];

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
