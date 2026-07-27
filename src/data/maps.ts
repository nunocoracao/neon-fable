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
    {
      id: "flick",
      x: 8,
      y: 7,
      label: "Flick",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "a1-start" },
    },
    {
      id: "tram-messenger",
      x: 4,
      y: 8,
      label: "Restless messenger",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "a2-start" },
    },
  ],
  spawns: [
    { id: "player-start", x: 6, y: 9 },
    { id: "south-road", x: 6, y: 10 },
  ],
};

/**
 * Greywater Steps — the Undercroft settlement where most of Act 1 plays
 * out. Lantern-lit terraces above a black cistern pool (north-west), the
 * Cistern Court's glow-lit forecourt at the center, and the pump-deck
 * gate in the south wall. Reached via travel effects from the story, not
 * from the hub's interactables.
 */
const greywaterLegend: Record<string, LegendEntry> = {
  "#": { tile: "foundation", prop: { propId: "building", blocks: true } },
  ".": { tile: "pavement" },
  ",": { tile: "pavement-cracked" },
  "=": { tile: "plaza-glow" },
  "~": { tile: "canal" },
  l: { tile: "pavement", prop: { propId: "streetlight", blocks: true } },
  b: { tile: "pavement", prop: { propId: "barrier", blocks: true } },
  v: { tile: "pavement", prop: { propId: "vent-stack", blocks: true } },
  c: { tile: "pavement", prop: { propId: "crate", blocks: true } },
};

const greywaterRows = [
  "##############",
  "#..~~~..,....#",
  "#..~~~.......#",
  "#..b,....l...#",
  "#............#",
  "#.,...==.....#",
  "#.....==...v.#",
  "#.l.......c..#",
  "#.....,......#",
  "#..........l.#",
  "#,...........#",
  "##############",
];

const greywaterGrid = buildMapGrid(greywaterLegend, greywaterRows);

const greywaterSteps: IsoMap = {
  id: "greywater-steps",
  name: "Greywater Steps",
  width: greywaterGrid.width,
  height: greywaterGrid.height,
  tiles: greywaterGrid.tiles,
  props: greywaterGrid.props,
  interactables: [
    {
      id: "matron-ferrow",
      x: 6,
      y: 4,
      label: "Matron Ferrow",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "a1-ferrow" },
    },
    {
      id: "patch-den",
      x: 2,
      y: 8,
      label: "Patch's Den",
      spriteId: "door",
      interaction: { kind: "dialogue", nodeId: "a1-patch" },
    },
    {
      id: "dead-relay-shrine",
      x: 11,
      y: 8,
      label: "Dead Relay Shrine",
      spriteId: "terminal",
      interaction: { kind: "dialogue", nodeId: "a1-shrine" },
    },
    {
      id: "flick-steps",
      x: 9,
      y: 5,
      label: "Flick",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "a1-flick-steps" },
    },
    {
      id: "notice-board",
      x: 7,
      y: 2,
      label: "Notice Board",
      spriteId: "terminal",
      interaction: { kind: "dialogue", nodeId: "a1-board" },
    },
    {
      id: "pump-deck-gate",
      x: 3,
      y: 10,
      label: "Pump-Deck Gate",
      spriteId: "door",
      interaction: { kind: "dialogue", nodeId: "a1-pumpgate" },
    },
    {
      id: "chainwell-stair",
      x: 12,
      y: 1,
      label: "Chainwell Stair",
      spriteId: "door",
      interaction: { kind: "dialogue", nodeId: "a1-ascend" },
    },
  ],
  spawns: [{ id: "player-start", x: 7, y: 9 }],
};

/**
 * Meridian Exchange — Ventworks. Auric's district utility floor topside:
 * the cycler galleries that breathe for the Undercroft, coolant mains
 * along the east wall, and the Cordon core rising at the center. Act 2's
 * converging spine plays out here; reached via travel effects from the
 * story branches.
 */
const ventworksLegend: Record<string, LegendEntry> = {
  "#": { tile: "foundation", prop: { propId: "building", blocks: true } },
  ".": { tile: "pavement" },
  ",": { tile: "pavement-cracked" },
  "=": { tile: "plaza-glow" },
  "~": { tile: "canal" },
  l: { tile: "pavement", prop: { propId: "streetlight", blocks: true } },
  b: { tile: "pavement", prop: { propId: "barrier", blocks: true } },
  v: { tile: "pavement", prop: { propId: "vent-stack", blocks: true } },
  c: { tile: "pavement", prop: { propId: "crate", blocks: true } },
};

const ventworksRows = [
  "##############",
  "#....==..~~..#",
  "#.l..==..~~..#",
  "#....==..b...#",
  "#..,......v..#",
  "#.....l......#",
  "#.c........,.#",
  "#....,....l..#",
  "#..v.........#",
  "#.,........c.#",
  "#............#",
  "##############",
];

const ventworksGrid = buildMapGrid(ventworksLegend, ventworksRows);

const exchangeVentworks: IsoMap = {
  id: "exchange-ventworks",
  name: "Meridian Exchange — Ventworks",
  width: ventworksGrid.width,
  height: ventworksGrid.height,
  tiles: ventworksGrid.tiles,
  props: ventworksGrid.props,
  interactables: [
    {
      id: "cordon-core",
      x: 5,
      y: 2,
      label: "Cordon Core",
      spriteId: "door",
      interaction: { kind: "dialogue", nodeId: "a2-core-door" },
    },
    {
      id: "cycler-gallery",
      x: 11,
      y: 5,
      label: "Cycler Gallery",
      spriteId: "terminal",
      interaction: { kind: "dialogue", nodeId: "a2-vent-gallery" },
    },
    {
      id: "vent-crew",
      x: 3,
      y: 7,
      label: "Vent-crew pen",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "a2-vent-crew" },
    },
    {
      id: "coolant-vault",
      x: 2,
      y: 9,
      label: "Coolant Vault",
      spriteId: "door",
      interaction: { kind: "dialogue", nodeId: "a2-vent-cache" },
    },
    {
      id: "tram-gate",
      x: 7,
      y: 10,
      label: "Tram Gate",
      spriteId: "door",
      interaction: { kind: "dialogue", nodeId: "a2-tram" },
    },
  ],
  spawns: [{ id: "player-start", x: 7, y: 9 }],
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

/**
 * Pumpworks deck — the Undertow manifold hall under Greywater Steps.
 * Shared by the three chapter-climax encounters (9x7).
 */
const pumpworksLegend: Record<string, LegendEntry> = {
  ".": { tile: "pavement" },
  ",": { tile: "pavement-cracked" },
  r: { tile: "rust-floor" },
};

const pumpworksRows = [
  ".,.......",
  "...r.....",
  ".....,...",
  "...r.....",
  ".,.......",
  ".....r...",
  "........,",
];

const pumpworksGrid = buildMapGrid(pumpworksLegend, pumpworksRows);

const pumpworksArena: IsoMap = {
  id: "pumpworks-arena",
  name: "Undertow Pumpworks",
  width: pumpworksGrid.width,
  height: pumpworksGrid.height,
  tiles: pumpworksGrid.tiles,
  props: pumpworksGrid.props,
  interactables: [],
  spawns: [{ id: "player-start", x: 1, y: 3 }],
};

/**
 * Relay Crown — the antenna platform above Cinder Row (enc-relay-crown,
 * 7x6). Glow strips mark the mast anchors.
 */
const relayCrownLegend: Record<string, LegendEntry> = {
  ".": { tile: "pavement" },
  "=": { tile: "plaza-glow" },
};

const relayCrownRows = [
  ".......",
  "..=.=..",
  "...=...",
  "..=.=..",
  ".......",
  ".......",
];

const relayCrownGrid = buildMapGrid(relayCrownLegend, relayCrownRows);

const relayCrownArena: IsoMap = {
  id: "relay-crown-arena",
  name: "Relay Crown",
  width: relayCrownGrid.width,
  height: relayCrownGrid.height,
  tiles: relayCrownGrid.tiles,
  props: relayCrownGrid.props,
  interactables: [],
  spawns: [{ id: "player-start", x: 3, y: 5 }],
};

/**
 * Exchange cycler floor — the Cordon core ring and the coolant vault den
 * beneath it. Shared by the vent-crawler fight and the three Act 2
 * climax variants (9x7).
 */
const cyclerFloorLegend: Record<string, LegendEntry> = {
  ".": { tile: "pavement" },
  ",": { tile: "pavement-cracked" },
  "=": { tile: "plaza-glow" },
  r: { tile: "rust-floor" },
};

const cyclerFloorRows = [
  ".........",
  "..=...=..",
  "....,....",
  ".=.....=.",
  "....r....",
  "..=...=..",
  ".........",
];

const cyclerFloorGrid = buildMapGrid(cyclerFloorLegend, cyclerFloorRows);

const cyclerFloorArena: IsoMap = {
  id: "cycler-floor-arena",
  name: "Exchange Cycler Floor",
  width: cyclerFloorGrid.width,
  height: cyclerFloorGrid.height,
  tiles: cyclerFloorGrid.tiles,
  props: cyclerFloorGrid.props,
  interactables: [],
  spawns: [{ id: "player-start", x: 1, y: 3 }],
};

export const maps: readonly IsoMap[] = [
  cinderPlaza,
  greywaterSteps,
  exchangeVentworks,
  rustyardArena,
  undercroftArena,
  vaultArena,
  pumpworksArena,
  relayCrownArena,
  cyclerFloorArena,
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
