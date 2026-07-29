/**
 * Isometric map content: the Cinder Row hub plaza and the Rustyard
 * combat arena. Maps are authored as character rows expanded through
 * buildMapGrid; interactables reference story node and encounter ids by
 * string only — the iso layer never resolves them.
 */
import { buildMapGrid, type IsoMap, type LegendEntry } from "../iso/tilemap";
import {
  FERROW_VISUAL,
  FLICK_VISUAL,
  LIN_VISUAL,
  VESPER_VISUAL,
} from "./cast";

/**
 * Authored looks for named story NPCs, rendered through the layered
 * appearance pipeline. Named speakers draw their look from the dialogue
 * cast (./cast.ts) so street sprite and portrait always match; deliberate
 * and role-fitting — friendly faces avoid the crimson/magenta
 * hostile-optic cue reserved for enemies (the rust-runner ambusher wears
 * it on purpose). NPC interactables without a visual (crowds, ambient
 * figures) get a stable seeded look from their map position instead
 * (character/npc.ts).
 */

/**
 * Cinder Row plaza — the hub, dressed as the game's postcard shot. Four
 * zones, each with its own furniture and light: the Filament bar
 * frontage along the north face (plank threshold under the door, its
 * neon totem beside it), Vesper's Chrome Chapel in the west wall
 * (clinic-tile threshold under her sign), the storm canal down the east
 * wall (quay lips both banks, capped with a barrier fence where it
 * meets the square), and the wet-market corner in the south-east
 * (A-frame sign, crate stacks, trash, cabling). A glow-ring plaza
 * anchors the center under the district holo-billboard, and a curbed
 * street runs the full south edge.
 */
const hubLegend: Record<string, LegendEntry> = {
  "#": { tile: "foundation", prop: { propId: "building", blocks: true } },
  // The Filament's doorway: worn barroom planks spilling out under the
  // door, baseboard-shadowed where they meet the dark interior behind.
  d: { tile: "bar-floor-n" },
  // The Chrome Chapel's doorway in the west wall: scrubbed clinical
  // tile under Vesper's door, baseboard-shadowed toward the parlor.
  q: { tile: "clinic-floor-w" },
  ".": { tile: "pavement" },
  ",": { tile: "pavement-cracked" },
  "=": { tile: "plaza-glow" },
  r: { tile: "road" },
  // Curb: the sidewalk's quay lip stepping down to the street.
  "-": { tile: "quay-s" },
  "~": { tile: "canal" },
  D: { tile: "canal-deep" },
  e: { tile: "quay-e" },
  w: { tile: "quay-w" },
  n: { tile: "quay-n" },
  B: { tile: "quay-n", prop: { propId: "barrier", blocks: true } },
  l: { tile: "pavement", prop: { propId: "streetlight", blocks: true } },
  v: { tile: "pavement", prop: { propId: "vent-stack", blocks: true } },
  c: { tile: "pavement", prop: { propId: "crate", blocks: true } },
  h: { tile: "pavement", prop: { propId: "holo-sign", blocks: true } },
  N: { tile: "pavement", prop: { propId: "neon-sign", blocks: true } },
  H: { tile: "pavement", prop: { propId: "holo-billboard", blocks: true } },
  s: { tile: "pavement", prop: { propId: "shop-sign", blocks: true } },
  y: { tile: "pavement-cracked", prop: { propId: "hydrant", blocks: true } },
  t: { tile: "pavement", prop: { propId: "trash-heap", blocks: true } },
  // Ground clutter, not an obstacle — pedestrians step over the cables.
  u: { tile: "pavement", prop: { propId: "cable-bundle", blocks: false } },
};

const hubRows = [
  "####d###########",
  "#.....N..h.eDDw#",
  "#.l..u....ve~~w#",
  "#N...====..e~~w#",
  "#q...====..nBBn#",
  "#....====..,.l.#",
  "#.l..====.H...u#",
  "#y........,...c#",
  "#.l.......s...c#",
  "#,....u....u..t#",
  "#--------------#",
  "#rrrrrrrrrrrrrr#",
  "################",
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
      x: 4,
      y: 0,
      label: "The Filament",
      spriteId: "door",
      interaction: { kind: "dialogue", nodeId: "filament-door" },
    },
    {
      id: "market-vendor",
      x: 12,
      y: 8,
      label: "Wet-market vendor",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "wet-market" },
      // Stall-keeper bulk: knit cap, diver's harness, easy grin.
      visual: {
        appearance: {
          skinTone: "warm-brown",
          build: "heavy",
          hairStyle: "bob",
          hairColor: "chestnut",
          eyes: "standard",
          eyeColor: "amber",
          brows: "straight",
          mouth: "smirk",
          faceDetail: "none",
          headwear: "cap",
        },
        outfit: "out-diver-harness",
      },
    },
    {
      id: "chrome-chapel",
      x: 1,
      y: 5,
      label: "Vesper — Chrome Chapel",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "chapel-door" },
      visual: VESPER_VISUAL,
    },
    {
      id: "plaza-terminal",
      x: 9,
      y: 4,
      label: "Public terminal",
      spriteId: "terminal",
      interaction: { kind: "dialogue", nodeId: "start" },
    },
    {
      id: "rust-runner",
      x: 12,
      y: 6,
      label: "Rustyard runner",
      spriteId: "npc",
      interaction: { kind: "combat", encounterId: "enc-rustyard-ambush" },
      // An ambusher on the street: wears the hostile crimson optic.
      visual: {
        appearance: {
          skinTone: "deep-umber",
          build: "lean",
          hairStyle: "mohawk",
          hairColor: "auburn",
          eyes: "narrow",
          eyeColor: "crimson",
          brows: "heavy",
          mouth: "frown",
          faceDetail: "scar",
          headwear: "none",
        },
        weapon: "wpn-shard-knife",
      },
    },
    {
      id: "flick",
      x: 8,
      y: 7,
      // Loitering at the plaza ring's south-east corner.
      label: "Flick",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "a1-start" },
      visual: FLICK_VISUAL,
    },
    {
      id: "tram-messenger",
      x: 3,
      y: 9,
      label: "Restless messenger",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "a2-start" },
      // Pale, hollow-eyed courier half-hidden in a tech hood.
      visual: {
        appearance: {
          skinTone: "porcelain",
          build: "lean",
          hairStyle: "buzz",
          hairColor: "blond",
          eyes: "wide",
          eyeColor: "hologram-blue",
          brows: "straight",
          mouth: "neutral",
          faceDetail: "none",
          headwear: "hood",
        },
        outfit: "out-courier-slicker",
      },
    },
    {
      id: "crown-watcher",
      x: 10,
      y: 7,
      label: "Watcher under the dead screens",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "a3-start" },
      // Grey-locked sentinel of the plaza, split brow, silver stare.
      visual: {
        appearance: {
          skinTone: "deep-umber",
          build: "lean",
          hairStyle: "locs",
          hairColor: "silver",
          eyes: "narrow",
          eyeColor: "silver",
          brows: "heavy",
          mouth: "frown",
          faceDetail: "brow-split",
          headwear: "none",
        },
        outfit: "out-ghostline-mantle",
      },
    },
  ],
  spawns: [
    { id: "player-start", x: 7, y: 10 },
    { id: "south-road", x: 7, y: 11 },
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
  D: { tile: "canal-deep" },
  n: { tile: "quay-n" },
  e: { tile: "quay-e" },
  w: { tile: "quay-w" },
  B: { tile: "quay-n", prop: { propId: "barrier", blocks: true } },
  l: { tile: "pavement", prop: { propId: "streetlight", blocks: true } },
  b: { tile: "pavement", prop: { propId: "barrier", blocks: true } },
  v: { tile: "pavement", prop: { propId: "vent-stack", blocks: true } },
  c: { tile: "pavement", prop: { propId: "crate", blocks: true } },
  // Patch's Den hangs a small glyph board out on the walk.
  s: { tile: "pavement", prop: { propId: "shop-sign", blocks: true } },
  // Patch's Den doorway: a scrubbed clinical-tile threshold under the
  // door, baseboard-shadowed toward the den behind it.
  p: { tile: "clinic-floor-n" },
};

const greywaterRows = [
  "##############",
  "#.eDDDw.,....#",
  "#.e~~~w......#",
  "#..Bnn...l...#",
  "#............#",
  "#.,...==.....#",
  "#.....==...v.#",
  "#sl.......c..#",
  "#.p...,......#",
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
      visual: FERROW_VISUAL,
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
      visual: FLICK_VISUAL,
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
      x: 10,
      y: 1,
      label: "Chainwell Stair",
      spriteId: "exit",
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
  D: { tile: "canal-deep" },
  n: { tile: "quay-n" },
  e: { tile: "quay-e" },
  w: { tile: "quay-w" },
  B: { tile: "quay-n", prop: { propId: "barrier", blocks: true } },
  l: { tile: "pavement", prop: { propId: "streetlight", blocks: true } },
  b: { tile: "pavement", prop: { propId: "barrier", blocks: true } },
  v: { tile: "pavement", prop: { propId: "vent-stack", blocks: true } },
  c: { tile: "pavement", prop: { propId: "crate", blocks: true } },
  // Auric's district advertising: a corp holo ad and a canal-side
  // billboard mast.
  h: { tile: "pavement", prop: { propId: "holo-sign", blocks: true } },
  H: { tile: "pavement", prop: { propId: "holo-billboard", blocks: true } },
};

const ventworksRows = [
  "##############",
  "#....==.eDDwH#",
  "#.l..==.e~~w.#",
  "#....==..Bn..#",
  "#..,......v..#",
  "#h....l......#",
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
      x: 1,
      y: 8,
      label: "Coolant Vault",
      spriteId: "stash",
      interaction: { kind: "dialogue", nodeId: "a2-vent-cache" },
    },
    {
      id: "tram-gate",
      x: 7,
      y: 8,
      label: "Tram Gate",
      spriteId: "exit",
      interaction: { kind: "dialogue", nodeId: "a2-tram" },
    },
  ],
  spawns: [{ id: "player-start", x: 7, y: 9 }],
};

/**
 * Auric Spire — Crown Concourse. The Combine's headquarters tower on the
 * night of the Succession: registry gate at the north face, the crown
 * lift doors behind it, the muster crowd and ledger terminals in the
 * atrium. Act 3's converging spine plays out here; reached via travel
 * effects from the finale's openings.
 */
const spireLegend: Record<string, LegendEntry> = {
  "#": { tile: "foundation", prop: { propId: "building", blocks: true } },
  // The concourse is an interior atrium: corporate carpet throughout,
  // with baseboard-shadow trims along the north and west wall bases and
  // under the tram gate in the south wall.
  ".": { tile: "office-floor" },
  n: { tile: "office-floor-n" },
  w: { tile: "office-floor-w" },
  s: { tile: "office-floor-s" },
  "=": { tile: "plaza-glow" },
  l: { tile: "office-floor", prop: { propId: "streetlight", blocks: true } },
  b: { tile: "office-floor", prop: { propId: "barrier", blocks: true } },
  v: { tile: "office-floor", prop: { propId: "vent-stack", blocks: true } },
  c: { tile: "office-floor", prop: { propId: "crate", blocks: true } },
  h: { tile: "office-floor", prop: { propId: "holo-sign", blocks: true } },
};

const spireRows = [
  "##############",
  "#nn==nnnnnlnn#",
  "#w.==........#",
  "#w....b......#",
  "#w.l......h..#",
  "#w...........#",
  "#w.....v.....#",
  "#w...........#",
  "#w.c......l..#",
  "#w...........#",
  "#w.....s.....#",
  "##############",
];

const spireGrid = buildMapGrid(spireLegend, spireRows);

const auricSpire: IsoMap = {
  id: "auric-spire",
  name: "Auric Spire — Crown Concourse",
  width: spireGrid.width,
  height: spireGrid.height,
  tiles: spireGrid.tiles,
  props: spireGrid.props,
  interactables: [
    {
      id: "crown-lift",
      x: 3,
      y: 1,
      label: "Crown Lift",
      spriteId: "door",
      interaction: { kind: "dialogue", nodeId: "a3-crown-door" },
    },
    {
      id: "registry-gate",
      x: 7,
      y: 3,
      label: "Registry Gate",
      spriteId: "door",
      interaction: { kind: "dialogue", nodeId: "a3-gate" },
    },
    {
      id: "ledger-terminal",
      x: 11,
      y: 5,
      label: "Ledger Terminal",
      spriteId: "terminal",
      interaction: { kind: "dialogue", nodeId: "a3-terminal" },
    },
    {
      id: "auditor-booth",
      x: 2,
      y: 8,
      label: "Auditor's Booth",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "a3-lin" },
      visual: LIN_VISUAL,
    },
    {
      id: "muster-crowd",
      x: 9,
      y: 9,
      label: "The muster",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "a3-muster" },
    },
    {
      id: "spire-tram",
      x: 7,
      y: 8,
      label: "Tram Gate",
      spriteId: "exit",
      interaction: { kind: "dialogue", nodeId: "a3-tram" },
    },
  ],
  spawns: [{ id: "player-start", x: 6, y: 9 }],
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
  // Polished clinical tile with baseboard trims along the unseen north
  // and west walls; the glow strips light the vault door.
  ".": { tile: "clinic-floor" },
  n: { tile: "clinic-floor-n" },
  w: { tile: "clinic-floor-w" },
  "=": { tile: "plaza-glow" },
};

const vaultRows = [
  "nnnnnnnn",
  "w.====..",
  "w.====..",
  "w.====..",
  "w.====..",
  "w.......",
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

/**
 * Spire crown ring — the Locus's chamber at the tower's peak. Shared by
 * the three finale climax variants (9x7). Glow strips trace the ring.
 */
const spireCrownLegend: Record<string, LegendEntry> = {
  // The Locus's chamber: corporate carpet under the glow ring, with
  // baseboard trims along the unseen north and west walls.
  ".": { tile: "office-floor" },
  n: { tile: "office-floor-n" },
  w: { tile: "office-floor-w" },
  "=": { tile: "plaza-glow" },
};

const spireCrownRows = [
  "nnnnnnnnn",
  "w.=...=..",
  "w........",
  "w=..=..=.",
  "w........",
  "w.=...=..",
  "w........",
];

const spireCrownGrid = buildMapGrid(spireCrownLegend, spireCrownRows);

const spireCrownArena: IsoMap = {
  id: "spire-crown-arena",
  name: "The Crown Ring",
  width: spireCrownGrid.width,
  height: spireCrownGrid.height,
  tiles: spireCrownGrid.tiles,
  props: spireCrownGrid.props,
  interactables: [],
  spawns: [{ id: "player-start", x: 1, y: 3 }],
};

export const maps: readonly IsoMap[] = [
  cinderPlaza,
  greywaterSteps,
  exchangeVentworks,
  auricSpire,
  rustyardArena,
  undercroftArena,
  vaultArena,
  pumpworksArena,
  relayCrownArena,
  cyclerFloorArena,
  spireCrownArena,
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
