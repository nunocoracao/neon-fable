/**
 * Isometric map content: seven explorable maps (the Cinder Row hub, the
 * Greywater Steps settlement, the Exchange ventworks, the Auric Spire's
 * concourse and executive floor, the Vertical Market, and the Flooded
 * Quays) and the combat arenas the encounters fight on. Maps are
 * authored as character rows expanded through buildMapGrid;
 * interactables reference story node and encounter ids by string only —
 * the iso layer never resolves them.
 *
 * Every map is dressed from the native hi-res tile and prop
 * vocabulary, and each carries its own material identity: the hub is
 * neon and lived-in, Greywater is damp and salvaged, the Ventworks is
 * swept industrial-corporate, the Vertical Market is crowded scaffold
 * and lamplight, the Flooded Quays are plate walkways over black water,
 * and the Spire's two interior floors are polished stone behind a glass
 * curtain wall. Arenas stay deliberately quiet — see the arena
 * section's note.
 *
 * Interiors differ from districts in two data-visible ways: they are
 * drawn without the tenement wall prop (the far faces are glazing, the
 * near two edges are left open) and they declare their own weather and
 * hour, because a sealed floor's light does not care what the sky is
 * doing.
 */
import { buildMapGrid, type IsoMap, type LegendEntry } from "../iso/tilemap";
import {
  DREDGE_VISUAL,
  FERROW_VISUAL,
  FLICK_VISUAL,
  LIN_VISUAL,
  MARROW_VISUAL,
  QUILL_VISUAL,
  SPIRE_SECURITY_VISUAL,
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
      // A door the story sends you through: worth a minimap pip.
      minimap: true,
    },
    {
      id: "canal-lock",
      // The lockgate at the head of the storm canal, against the east
      // wall where the water leaves the plaza — and the way down to the
      // dockland it ends up in.
      x: 14,
      y: 1,
      label: "Lockgate",
      spriteId: "exit",
      interaction: { kind: "dialogue", nodeId: "fq-lock" },
      exit: { mapId: "flooded-quays" },
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
      id: "market-gate",
      // The gantry stair out of the wet-market corner, on the curb
      // beside the stall row — the way up into the Vertical Market.
      x: 12,
      y: 9,
      label: "Market Gate",
      spriteId: "exit",
      interaction: { kind: "dialogue", nodeId: "vm-gate" },
      exit: { mapId: "vertical-market" },
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
    // Where the tram and the Chainwell stair put you down: on the
    // street under the curb, looking up into the plaza.
    { id: "south-road", x: 7, y: 12, facing: "n" },
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
  // The Cinder Row overline: the district's one piece of working
  // infrastructure, a maglev rake sweeping the skyline every half a
  // minute or so and gone the rest of the time. It runs on row -1 —
  // off the grid, one row behind the north terrace — which is the
  // whole trick: painter's order puts everything on row 0 in front of
  // it, so the train emerges past the west wall, crosses above the
  // rooftops with its underside behind them, and is swallowed by the
  // east wall on the way out. Nothing about the plaza changes when it
  // passes; it is a thing happening over the player's head.
  //
  // The pumps under the plaza cycle on their own schedule, and the one
  // stack on the square is where they let go.
  setPieces: {
    trains: [
      {
        id: "cinder-overline",
        row: -1,
        fromX: -8,
        toX: 24,
        cars: 3,
        heightPx: 62,
        periodMs: 27_000,
        crossMs: 7_600,
        // Not at t = 0: the first crossing should catch the player
        // already standing in the plaza, not greet them on arrival.
        offsetMs: 5_000,
      },
    ],
    vents: { periodMs: 5_600, chance: 0.4 },
  },
  // Cinder Row keeps working hours. The player meets the Sprawl at the
  // end of the day, with the last warm light still coming off the
  // towers and the signage only starting to win — the softest the hub
  // ever looks, and the baseline the story's later hours read against.
  dayPhase: "dusk",
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
      // A door the story sends you through: worth a minimap pip.
      minimap: true,
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
      // A door the story sends you through: worth a minimap pip.
      minimap: true,
    },
    {
      id: "chainwell-stair",
      x: 10,
      y: 1,
      label: "Chainwell Stair",
      spriteId: "exit",
      interaction: { kind: "dialogue", nodeId: "a1-ascend" },
      // The climb back up to Cinder Row: arrivals come out on the road
      // below the plaza, the way anyone walking up the Steps would.
      exit: { mapId: "cinder-plaza", entryId: "south-road" },
    },
  ],
  spawns: [{ id: "player-start", x: 7, y: 9 }],
  // Greywater is a settlement, not a thoroughfare: a few residents
  // crossing the walk between the cistern and the court, no more.
  ambient: {
    count: 4,
    zones: [{ id: "walk", x: 1, y: 4, width: 9, height: 4 }],
  },
  // Greywater's pump stacks work hardest and are hit by the rain the
  // whole time, so the Steps steam far more than anywhere else: a
  // tighter window and a higher share of it, raised again by the wet
  // (see VENT_RAIN_FACTOR). No overline reaches this far under, and
  // nothing patrols a settlement Auric has written off.
  setPieces: {
    vents: { periodMs: 4_200, chance: 0.45 },
  },
  // The quayside district is where it always rains: water off the
  // cistern, puddles standing in the cracked slabs, the court's neon
  // pooling in them. Visual only — the fights and the story here play
  // exactly as they do under a clear sky.
  weather: "rain",
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
      // A door the story sends you through: worth a minimap pip.
      minimap: true,
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
      exit: { mapId: "cinder-plaza", entryId: "south-road" },
    },
  ],
  spawns: [{ id: "player-start", x: 7, y: 9 }],
  // A utility floor on shift: a sparse trickle of vent crew between the
  // cycler galleries. Auric's floor is worked, not strolled.
  ambient: {
    count: 3,
    zones: [{ id: "cycler-lane", x: 3, y: 4, width: 6, height: 4 }],
  },
  // The Ventworks is named for the stacks: they blow off constantly and
  // in the dry, which is the district's whole sound.
  setPieces: {
    vents: { periodMs: 3_400, chance: 0.55 },
  },
};

/**
 * Auric Spire — Crown Concourse. The Combine's headquarters tower on the
 * night of the Succession, and the first true interior in the game: the
 * atrium at its foot, with the registry gate on the light spine, the
 * riser doors set into the north wall, and the muster crowd pressing in
 * off the plaza. Dressed to read sterile — the opposite of every other
 * map in the game. Polished stone flags with a brass inlay run, a glass
 * curtain wall closing the north and west faces (the near two edges are
 * left open, the way an interior is drawn, so nothing hides behind a
 * wall sprite), service columns where a district would stand a lamp,
 * planters nobody is allowed to touch, and a glazed screen marshalling
 * the registry queue. Nothing is broken, nothing is discarded, nothing
 * leaks.
 *
 * The map id predates the interior set and is deliberately kept: saves
 * written before this floor was re-dressed name it, and a save that
 * names a map that no longer exists is a save that loads into the hub.
 *
 * Act 3's converging spine plays out here; reached via travel effects
 * from the finale's openings, and connected upward to the executive
 * floor by the riser beside the crown lift.
 */
const spireLegend: Record<string, LegendEntry> = {
  // Structural core: the near edges of the room, left as dark fill so a
  // wall sprite never stands between the camera and the floor.
  "#": { tile: "foundation" },
  // The curtain wall: the tower's glass skin, closing the far faces —
  // panes along the north face, and the same pane turned onto the other
  // axis down the west one.
  G: { tile: "foundation", prop: { propId: "glass-partition-x", blocks: true } },
  H: { tile: "foundation", prop: { propId: "glass-partition-y", blocks: true } },
  ".": { tile: "atrium-floor" },
  n: { tile: "atrium-floor-n" },
  e: { tile: "atrium-floor-e" },
  s: { tile: "atrium-floor-s" },
  w: { tile: "atrium-floor-w" },
  "=": { tile: "plaza-glow" },
  R: { tile: "atrium-floor", prop: { propId: "reception-desk", blocks: true } },
  S: { tile: "atrium-floor", prop: { propId: "server-column", blocks: true } },
  P: { tile: "atrium-floor", prop: { propId: "planter-column", blocks: true } },
  g: { tile: "atrium-floor", prop: { propId: "glass-partition-x", blocks: true } },
};

const spireRows = [
  "GGGGGGGGGGGGGG",
  "Hnnnnnnnnnnnn#",
  "HwP..R.=...Pe#",
  "Hw.....=....e#",
  "Hw.ggg.=....e#",
  "HwS....=....e#",
  "Hw.....=....e#",
  "HwS....=....e#",
  "Hw..........e#",
  "Hw.........Pe#",
  "Hssssssssssss#",
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
      // A door the story sends you through: worth a minimap pip.
      minimap: true,
    },
    {
      id: "exec-lift",
      // The second riser in the north wall — the one with no call
      // button on the concourse side, because it does not answer to
      // the concourse.
      x: 9,
      y: 1,
      label: "Executive Riser",
      spriteId: "door",
      interaction: { kind: "dialogue", nodeId: "a3-exec-lift" },
      exit: { mapId: "auric-executive" },
    },
    {
      id: "registry-gate",
      x: 7,
      y: 3,
      label: "Registry Gate",
      spriteId: "door",
      interaction: { kind: "dialogue", nodeId: "a3-gate" },
      // A door the story sends you through: worth a minimap pip.
      minimap: true,
    },
    {
      id: "spire-security",
      // Standing off the gate's queue, where the tower can see you and
      // you can see it deciding.
      x: 8,
      y: 4,
      label: "Spire Security",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "a3-security" },
      visual: SPIRE_SECURITY_VISUAL,
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
      exit: { mapId: "cinder-plaza", entryId: "south-road" },
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
  // Interiors declare their own sky and their own hour. The concourse
  // is sealed behind the curtain wall, so no weather reaches it, and it
  // runs at the cold small-hours light the whole act walks toward
  // whatever the story has staged on the street outside.
  weather: "clear",
  dayPhase: "late",
};

/**
 * Auric Spire — Executive Floor. The second of the tower's two
 * interiors and the other end of the riser: the directors' own level,
 * ninety floors up, where the Succession was voted through by people
 * who then went home. Black stone polished until the light on it is the
 * only texture, glazed cells partitioning the plan into offices nobody
 * is sitting in tonight, timber desks with their ledger panes still
 * lit, a service column keeping the floor's registers alive, and one
 * planter kept alive by contract.
 *
 * The floor is optional, and deliberately so: the finale's spine runs
 * through the concourse and the crown, and this is what a player who
 * pushes on a door finds — the tower's own paperwork, a checkpoint that
 * can be talked past or fought through, and a safe.
 *
 * Interiors declare their own hour. Ninety floors of curtain wall face
 * the same dark the concourse does, and the building's light does not
 * care what the sky is doing, so both floors play at the same late hour
 * whatever the story has staged outside.
 */
const executiveLegend: Record<string, LegendEntry> = {
  "#": { tile: "foundation" },
  G: { tile: "foundation", prop: { propId: "glass-partition-x", blocks: true } },
  H: { tile: "foundation", prop: { propId: "glass-partition-y", blocks: true } },
  ".": { tile: "exec-floor" },
  n: { tile: "exec-floor-n" },
  s: { tile: "exec-floor-s" },
  w: { tile: "exec-floor-w" },
  D: { tile: "exec-floor", prop: { propId: "exec-desk", blocks: true } },
  S: { tile: "exec-floor", prop: { propId: "server-column", blocks: true } },
  P: { tile: "exec-floor", prop: { propId: "planter-column", blocks: true } },
  g: { tile: "exec-floor", prop: { propId: "glass-partition-x", blocks: true } },
};

const executiveRows = [
  "GGGGGGGGGGGGG",
  "Hnnnnnnnnnnn#",
  "Hw.D.ggg.D..#",
  "Hw..........#",
  "HwS.......P.#",
  "Hw..........#",
  "Hwgg....gg..#",
  "Hw..........#",
  "Hw..........#",
  "#sssssssssss#",
  "#############",
];

const executiveGrid = buildMapGrid(executiveLegend, executiveRows);

const auricExecutive: IsoMap = {
  id: "auric-executive",
  name: "Auric Spire — Executive Floor",
  width: executiveGrid.width,
  height: executiveGrid.height,
  tiles: executiveGrid.tiles,
  props: executiveGrid.props,
  interactables: [
    {
      id: "director-desk",
      // The corner station, its ledger pane still open on the night's
      // business.
      x: 9,
      y: 3,
      label: "Director's station",
      spriteId: "terminal",
      interaction: { kind: "dialogue", nodeId: "a3-exec-desk" },
    },
    {
      id: "exec-security",
      // Posted between the riser and the offices, which is the whole
      // job.
      x: 4,
      y: 7,
      label: "Floor Security",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "a3-exec-checkpoint" },
      visual: SPIRE_SECURITY_VISUAL,
    },
    {
      id: "exec-safe",
      x: 2,
      y: 8,
      label: "Executive lockbox",
      spriteId: "stash",
      interaction: { kind: "dialogue", nodeId: "a3-exec-cache" },
    },
    {
      id: "exec-lift-down",
      // The riser doors, on the lobby the lift opens onto.
      x: 6,
      y: 8,
      label: "Executive Riser",
      spriteId: "door",
      interaction: { kind: "dialogue", nodeId: "a3-exec-descend" },
      exit: { mapId: "auric-spire" },
    },
  ],
  // The riser puts you down on the lift lobby's own apron, facing in.
  spawns: [{ id: "player-start", x: 6, y: 9 }],
  // Two people still on the floor at this hour: the analysts nobody
  // sent home. Fewer than anywhere else in the game bar the quays.
  ambient: {
    count: 2,
    zones: [{ id: "floor", x: 1, y: 6, width: 10, height: 3 }],
  },
  // Interiors declare their own sky and their own hour: no weather
  // reaches ninety floors up behind sealed glass, and the building
  // keeps the same cold light whatever the story stages outside.
  weather: "clear",
  dayPhase: "late",
};

/**
 * The Vertical Market — a bazaar stacked into a light well off Cinder
 * Row's wet-market corner, and the densest street in the game. Scaffold
 * decking (rust plate) runs the north gallery and the south landing
 * where the stair comes up; between them two stall rows face each other
 * across a lantern court of glow tile, strung with caged lamps. The
 * aisles are dressed with awnings, crate stacks, and a noodle counter
 * working the west wall; signage hangs over the north gallery. Reached
 * both ways on foot — the hub's market gate up, the market's stair back
 * down — so it is the first district the player can simply visit.
 */
const marketLegend: Record<string, LegendEntry> = {
  "#": { tile: "foundation", prop: { propId: "building", blocks: true } },
  ".": { tile: "pavement" },
  ",": { tile: "pavement-cracked" },
  // Scaffold decking: the market's walkways are laid over plate.
  r: { tile: "rust-floor" },
  // The lantern court at the crossing of the two aisles.
  "=": { tile: "plaza-glow" },
  A: { tile: "pavement", prop: { propId: "stall-awning", blocks: true } },
  a: { tile: "rust-floor", prop: { propId: "stall-awning", blocks: true } },
  K: { tile: "pavement", prop: { propId: "crate-stack", blocks: true } },
  U: { tile: "pavement", prop: { propId: "noodle-counter", blocks: true } },
  // Caged lamps hang off the scaffolding — walk under them.
  C: { tile: "pavement", prop: { propId: "cage-lamp", blocks: false } },
  R: { tile: "rust-floor", prop: { propId: "cage-lamp", blocks: false } },
  u: { tile: "pavement", prop: { propId: "cable-bundle", blocks: false } },
  s: { tile: "pavement", prop: { propId: "shop-sign", blocks: true } },
  N: { tile: "pavement", prop: { propId: "neon-sign", blocks: true } },
  h: { tile: "pavement", prop: { propId: "holo-sign", blocks: true } },
  x: { tile: "pavement", prop: { propId: "crate", blocks: true } },
  l: { tile: "pavement", prop: { propId: "streetlight", blocks: true } },
};

const marketRows = [
  "##################",
  "#arrRr.N..s.rRrra#",
  "#rrrrr,....,rrrrr#",
  "#.,.....u...,....#",
  "#A.K.A.h...A.K.A.#",
  "#...,....,.......#",
  "#U...C.===.C...x.#",
  "#..,..===........#",
  "#....C.===.C....,#",
  "#A.K.A..u..A.K.A.#",
  "#.,........,.....#",
  "#rrr,........,rrr#",
  "#rr..l......l..rr#",
  "##################",
];

const marketGrid = buildMapGrid(marketLegend, marketRows);

const verticalMarket: IsoMap = {
  id: "vertical-market",
  name: "The Vertical Market",
  width: marketGrid.width,
  height: marketGrid.height,
  tiles: marketGrid.tiles,
  props: marketGrid.props,
  interactables: [
    {
      id: "market-consignment",
      x: 14,
      y: 2,
      label: "Consignment locker",
      spriteId: "stash",
      interaction: { kind: "dialogue", nodeId: "vm-stash" },
    },
    {
      id: "stall-broker",
      // Working the north stall row, one aisle in from her awning.
      x: 4,
      y: 5,
      label: "Quill — stall broker",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "vm-broker" },
      visual: QUILL_VISUAL,
    },
    {
      id: "market-fixer",
      // Holding court at the noodle counter, back to the wall.
      x: 2,
      y: 7,
      label: "Marrow",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "vm-fixer" },
      visual: MARROW_VISUAL,
    },
    {
      id: "market-stair",
      x: 8,
      y: 11,
      label: "Cinderway Stair",
      spriteId: "exit",
      interaction: { kind: "dialogue", nodeId: "vm-stair" },
      // Back down to the plaza the way you came: out on the road under
      // the curb, looking up into Cinder Row.
      exit: { mapId: "cinder-plaza", entryId: "south-road" },
    },
  ],
  // The stair lands you on the south deck, facing up the aisle.
  spawns: [{ id: "player-start", x: 8, y: 12 }],
  // The busiest street in the game, and the reason to build it: four
  // zones of foot traffic — the north gallery, both stall rows, and the
  // landing — dealt round-robin so the market never reads empty
  // anywhere the player is standing.
  ambient: {
    count: 12,
    zones: [
      { id: "gallery", x: 2, y: 2, width: 11, height: 2 },
      { id: "north-stalls", x: 2, y: 5, width: 12, height: 2 },
      { id: "lantern-court", x: 5, y: 7, width: 8, height: 2 },
      { id: "landing", x: 2, y: 10, width: 12, height: 2 },
    ],
  },
  // Two Combine drones quartering the boards — the market is watched
  // the way a place that pays no tax gets watched. They fly the long
  // rectangle over the aisles on the same beat, half a circuit apart,
  // so one is always somewhere over the crowd. Scenery: they cannot be
  // reached, spoken to, or fought, and nothing they pass over changes.
  setPieces: {
    drones: [
      {
        id: "market-warden-a",
        waypoints: [
          { x: 3, y: 3 },
          { x: 14, y: 3 },
          { x: 14, y: 10 },
          { x: 3, y: 10 },
        ],
        speed: 1.7,
        heightPx: 38,
      },
      {
        id: "market-warden-b",
        waypoints: [
          { x: 3, y: 3 },
          { x: 14, y: 3 },
          { x: 14, y: 10 },
          { x: 3, y: 10 },
        ],
        speed: 1.7,
        heightPx: 44,
        // Half a lap behind: 38 tiles of circuit at 1.7 tiles/s.
        offsetMs: 11_000,
      },
    ],
  },
  // Trading hours: the market only comes alive after dark, and it is
  // roofed by the levels above it — no weather reaches the boards.
  weather: "clear",
  dayPhase: "night",
};

/**
 * The Flooded Quays — the dockland the Sprawl gave up on, three levels
 * under Cinder Row where the storm canal widens into a basin nobody
 * pumps out any more. There is no ground here worth the name: a wharf
 * strip along the north wall, a strand along the south, and between
 * them open black water crossed by two plate walkways and the catwalk
 * that joins them amidships. Every route funnels onto those spans —
 * the pathfinder does the funnelling for free, because the water
 * either side of them simply is not walkable.
 *
 * Half-sunk against the eastern bank lies a salvage lighter, a set
 * piece three tiles of hull by two: the game's first prop whose bulk
 * needs a footprint, and the thing the district is named for as much
 * as the water is. Rain falls on all of it in the small hours, so the
 * basin, the puddles standing on the boards, and the lamps working
 * against both are doing the reflection pass' whole job at once — this
 * is the map that shows weather and water together.
 *
 * Reached from the hub and nowhere else: the lock at the head of Cinder
 * Row's storm canal, down and back. The Vertical Market is two levels
 * up the same shaft with no way between that isn't the plaza, so the
 * hub stays the junction and travel reads as one hop from home.
 */
const quaysLegend: Record<string, LegendEntry> = {
  "#": { tile: "foundation", prop: { propId: "building", blocks: true } },
  ".": { tile: "pavement" },
  ",": { tile: "pavement-cracked" },
  "~": { tile: "canal" },
  D: { tile: "canal-deep" },
  // Plate decking: the walkway spans and the catwalk laid over water.
  r: { tile: "rust-floor" },
  // The wharf's lip along the north bank, and the strand's along the
  // south — every tile of shore in this district is a quay edge.
  s: { tile: "quay-s" },
  n: { tile: "quay-n" },
  // Bollards, set along both banks where the barges used to tie up.
  P: { tile: "quay-s", prop: { propId: "mooring-post", blocks: true } },
  Q: { tile: "quay-n", prop: { propId: "mooring-post", blocks: true } },
  // Salvage waiting on a buyer: on the boards out at the platform, and
  // stacked along the strand.
  W: { tile: "rust-floor", prop: { propId: "salvage-tarp", blocks: true } },
  T: { tile: "pavement", prop: { propId: "salvage-tarp", blocks: true } },
  // The one lamp standing out over the water, and the strand's own.
  L: { tile: "rust-floor", prop: { propId: "streetlight", blocks: true } },
  l: { tile: "pavement", prop: { propId: "streetlight", blocks: true } },
  N: { tile: "pavement", prop: { propId: "neon-sign", blocks: true } },
  h: { tile: "pavement", prop: { propId: "holo-sign", blocks: true } },
  c: { tile: "pavement", prop: { propId: "crate", blocks: true } },
  t: { tile: "pavement", prop: { propId: "trash-heap", blocks: true } },
  u: { tile: "pavement", prop: { propId: "cable-bundle", blocks: false } },
};

const quaysRows = [
  "################",
  "#.,..l......ht.#",
  "#ssPssssssPssss#",
  "#DD~r~~~~~~r~DD#",
  "#D~~r~~~~~~r~~D#",
  "#~~~r~~~~~~r~~~#",
  "#~~~r~~~~~~r~~~#",
  "#~~~rrrrrrrr~~~#",
  "#~~~r~LrrW~r~~~#",
  "#~~~r~~~~~~r~~~#",
  "#D~~r~~~~~~r~~D#",
  "#nQnnnnnQnnnnnn#",
  "#.l..T....l.N..#",
  "#...,.cu..T....#",
  "################",
];

const quaysGrid = buildMapGrid(quaysLegend, quaysRows);

const floodedQuays: IsoMap = {
  id: "flooded-quays",
  name: "The Flooded Quays",
  width: quaysGrid.width,
  height: quaysGrid.height,
  tiles: quaysGrid.tiles,
  props: [
    ...quaysGrid.props,
    // The salvage lighter, aground across the eastern end of the south
    // bank: stern on the quay lip, bow and hold under the water. Placed
    // by hand rather than by legend character because its bulk covers
    // six tiles — the near one it is written on, and the five behind.
    {
      propId: "sunken-barge",
      x: 14,
      y: 11,
      blocks: true,
      footprint: [
        { x: -1, y: 0 },
        { x: -2, y: 0 },
        { x: 0, y: -1 },
        { x: -1, y: -1 },
        { x: -2, y: -1 },
      ],
    },
  ],
  interactables: [
    {
      id: "quays-tide-board",
      // Bolted to the wharf wall where the lock crews used to read it.
      x: 8,
      y: 1,
      label: "Tide Board",
      spriteId: "terminal",
      interaction: { kind: "dialogue", nodeId: "fq-board" },
    },
    {
      id: "quays-diver",
      // Out on the salvage platform, where the catwalk widens.
      x: 7,
      y: 8,
      label: "Dredge",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "fq-diver" },
      visual: DREDGE_VISUAL,
    },
    {
      id: "quays-cage",
      // Chained off the strand under the wrecked barge's stern.
      x: 13,
      y: 12,
      label: "Salvage cage",
      spriteId: "stash",
      interaction: { kind: "dialogue", nodeId: "fq-cage" },
    },
    {
      id: "quays-lock",
      x: 8,
      y: 12,
      label: "Lockgate Stair",
      spriteId: "exit",
      interaction: { kind: "dialogue", nodeId: "fq-stair" },
      // Back up the canal the way you came down it, out on the road
      // below Cinder Row's curb.
      exit: { mapId: "cinder-plaza", entryId: "south-road" },
    },
  ],
  // The lock stair puts you down on the strand, facing the water.
  spawns: [{ id: "player-start", x: 8, y: 13 }],
  // Nobody lives here and nobody is passing through: a couple of people
  // working the strand, a couple more up on the wharf, and the water in
  // between. Sparser than anywhere else in the game on purpose.
  ambient: {
    count: 5,
    zones: [
      { id: "strand", x: 1, y: 11, width: 14, height: 3 },
      { id: "wharf", x: 1, y: 1, width: 14, height: 2 },
    ],
  },
  // One drone sweeping the basin, slow and low over open water — the
  // dockland is not worth two, and the only thing down here anyone
  // still checks on is whether the water has moved. Its scan cone on
  // the black canal is the one light out there besides the mast lamp.
  setPieces: {
    drones: [
      {
        id: "quays-sweeper",
        waypoints: [
          { x: 5, y: 4 },
          { x: 11, y: 5 },
          { x: 10, y: 10 },
          { x: 4, y: 9 },
        ],
        speed: 1.2,
        heightPx: 32,
        offsetMs: 4_000,
      },
    ],
  },
  // It rains on the quays the way it rains on Greywater, and for the
  // same reason: this is where the water is. Here it also has open
  // canal to fall into and lamps standing over it, which is the whole
  // point of the map.
  weather: "rain",
  // The small hours, when the basin is black and the only things
  // burning are the wharf signage and one lamp on a wrecked mast.
  dayPhase: "late",
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

/**
 * Executive Floor — the directors' own plan cleared for a fight
 * (enc-exec-security, 9x7). The tower's arena: black stone the width of
 * the room, trimmed to the wall on all four sides because a sealed
 * floor is exactly what it is, with the two light channels the offices
 * are lit by running across it. The quietest arena in the game, which
 * is the point — up here nothing is improvised, including the violence.
 */
const execArenaLegend: Record<string, LegendEntry> = {
  ".": { tile: "exec-floor" },
  n: { tile: "exec-floor-n" },
  e: { tile: "exec-floor-e" },
  s: { tile: "exec-floor-s" },
  w: { tile: "exec-floor-w" },
  "=": { tile: "plaza-glow" },
};

const execArenaRows = [
  "nnnnnnnnn",
  "w..===..e",
  "w.......e",
  "w.......e",
  "w.......e",
  "w..===..e",
  "wssssssss",
];

const execArenaGrid = buildMapGrid(execArenaLegend, execArenaRows);

const execFloorArena: IsoMap = {
  id: "exec-floor-arena",
  name: "The Executive Floor",
  width: execArenaGrid.width,
  height: execArenaGrid.height,
  tiles: execArenaGrid.tiles,
  props: execArenaGrid.props,
  interactables: [],
  spawns: [{ id: "player-start", x: 1, y: 3 }],
};

/**
 * Scaffold Row — a cleared stretch of the Vertical Market's walkways
 * (enc-market-scaffold, 9x7). The market's own arena: scaffold decking
 * runs the outer ring where the stalls and boards crowd in, a band of
 * broken concrete inside it, and a swept trading floor at the center —
 * the one patch of the district with room to swing.
 */
const marketScaffoldLegend: Record<string, LegendEntry> = {
  ".": { tile: "pavement" },
  ",": { tile: "pavement-cracked" },
  r: { tile: "rust-floor" },
};

const marketScaffoldRows = [
  "rrrrrrrrr",
  "rr,,,,,rr",
  "r,.....,r",
  "r,.....,r",
  "r,.....,r",
  "rr,,,,,rr",
  "rrrrrrrrr",
];

const marketScaffoldGrid = buildMapGrid(marketScaffoldLegend, marketScaffoldRows);

const marketScaffoldArena: IsoMap = {
  id: "market-scaffold-arena",
  name: "Scaffold Row",
  width: marketScaffoldGrid.width,
  height: marketScaffoldGrid.height,
  tiles: marketScaffoldGrid.tiles,
  props: marketScaffoldGrid.props,
  interactables: [],
  spawns: [{ id: "player-start", x: 1, y: 3 }],
};

/**
 * Lockgate Walkway — a cleared span out on the Flooded Quays
 * (enc-quays-salvage, 9x7). The quays' own arena: a plate walkway down
 * the middle where the fight funnels, wet concrete banks either side,
 * and the canal lip along the north and west edges where the boards
 * run out. Chokepoints in how it reads, an even grid in what it is —
 * the engine has no obstacle rules, so the pinch has to be drawn, not
 * built.
 */
const quaysWalkwayLegend: Record<string, LegendEntry> = {
  ".": { tile: "pavement" },
  ",": { tile: "pavement-cracked" },
  r: { tile: "rust-floor" },
  n: { tile: "quay-n" },
  w: { tile: "quay-w" },
};

const quaysWalkwayRows = [
  "nnnnnnnnn",
  "w..rrr...",
  "w..rrr...",
  "w,.rrr..,",
  "w..rrr...",
  "w,,rrr,,,",
  "w,,,,,,,,",
];

const quaysWalkwayGrid = buildMapGrid(quaysWalkwayLegend, quaysWalkwayRows);

const quaysWalkwayArena: IsoMap = {
  id: "quays-walkway-arena",
  name: "Lockgate Walkway",
  width: quaysWalkwayGrid.width,
  height: quaysWalkwayGrid.height,
  tiles: quaysWalkwayGrid.tiles,
  props: quaysWalkwayGrid.props,
  interactables: [],
  spawns: [{ id: "player-start", x: 1, y: 3 }],
};

export const maps: readonly IsoMap[] = [
  cinderPlaza,
  greywaterSteps,
  exchangeVentworks,
  auricSpire,
  auricExecutive,
  verticalMarket,
  floodedQuays,
  rustyardArena,
  undercroftArena,
  vaultArena,
  pumpworksArena,
  relayCrownArena,
  cyclerFloorArena,
  spireCrownArena,
  execFloorArena,
  marketScaffoldArena,
  quaysWalkwayArena,
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
