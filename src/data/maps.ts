/**
 * Isometric map content: four explorable maps (the Cinder Row hub, the
 * Greywater Steps settlement, the Exchange ventworks, and the Auric
 * Spire concourse) and the seven combat arenas the encounters fight
 * on. Maps are authored as character rows expanded through
 * buildMapGrid; interactables reference story node and encounter ids by
 * string only — the iso layer never resolves them.
 *
 * Every map is dressed from the native hi-res tile and prop
 * vocabulary, and each carries its own material identity: the hub is
 * neon and lived-in, Greywater is damp and salvaged, the Ventworks is
 * swept industrial-corporate, the Spire concourse is sterile. Arenas
 * stay deliberately quiet — see the arena section's note.
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
 * anchors the center under the district holo-billboard, and a curbed,
 * lamp-lit street runs full-bleed along the open south edge — the
 * tenement walls frame north, east, and west only, so the street stays
 * visible instead of hiding behind the wall sprites.
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
  L: { tile: "quay-s", prop: { propId: "streetlight", blocks: true } },
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
  "#.l..u..,.ve~~w#",
  "#N..,====..e~~w#",
  "#q...====..nBBn#",
  "#..,.====..,.l.#",
  "#.l..====.H..u.#",
  "#y........,..c.#",
  "#.l........s.c.#",
  "#,....u....u.t.#",
  "#---L------L---#",
  "rrrrrrrrrrrrrrrr",
  "rrrrrrrrrrrrrrrr",
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
      // Working the stall row between the A-frame sign and the crates.
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
      // Beside the chapel threshold, clear of the wall and lamp sprites
      // so the stylist reads at a glance.
      x: 2,
      y: 4,
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
    { id: "south-road", x: 7, y: 12 },
  ],
  // The hub is the busiest map in the game and the one the player sees
  // most: a modest, constant drift of people across the glow ring, a
  // couple working the stall row, and foot traffic on the street below
  // the curb. Zones are listed busiest-first — the crowd is dealt
  // round-robin, so the plaza always fills before the market corner.
  ambient: {
    count: 9,
    zones: [
      { id: "plaza", x: 3, y: 5, width: 6, height: 4 },
      { id: "street", x: 1, y: 10, width: 12, height: 3 },
      { id: "market-row", x: 6, y: 8, width: 7, height: 2 },
    ],
  },
};

/**
 * Greywater Steps — the Undercroft settlement where most of Act 1 plays
 * out, dressed damp and hand-me-down: the black cistern pool in the
 * north-west wears quay lips on every bank with a barrier where the
 * walk meets the water, cracked slabs and draped cable bundles run
 * between the lantern posts, refuse mounds pile against the tenement
 * walls, and pump steam vents near the south gate. The Cistern Court's
 * glow-lit forecourt holds the center; Patch's Den keeps its glyph
 * board and scrubbed threshold in the west wall. Reached via travel
 * effects from the story, not from the hub's interactables.
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
  v: { tile: "pavement", prop: { propId: "vent-stack", blocks: true } },
  c: { tile: "pavement", prop: { propId: "crate", blocks: true } },
  t: { tile: "pavement", prop: { propId: "trash-heap", blocks: true } },
  // Ground clutter, not an obstacle — residents step over the cables.
  u: { tile: "pavement", prop: { propId: "cable-bundle", blocks: false } },
  // Patch's Den hangs a small glyph board out on the walk.
  s: { tile: "pavement", prop: { propId: "shop-sign", blocks: true } },
  // Patch's Den doorway: a scrubbed clinical-tile threshold under the
  // door, baseboard-shadowed toward the den behind it.
  p: { tile: "clinic-floor-n" },
};

const greywaterRows = [
  "##############",
  "#.eDDDw..,.t.#",
  "#.e~~~w.u....#",
  "#,.Bnn....l..#",
  "#..,..,....c.#",
  "#.,...==..,..#",
  "#..u..==...v.#",
  "#sl.......c..#",
  "#.p..,.u..,..#",
  "#..,.v...t.l.#",
  "#,....,......#",
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
  // Greywater is a settlement, not a thoroughfare: a few residents
  // crossing the walk between the cistern and the court, no more.
  ambient: {
    count: 4,
    zones: [{ id: "walk", x: 1, y: 4, width: 9, height: 4 }],
  },
};

/**
 * Meridian Exchange — Ventworks. Auric's district utility floor topside:
 * the cycler galleries that breathe for the Undercroft, coolant mains
 * along the east wall, and the Cordon core rising at the center. The
 * floor reads industrial-corporate: a glow strip feeds the core, rusted
 * deck-plate service lanes ring the cycler machinery, barriers fence
 * the coolant canal, vent stacks bleed steam over the plates, and the
 * district's holo advertising looms over sparse, squared-away supply
 * pallets — no litter here; Auric keeps the floor swept. Act 2's
 * converging spine plays out here; reached via travel effects from the
 * story branches.
 */
const ventworksLegend: Record<string, LegendEntry> = {
  "#": { tile: "foundation", prop: { propId: "building", blocks: true } },
  ".": { tile: "pavement" },
  ",": { tile: "pavement-cracked" },
  "=": { tile: "plaza-glow" },
  r: { tile: "rust-floor" },
  "~": { tile: "canal" },
  D: { tile: "canal-deep" },
  n: { tile: "quay-n" },
  e: { tile: "quay-e" },
  w: { tile: "quay-w" },
  B: { tile: "quay-n", prop: { propId: "barrier", blocks: true } },
  l: { tile: "pavement", prop: { propId: "streetlight", blocks: true } },
  v: { tile: "pavement", prop: { propId: "vent-stack", blocks: true } },
  c: { tile: "pavement", prop: { propId: "crate", blocks: true } },
  // Auric's district advertising: a corp holo ad and a billboard mast,
  // both kept off the wall-adjacent ring so the tenement sprites in
  // front of them do not eat half the projection.
  h: { tile: "pavement", prop: { propId: "holo-sign", blocks: true } },
  H: { tile: "pavement", prop: { propId: "holo-billboard", blocks: true } },
};

const ventworksRows = [
  "##############",
  "#....==.eDDw.#",
  "#.l..==.e~~w.#",
  "#...==...Bn..#",
  "#.c,......v.,#",
  "#h..rr.l...,.#",
  "#...r..rrrr..#",
  "#.H.r..r..l..#",
  "#.,.r..r..v..#",
  "#...rrrr..c..#",
  "#.,.....,....#",
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
  // A utility floor on shift: a sparse trickle of vent crew between the
  // cycler galleries. Auric's floor is worked, not strolled.
  ambient: {
    count: 3,
    zones: [{ id: "cycler-lane", x: 3, y: 4, width: 6, height: 4 }],
  },
};

/**
 * Auric Spire — Crown Concourse. The Combine's headquarters tower on the
 * night of the Succession: registry gate at the north face, the crown
 * lift doors behind it, the muster crowd and ledger terminals in the
 * atrium. Dressed to read sterile — the opposite of every other map in
 * the game. Corporate carpet baseboard-trimmed along all four walls, a
 * scrubbed clinic-tile apron under the crown lift and the auditor's
 * booth, a glow channel running the atrium's full length as the light
 * spine, stanchion lines marshalling the registry queue, light columns
 * instead of street lamps, and one corp holo ad. Nothing is broken,
 * nothing is discarded, nothing leaks. Act 3's converging spine plays
 * out here; reached via travel effects from the finale's openings.
 */
const spireLegend: Record<string, LegendEntry> = {
  "#": { tile: "foundation", prop: { propId: "building", blocks: true } },
  ".": { tile: "office-floor" },
  n: { tile: "office-floor-n" },
  e: { tile: "office-floor-e" },
  s: { tile: "office-floor-s" },
  w: { tile: "office-floor-w" },
  // Polished security apron at the lift doors and the auditor's booth.
  C: { tile: "clinic-floor" },
  N: { tile: "clinic-floor-n" },
  "=": { tile: "plaza-glow" },
  // Atrium light columns and the registry queue's stanchion lines.
  l: { tile: "office-floor", prop: { propId: "streetlight", blocks: true } },
  b: { tile: "office-floor", prop: { propId: "barrier", blocks: true } },
  h: { tile: "office-floor", prop: { propId: "holo-sign", blocks: true } },
};

const spireRows = [
  "##############",
  "#nNNNNnnnnnnn#",
  "#wCCCC.=....e#",
  "#w.CC.b=b...e#",
  "#w.l...=..h.e#",
  "#w.....=....e#",
  "#w..b..=..b.e#",
  "#w.....=....e#",
  "#wCC...=..l.e#",
  "#w.....=....e#",
  "#wsssssssssss#",
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
  // Succession night: the concourse holds a standing muster. People
  // cross the atrium under the light spine, but nobody hurries — this
  // is a lobby, and Auric's lobbies are orderly.
  ambient: {
    count: 5,
    zones: [{ id: "atrium", x: 1, y: 4, width: 9, height: 4 }],
  },
};

/**
 * Combat arenas. Every tile of an arena is open floor: the combat engine
 * has no obstacle rules (movement is bounds + occupancy only), so arena
 * maps must not place blocking props or unwalkable tiles inside the grid
 * — otherwise the picture would disagree with what the engine allows.
 * Dimensions must match the owning encounter's grid; positions are tile
 * coordinates. Each arena keeps a "player-start" spawn mirroring the
 * encounter's playerStart so generic map tooling has a valid anchor.
 *
 * Arenas also declare no ambient crowd: a fight is the only thing
 * happening on the map, and a bystander wandering through a firefight
 * would read as a combatant the engine knows nothing about.
 *
 * Arenas are dressed with the tile vocabulary alone — no props, and no
 * per-tile speckling. Each reads as a small number of broad material
 * zones (a deck inside an apron, a lit ring around a core, a trimmed
 * room), because the grid has to stay legible under the movement and
 * range overlays a fight paints over it. Identity comes from which
 * materials meet and where their edges fall, not from clutter.
 */

/**
 * Rustyard arena — a cleared scrap-yard floor (enc-rustyard-ambush,
 * 7x7): corroded deck plates inside a cracked-concrete apron where the
 * yard meets its fence line.
 */
const rustyardLegend: Record<string, LegendEntry> = {
  r: { tile: "rust-floor" },
  ",": { tile: "pavement-cracked" },
};

const rustyardRows = [
  ",,,,,,,",
  ",rrrrr,",
  ",rrrrr,",
  ",rrrrr,",
  ",rrrrr,",
  ",rrrrr,",
  ",,,,,,,",
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
 * (enc-auric-scout, 8x6). Wet quay lips run the north and west edges
 * where the standing water sits off-grid; a rust service walkway
 * crosses the middle, concrete either side.
 */
const undercroftLegend: Record<string, LegendEntry> = {
  ".": { tile: "pavement" },
  ",": { tile: "pavement-cracked" },
  r: { tile: "rust-floor" },
  n: { tile: "quay-n" },
  w: { tile: "quay-w" },
};

const undercroftRows = [
  "nnnnnnnn",
  "w..rr...",
  "w.rrrr..",
  "w.rrrr..",
  "w..rr..,",
  "w,,....,",
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
  // Polished clinical tile, baseboard-trimmed on all four walls so the
  // antechamber reads as a sealed room; two glow runways flank the
  // approach and light the vault door.
  ".": { tile: "clinic-floor" },
  n: { tile: "clinic-floor-n" },
  e: { tile: "clinic-floor-e" },
  s: { tile: "clinic-floor-s" },
  w: { tile: "clinic-floor-w" },
  "=": { tile: "plaza-glow" },
};

const vaultRows = [
  "nnnnnnnn",
  "w.=..=.e",
  "w.=..=.e",
  "w.=..=.e",
  "w.=..=.e",
  "wsssssss",
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
 * Shared by the three chapter-climax encounters (9x7). The manifold's
 * rust deck runs the length of the hall between concrete margins, with
 * a wet quay lip along the sump edges at north and west.
 */
const pumpworksLegend: Record<string, LegendEntry> = {
  ".": { tile: "pavement" },
  ",": { tile: "pavement-cracked" },
  r: { tile: "rust-floor" },
  n: { tile: "quay-n" },
  w: { tile: "quay-w" },
};

const pumpworksRows = [
  "nnnnnnnnn",
  "w.rrrrr..",
  "w.rrrrr..",
  "w.rrrrr..",
  "w.rrrrr..",
  "w,rrrrr..",
  "w,,......",
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
 * 7x6). Four lit pads mark the mast anchors; the platform's parapet
 * runs the north and west edges as a concrete lip.
 */
const relayCrownLegend: Record<string, LegendEntry> = {
  ".": { tile: "pavement" },
  ",": { tile: "pavement-cracked" },
  "=": { tile: "plaza-glow" },
  n: { tile: "quay-n" },
  w: { tile: "quay-w" },
};

const relayCrownRows = [
  "nnnnnnn",
  "w.=.=..",
  "w......",
  "w.=.=..",
  "w.....,",
  "w....,,",
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
 * climax variants (9x7). The core's machine deck sits at the center in
 * corroded plate, four glow arcs marking the ring's quadrant lights,
 * with a swept concrete walkway all round.
 */
const cyclerFloorLegend: Record<string, LegendEntry> = {
  ".": { tile: "pavement" },
  "=": { tile: "plaza-glow" },
  r: { tile: "rust-floor" },
};

const cyclerFloorRows = [
  ".........",
  ".==...==.",
  ".=rrrrr=.",
  "..rrrrr..",
  ".=rrrrr=.",
  ".==...==.",
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
  // The Locus's chamber: corporate carpet baseboard-trimmed on all four
  // walls — the sealed room at the top of the tower — with six glow
  // points tracing the ring the Locus stands in.
  ".": { tile: "office-floor" },
  n: { tile: "office-floor-n" },
  e: { tile: "office-floor-e" },
  s: { tile: "office-floor-s" },
  w: { tile: "office-floor-w" },
  "=": { tile: "plaza-glow" },
};

const spireCrownRows = [
  "nnnnnnnnn",
  "w..=.=..e",
  "w.......e",
  "w=.....=e",
  "w.......e",
  "w..=.=..e",
  "wssssssss",
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
