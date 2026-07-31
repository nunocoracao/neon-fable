/**
 * Typed tilemap model for isometric maps: a grid of tile ids plus prop,
 * interactable, and spawn placements. Map content lives in src/data;
 * this module owns the shapes and pure queries (bounds, walkability).
 */
import type { CharacterVisual } from "../character/appearance";
import { facingFromDelta, type Facing } from "./animation";
import type { TilePoint } from "./coords";
import type { MapInteraction } from "./events";

/**
 * Interior floor materials: barroom planks, clinical tile, corp carpet,
 * and the two polished stones the Auric Spire's floors are laid in —
 * the atrium's pale slabs downstairs and the directors' black marble up
 * top.
 */
export type InteriorFloorId =
  | "bar-floor"
  | "clinic-floor"
  | "office-floor"
  | "atrium-floor"
  | "exec-floor";

/** Diamond edge a floor trim's baseboard shadow runs along. */
export type TrimEdge = "n" | "e" | "s" | "w";

/**
 * Interior floor with a baseboard-shadow trim along one diamond edge,
 * placed where a floor meets a wall or doorway so rooms don't end in an
 * abrupt color change.
 */
export type InteriorTrimId = `${InteriorFloorId}-${TrimEdge}`;

export const INTERIOR_FLOOR_IDS: readonly InteriorFloorId[] = [
  "bar-floor",
  "clinic-floor",
  "office-floor",
  "atrium-floor",
  "exec-floor",
];

export const TRIM_EDGES: readonly TrimEdge[] = ["n", "e", "s", "w"];

export type TileId =
  | "pavement"
  | "pavement-cracked"
  | "plaza-glow"
  | "road"
  | "canal"
  | "canal-deep"
  | "quay-n"
  | "quay-e"
  | "quay-s"
  | "quay-w"
  | "foundation"
  | "rust-floor"
  | InteriorFloorId
  | InteriorTrimId;

export interface TileDef {
  id: TileId;
  walkable: boolean;
}

/**
 * The surface a tile reads as at a glance, ignoring which edge
 * treatment it carries. Interior trims share their floor's material and
 * quay lips share pavement's, because a baseboard shadow or a wet
 * concrete lip is an edge of the same surface, not a different one.
 * Map lint uses this to check a map's dressing resolves into a few
 * broad zones rather than per-tile confetti.
 */
export type TileMaterial =
  | InteriorFloorId
  | "pavement"
  | "pavement-cracked"
  | "plaza-glow"
  | "road"
  | "water"
  | "foundation"
  | "rust-floor";

/** Interior floors and every trim variant report their floor material. */
const interiorMaterials = Object.fromEntries(
  INTERIOR_FLOOR_IDS.flatMap((floor) =>
    [floor, ...TRIM_EDGES.map((edge) => `${floor}-${edge}` as const)].map(
      (id) => [id, floor],
    ),
  ),
) as Record<InteriorFloorId | InteriorTrimId, TileMaterial>;

const TILE_MATERIALS: Readonly<Record<TileId, TileMaterial>> = {
  ...interiorMaterials,
  pavement: "pavement",
  "pavement-cracked": "pavement-cracked",
  "plaza-glow": "plaza-glow",
  road: "road",
  canal: "water",
  "canal-deep": "water",
  "quay-n": "pavement",
  "quay-e": "pavement",
  "quay-s": "pavement",
  "quay-w": "pavement",
  foundation: "foundation",
  "rust-floor": "rust-floor",
};

export function tileMaterial(id: TileId): TileMaterial {
  return TILE_MATERIALS[id];
}

/** Interior floors and all their trim variants are walkable room floor. */
const interiorFloorDefs = Object.fromEntries(
  INTERIOR_FLOOR_IDS.flatMap((floor) =>
    [floor, ...TRIM_EDGES.map((edge) => `${floor}-${edge}` as const)].map(
      (id) => [id, { id, walkable: true }],
    ),
  ),
) as Record<InteriorFloorId | InteriorTrimId, TileDef>;

export const TILE_DEFS: Record<TileId, TileDef> = {
  ...interiorFloorDefs,
  pavement: { id: "pavement", walkable: true },
  "pavement-cracked": { id: "pavement-cracked", walkable: true },
  "plaza-glow": { id: "plaza-glow", walkable: true },
  road: { id: "road", walkable: true },
  canal: { id: "canal", walkable: false },
  "canal-deep": { id: "canal-deep", walkable: false },
  "quay-n": { id: "quay-n", walkable: true },
  "quay-e": { id: "quay-e", walkable: true },
  "quay-s": { id: "quay-s", walkable: true },
  "quay-w": { id: "quay-w", walkable: true },
  foundation: { id: "foundation", walkable: false },
  "rust-floor": { id: "rust-floor", walkable: true },
};

export type PropId =
  | "building"
  | "streetlight"
  | "crate"
  | "barrier"
  | "holo-sign"
  | "neon-sign"
  | "holo-billboard"
  | "shop-sign"
  | "vent-stack"
  | "hydrant"
  | "trash-heap"
  | "cable-bundle"
  // Market dressing: stall furniture for the Vertical Market's aisles.
  | "stall-awning"
  | "cage-lamp"
  | "crate-stack"
  | "noodle-counter"
  // The one piece of food furniture that travels: a wheeled griddle
  // cart, for the districts with nowhere to eat.
  | "food-cart"
  // Quayside dressing: dockland furniture for the Flooded Quays. The
  // barge is the game's first prop whose bulk needs a footprint.
  | "mooring-post"
  | "salvage-tarp"
  | "sunken-barge"
  // Corp tower dressing: the Auric Spire's two interior floors. The
  // glazing comes in two orientations because a pane is a wall segment
  // and a wall runs along one of the two iso axes.
  | "glass-partition-x"
  | "glass-partition-y"
  | "reception-desk"
  | "server-column"
  | "planter-column"
  | "exec-desk";

/** A static decoration on a tile. Blocking props make the tile unwalkable. */
export interface PropPlacement {
  propId: PropId;
  x: number;
  y: number;
  blocks: boolean;
  /**
   * Extra tiles this prop's bulk lies across, as (dx, dy) offsets from
   * its own tile — how a set piece too big for one diamond (a beached
   * hull, a gantry) is placed. A blocking prop blocks all of them.
   *
   * Offsets must run behind the prop (dx <= 0 and dy <= 0), so the tile
   * it is placed on stays the nearest one it covers: painter's order
   * sorts a prop by that tile alone (depth = x + y), and anything the
   * bulk reaches over is therefore drawn before it. Legend characters
   * are per-tile, so a prop with a footprint is appended to a map's
   * prop list by hand — which is what a one-off set piece deserves.
   */
  footprint?: readonly TilePoint[];
}

/** Every tile a prop's bulk covers: its own, then its footprint. */
export function propTiles(prop: PropPlacement): TilePoint[] {
  return [
    { x: prop.x, y: prop.y },
    ...(prop.footprint ?? []).map((offset) => ({
      x: prop.x + offset.x,
      y: prop.y + offset.y,
    })),
  ];
}

/** True if a blocking prop's bulk stands on this tile. */
export function propBlocksTile(map: IsoMap, x: number, y: number): boolean {
  return map.props.some(
    (prop) =>
      prop.blocks && propTiles(prop).some((tile) => tile.x === x && tile.y === y),
  );
}

export type InteractableSpriteId =
  | "npc"
  | "door"
  | "terminal"
  | "stash"
  // A memory shard: the one interactable no map authors by hand — they
  // are placed from lore content (see src/world/shards.ts).
  | "shard"
  | "exit";

/**
 * Where an interactable leads. Declaring one is what makes something a
 * way out: it earns the shared exit marker under it, a label naming
 * what is on the other side, and the door-then-fade transition when the
 * scene it opens ends in travel. The iso layer never resolves the ids —
 * it only reports them, exactly like interactions.
 */
export interface MapExit {
  /** Destination map id. */
  mapId: string;
  /**
   * Spawn point to arrive on over there; absent means the map's own
   * ENTRY_SPAWN_ID. Arrivals face into the map from wherever they land
   * (see entryFacing).
   */
  entryId?: string;
}

/** The spawn every map has, and where an arrival lands by default. */
export const ENTRY_SPAWN_ID = "player-start";

/**
 * An NPC/object the player can interact with from an adjacent tile.
 * Interactables occupy (and block) their tile; the interaction payload
 * is emitted as-is by the scene — the iso layer never interprets it.
 */
export interface Interactable {
  id: string;
  x: number;
  y: number;
  label: string;
  spriteId: InteractableSpriteId;
  interaction: MapInteraction;
  /** Set on interactables that lead off this map; see MapExit. */
  exit?: MapExit;
  /**
   * Whether this earns a pip on the minimap, overriding the default for
   * its kind. Ways out and people always show; among objects only the
   * key kinds (terminal, stash) do, so a door or a prop the story sends
   * you to declares `minimap: true` and anything that would crowd the
   * corner declares false. See minimapPipKind in ./minimap.ts.
   */
  minimap?: boolean;
  /**
   * Authored look for "npc" sprites, rendered through the layered
   * appearance pipeline. Named story NPCs set this in map data; absent
   * means a stable seeded look derived from the map position (see
   * character/npc.ts). Ignored for object sprite ids.
   */
  visual?: CharacterVisual;
}

export interface SpawnPoint {
  id: string;
  x: number;
  y: number;
  /**
   * Which way an arrival on this spawn looks. Absent derives it from
   * the map's shape — see entryFacing.
   */
  facing?: Facing;
}

/**
 * A rectangular stretch of a map ambient pedestrians keep to: a plaza,
 * a market row, a street. Zones are authored as rectangles because a
 * crowd only needs to read as belonging somewhere — the walkable tiles
 * inside the rectangle are what a pedestrian actually roams, so a zone
 * may overlap walls and water without any special-casing.
 */
export interface AmbientZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How busy a map's streets are. Purely decorative: ambient pedestrians
 * are scenery with no interaction, no collision, and no combat role
 * (see src/iso/ambient.ts). Maps that should read as quiet declare a
 * small count; arenas and empty rooms declare no spec at all.
 */
export interface AmbientSpec {
  /** Pedestrians to spawn, clamped to MAX_AMBIENT_PER_MAP. */
  count: number;
  /** Zones pedestrians are dealt across, round-robin in this order. */
  zones: readonly AmbientZone[];
}

/**
 * An elevated line crossing a map's background. The train is scenery on
 * a long timer: it departs once per `periodMs`, takes `crossMs` to run
 * the declared span, and is simply absent the rest of the time. Nothing
 * about it is stateful — where it is (and whether it is out at all) is a
 * function of the clock alone (see src/iso/setpiece.ts).
 *
 * The row may sit off the grid entirely: the line rides above the map,
 * and a negative row is what puts it behind the structures on row 0 —
 * painter's order does the occlusion with no special case, exactly as it
 * does for everything else on the map.
 */
export interface TrainTrack {
  id: string;
  /** Map row the line runs along; may fall outside the grid. */
  row: number;
  /** World x the lead car enters at, and the one it leaves at. */
  fromX: number;
  toX: number;
  /** Cars following the lead one. */
  cars: number;
  /** How high the line rides above the row, in 1x art pixels. */
  heightPx: number;
  /** Time from one departure to the next. */
  periodMs: number;
  /** How long one crossing takes; never more than periodMs. */
  crossMs: number;
  /** Phase offset, so a line does not always depart at t = 0. */
  offsetMs?: number;
}

/**
 * A patrol drone's beat: a closed loop of tile waypoints it flies round
 * forever at a fixed speed, hovering `heightPx` above the ground. Purely
 * decorative — a drone is not an interactable, has no collision, and no
 * stat, roll, or route anywhere in the game reads one.
 */
export interface DronePath {
  id: string;
  /** Loop of tile waypoints; the last leg closes back to the first. */
  waypoints: readonly TilePoint[];
  /** Cruise speed along the loop, in tiles per second. */
  speed: number;
  /** Hover height above the tile, in 1x art pixels. */
  heightPx: number;
  /** Offset along the loop, so a pair never flies in formation. */
  offsetMs?: number;
}

/**
 * How often a map's vent stacks blow off steam. Every vent-stack prop on
 * the map gets its own seeded schedule from this one cadence, so a
 * district vents at its own rhythm without any per-prop authoring.
 */
export interface VentBurstSpec {
  /** Scheduling window per vent; at most one burst lands in each. */
  periodMs: number;
  /** Share of windows that actually vent (0..1); rain raises it. */
  chance: number;
}

/**
 * The large ambient machinery dressing a map: trains crossing the
 * background, drones on patrol, steam blowing off the vents. All of it
 * is scenery — declared here, positioned by pure logic in
 * src/iso/setpiece.ts, and painted in the scene's existing depth-sorted
 * object pass. Maps that declare none (arenas, quiet interiors) simply
 * omit the field.
 */
export interface SetPieceSpec {
  trains?: readonly TrainTrack[];
  drones?: readonly DronePath[];
  /** Cadence for the map's vent-stack props; absent means they idle. */
  vents?: VentBurstSpec;
}

/**
 * A public screen running a news ticker: the district's holo-billboard,
 * the boards over a market aisle, the panel by a tower's registry gate.
 *
 * The declaration is pure geometry and a channel name — where the strip
 * paints and how wide the readable window is. What it *says* is content
 * the shell resolves and hands to the scene per frame (see
 * src/world/news.ts), exactly as barks work: the iso layer positions
 * and scrolls, and never learns what a headline means.
 *
 * A screen is not an interactable and has no tile of its own beyond the
 * one it sorts at — it is a caption on the prop it is mounted on, so it
 * blocks nothing, is picked by nothing, and needs no map-lint rule
 * beyond standing over ground the map has.
 */
export interface NewsScreen {
  id: string;
  /** Tile the screen's prop stands on; the strip sorts here. */
  x: number;
  y: number;
  /**
   * Where the window's top-left corner sits relative to the tile's
   * center, in 1x art pixels — up and left are negative, matching the
   * offsets set pieces use.
   */
  offsetX: number;
  offsetY: number;
  /** Readable width of the window, in 1x art pixels. */
  width: number;
  /**
   * Which headline pool the screen carries. A plain string here on
   * purpose: the channels are content (see NEWS_CHANNELS in
   * src/data/world.ts) and the iso layer has no business knowing them.
   * A map-lint test pins every declared channel to a real one.
   */
  channel: string;
  /** Neon channel the strip burns in; see NEWS_TINT_INK. */
  tint: "cyan" | "amber" | "hologram";
}

/**
 * The sky a map plays under. Purely a look: weather drives the rain
 * overlay, puddle art, and reflection shimmer (see src/iso/weather.ts)
 * and nothing else — no stat, roll, or route anywhere in the game reads
 * it. Absent means "clear".
 */
export type WeatherId = "clear" | "rain";

/**
 * The hour a map plays at. Like weather, purely a look: the phase picks
 * a bake-time palette tint and scales the neon glow pass (see
 * src/iso/dayPhase.ts and src/iso/art/tint.ts) and nothing else — no
 * stat, roll, or route anywhere in the game reads it.
 *
 * - "dusk": the last warm light off the towers, neon not yet winning.
 * - "night": the hour every sprite is authored at — the neutral look.
 * - "late": the small hours; the street goes cold and dark and the
 *   signage is the only thing left burning.
 */
export type DayPhaseId = "dusk" | "night" | "late";

export const DAY_PHASES: readonly DayPhaseId[] = ["dusk", "night", "late"];

/** The phase the art is authored at; what an undeclared map plays under. */
export const DEFAULT_DAY_PHASE: DayPhaseId = "night";

export interface IsoMap {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Row-major grid: tiles[y][x]. */
  tiles: TileId[][];
  props: PropPlacement[];
  interactables: Interactable[];
  spawns: SpawnPoint[];
  /** Ambient crowd to dress the map with; absent means no pedestrians. */
  ambient?: AmbientSpec;
  /** Large ambient machinery: trains, drones, steam. Visual only. */
  setPieces?: SetPieceSpec;
  /** Public screens running a news ticker; absent means none. */
  screens?: readonly NewsScreen[];
  /** Weather the map plays under; absent means clear. Visual only. */
  weather?: WeatherId;
  /** Hour the map plays at; absent means night. Visual only. */
  dayPhase?: DayPhaseId;
}

/** A legend entry for authoring maps as compact character rows. */
export interface LegendEntry {
  tile: TileId;
  prop?: { propId: PropId; blocks: boolean };
}

/**
 * Expand character rows + legend into a tile grid and prop list. Throws
 * on ragged rows or characters missing from the legend so bad map data
 * fails fast at load time.
 */
export function buildMapGrid(
  legend: Record<string, LegendEntry>,
  rows: readonly string[],
): { tiles: TileId[][]; props: PropPlacement[]; width: number; height: number } {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const tiles: TileId[][] = [];
  const props: PropPlacement[] = [];
  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Map row ${y} has length ${row.length}, expected ${width}`);
    }
    const tileRow: TileId[] = [];
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? "";
      const entry = legend[ch];
      if (!entry) {
        throw new Error(`Map character "${ch}" at (${x}, ${y}) is not in the legend`);
      }
      tileRow.push(entry.tile);
      if (entry.prop) {
        props.push({ propId: entry.prop.propId, x, y, blocks: entry.prop.blocks });
      }
    }
    tiles.push(tileRow);
  });
  return { tiles, props, width, height };
}

export function inBounds(map: IsoMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function tileAt(map: IsoMap, x: number, y: number): TileDef | undefined {
  const id = map.tiles[y]?.[x];
  return id === undefined ? undefined : TILE_DEFS[id];
}

export function interactableAt(
  map: IsoMap,
  x: number,
  y: number,
): Interactable | undefined {
  return map.interactables.find((i) => i.x === x && i.y === y);
}

export function spawnPoint(map: IsoMap, id: string): SpawnPoint | undefined {
  return map.spawns.find((s) => s.id === id);
}

/**
 * Which way the player looks on arriving at a spawn: the authored
 * facing, or — since every spawn sits at a threshold — turned toward
 * the middle of the map, so you always arrive looking into a space
 * rather than back out of it.
 */
export function entryFacing(map: IsoMap, spawn: SpawnPoint): Facing {
  if (spawn.facing) return spawn.facing;
  const dx = (map.width - 1) / 2 - spawn.x;
  const dy = (map.height - 1) / 2 - spawn.y;
  return facingFromDelta(dx, dy) ?? "s";
}

/** Every interactable on the map that leads somewhere else. */
export function mapExits(map: IsoMap): Interactable[] {
  return map.interactables.filter((i) => i.exit !== undefined);
}

export function requireSpawn(map: IsoMap, id: string): SpawnPoint {
  const spawn = spawnPoint(map, id);
  if (!spawn) {
    throw new Error(`Map "${map.id}" has no spawn point "${id}"`);
  }
  return spawn;
}

/**
 * True if the tile can be stood on: in bounds, a walkable tile kind, no
 * blocking prop, and no interactable occupying it.
 */
export function isWalkable(map: IsoMap, x: number, y: number): boolean {
  const tile = tileAt(map, x, y);
  if (!tile || !tile.walkable) return false;
  if (propBlocksTile(map, x, y)) return false;
  if (interactableAt(map, x, y)) return false;
  return true;
}

/** The 4-neighborhood of a tile, unfiltered. */
export function neighbors(p: TilePoint): TilePoint[] {
  return [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ];
}
