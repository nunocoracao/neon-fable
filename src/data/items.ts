import { InventoryError, type Item } from "../inventory/items";

/**
 * Item content. Every item id referenced anywhere (background starting
 * gear, story rewards, shop stock) must resolve here. Enhancements must
 * carry a genuine trade-off — a negative effect on top of their neural
 * cost — never be pure stat sticks.
 */
export const items: Item[] = [
  // --- Weapons ---
  {
    id: "wpn-shard-knife",
    kind: "weapon",
    name: "Shard Knife",
    description:
      "A courier's blade ground from mirror-glass polymer. Light enough " +
      "to move with, sharp enough to end an argument.",
    damage: 4,
    rangeType: "melee",
    weaponLayer: { id: "blade" },
    sockets: ["grip"],
    effects: [{ type: "stat-mod", stat: "reflexes", amount: 1 }],
  },
  {
    id: "wpn-compact-pistol",
    kind: "weapon",
    name: "Compact Pistol",
    description:
      "A discreet Auric-issue sidearm, printed serial long since burned " +
      "off. Kicks harder than its size suggests.",
    damage: 5,
    rangeType: "ranged",
    requirement: { stat: "reflexes", value: 5 },
    weaponLayer: { id: "pistol" },
    sockets: ["barrel"],
    effects: [],
  },
  {
    id: "wpn-stun-baton",
    kind: "weapon",
    name: "Stun Baton",
    description:
      "A diver's boarding tool: a collapsed rod that unfolds crackling. " +
      "Made for dropping people, not killing them.",
    damage: 3,
    rangeType: "melee",
    // Stun coils crackle hologram-blue at the rod tip.
    weaponLayer: { id: "baton", accent: "hologramBlue" },
    sockets: ["core"],
    effects: [{ type: "grant-ability", abilityId: "ability-stun-strike" }],
  },
  // --- Outfits ---
  {
    id: "out-courier-slicker",
    kind: "outfit",
    name: "Courier Slicker",
    description:
      "A rain-shedding wrap with kevlar thread through the seams. Made " +
      "for running the underlevels without snagging.",
    armor: 2,
    // Authored channels: dark fabric with the magenta courier closure.
    outfitLayer: { id: "slicker" },
    effects: [{ type: "stat-mod", stat: "reflexes", amount: 1 }],
  },
  {
    id: "out-spire-suit",
    kind: "outfit",
    name: "Spire Suit",
    description:
      "Tailored tower formalwear with a ballistic weave liner. Opens " +
      "doors in rooms where a gun would close them.",
    armor: 1,
    // Chrome trim: the lapel line and tie pin read corp-polished.
    outfitLayer: { id: "suit", accent: "brushedChrome" },
    effects: [
      { type: "stat-mod", stat: "cool", amount: 1 },
      { type: "unlock-dialogue", tag: "corp-formal" },
    ],
  },
  {
    id: "out-diver-harness",
    kind: "outfit",
    name: "Diver Harness",
    description:
      "A rig harness studded with jack points and cable spools. Ugly, " +
      "padded, and wired for the Weave.",
    armor: 1,
    // Hazard-amber clips and jack points over the base garb.
    outfitLayer: { id: "harness", accent: "hazardAmber" },
    effects: [{ type: "stat-mod", stat: "tech", amount: 1 }],
  },
  {
    id: "wpn-arc-lash",
    kind: "weapon",
    name: "Arc Lash",
    description:
      "A vent-crew tool repurposed with intent: a spool of live cable that " +
      "cracks like a whip and bites like a fuse box.",
    damage: 6,
    rangeType: "ranged",
    requirement: { stat: "tech", value: 5 },
    // Live cable burns hazard-amber down the whip's arc.
    weaponLayer: { id: "lash", accent: "hazardAmber" },
    sockets: ["core", "grip"],
    effects: [],
  },
  {
    // Vesper Kade's own, and the reason she still has both hands: a
    // salvage grapnel thrown on a monofil line and walked back in.
    // Never sold anywhere — she brings it with her (see ./companions).
    id: "wpn-hookline",
    kind: "weapon",
    name: "Hookline",
    description:
      "Four folding flukes on sixty metres of monofil, thrown by a wrist " +
      "spool that was built to lift drum motors off a canal floor. It " +
      "does not care that you are not a drum motor.",
    damage: 6,
    rangeType: "ranged",
    requirement: { stat: "reflexes", value: 5 },
    // Cold cyan running lights down the spool housing.
    weaponLayer: { id: "lash", accent: "neonCyan" },
    sockets: ["core", "grip"],
    effects: [],
  },
  {
    // Deacon Sill's, and the only thing he took with him when Auric
    // struck him off: a compliance seal, built to fire a numbered tag
    // into a crate nobody was supposed to be able to close again.
    // Never sold anywhere — he brings it with him (see ./companions).
    id: "wpn-writ-seal",
    kind: "weapon",
    name: "Writ Seal",
    description:
      "An auditor's sealing tool: a numbered evidence tag driven down a " +
      "guide wire hard enough to set in plate. Everything it touches is " +
      "logged, timestamped, and, at this distance, bleeding.",
    damage: 6,
    rangeType: "ranged",
    requirement: { stat: "intelligence", value: 5 },
    // Held like the sidearm it is not: chrome housing, no glow — an
    // office tool with a trigger, which is the whole joke of it.
    weaponLayer: { id: "pistol" },
    sockets: ["barrel", "core"],
    effects: [],
  },
  // --- Tier-2 gear (Act 2+ shops and rewards; steep prices, stiff
  // stat requirements — not meant to be reachable on Act 1 money) ---
  {
    id: "wpn-rail-spitter",
    kind: "weapon",
    name: "Rail Spitter",
    description:
      "A coil-fed pistol built around a salvaged mag-lev governor. It " +
      "doesn't bark, it exhales — and something downrange sits down.",
    damage: 8,
    rangeType: "ranged",
    requirement: { stat: "reflexes", value: 6 },
    weaponLayer: { id: "pistol" },
    sockets: ["barrel", "core"],
    effects: [],
  },
  {
    id: "wpn-torque-cleaver",
    kind: "weapon",
    name: "Torque Cleaver",
    description:
      "A dock-breaker's blade with a gyro core that swings itself. The " +
      "trick isn't the cut; it's stopping the cut where you meant to.",
    damage: 8,
    rangeType: "melee",
    requirement: { stat: "body", value: 6 },
    weaponLayer: { id: "blade" },
    sockets: ["core", "grip"],
    effects: [],
  },
  {
    id: "wpn-spindle-projector",
    kind: "weapon",
    name: "Spindle Projector",
    description:
      "A vent-crew survey tool retuned past every safety stop: a focused " +
      "resonance beam that finds the seams in things and opens them.",
    damage: 7,
    rangeType: "ranged",
    requirement: { stat: "tech", value: 6 },
    weaponLayer: { id: "rifle" },
    sockets: ["barrel", "core"],
    effects: [{ type: "stat-mod", stat: "tech", amount: 1 }],
  },
  {
    id: "out-cordon-plate",
    kind: "outfit",
    name: "Cordon Plate Rig",
    description:
      "Auric checkpoint plate with the insignia ground off. Heavy enough " +
      "to stop what checkpoints stop, and to slow what checkpoints slow.",
    armor: 4,
    // Worn chrome plating with hazard-striped pauldrons.
    outfitLayer: { id: "plate", primary: "brushedChrome", accent: "hazardAmber" },
    effects: [{ type: "stat-mod", stat: "reflexes", amount: -1 }],
  },
  {
    id: "out-ghostline-mantle",
    kind: "outfit",
    name: "Ghostline Mantle",
    description:
      "A courier-guild longcoat threaded with signal-eating mesh and " +
      "ballistic weave. Rooms remember someone was there, never who.",
    armor: 3,
    // Hologram-blue signal threads down the coat edges.
    outfitLayer: { id: "longcoat", accent: "hologramBlue" },
    effects: [{ type: "stat-mod", stat: "cool", amount: 1 }],
  },
  {
    // The Last Mile's unique reward: a working courier's rig, given
    // away by the courier who stopped needing it. Not armour and never
    // pretending to be — it buys speed with everything it took off.
    id: "out-highline-rig",
    kind: "outfit",
    name: "Highline Rig",
    description:
      "A scaffold courier's running harness, cut down over six levels " +
      "until there was nothing left on it to catch. The clip line is " +
      "spliced in three places, and every splice held.",
    armor: 1,
    // Clip-line splices glow cold blue along the webbing.
    outfitLayer: { id: "harness", accent: "hologramBlue" },
    effects: [
      { type: "stat-mod", stat: "reflexes", amount: 2 },
      { type: "stat-mod", stat: "body", amount: -1 },
    ],
  },
  {
    // Under the Waterline's silent-partner reward: the oilskin the
    // Longshore's tenders wear on the water, handed over the moment
    // you become one. Bought protection, and it reads as bought — the
    // quays know the coat before they know the face in it.
    id: "out-tender-coat",
    kind: "outfit",
    name: "Tender's Oilskin",
    description:
      "A waxed longshore coat, hem still heavy with basin silt. Nothing " +
      "on it says whose it is, which is the point: down here everybody " +
      "already knows, and up top nobody is meant to.",
    armor: 2,
    // Amber tally-marks stitched along the storm flap, one a run.
    outfitLayer: { id: "longcoat", accent: "hazardAmber" },
    effects: [
      { type: "stat-mod", stat: "cool", amount: 2 },
      { type: "stat-mod", stat: "tech", amount: -1 },
    ],
  },
  {
    id: "cyb-warden-optics",
    kind: "enhancement",
    name: "Warden Optics",
    description:
      "Checkpoint-grade replacement eyes: predictive tracking, threat " +
      "lattices, a targeting reticle that never quite blinks off. People " +
      "can tell they're being solved.",
    slot: "eyes",
    neuralCost: 3,
    // The reticle that never blinks off: amber-flaring optics.
    cyberLayer: { id: "optics", accent: "hazardAmber" },
    effects: [
      { type: "stat-mod", stat: "reflexes", amount: 2 },
      { type: "stat-mod", stat: "cool", amount: -1 },
      { type: "unlock-dialogue", tag: "optic-scan" },
    ],
  },
  {
    id: "cyb-torsion-frame",
    kind: "enhancement",
    name: "Torsion Frame",
    description:
      "A load-bearing endoskeletal truss rated for cycler maintenance. " +
      "You stop borrowing strength from your body and start billing it.",
    slot: "arms",
    neuralCost: 4,
    // Precision truss chrome with cyan servo lights.
    cyberLayer: { id: "chrome-arm", accent: "neonCyan" },
    effects: [
      { type: "stat-mod", stat: "body", amount: 2 },
      { type: "stat-mod", stat: "reflexes", amount: 1 },
      { type: "stat-mod", stat: "tech", amount: -1 },
      { type: "grant-ability", abilityId: "ability-crush" },
    ],
  },
  {
    id: "cyb-cascade-governor",
    kind: "enhancement",
    name: "Cascade Governor",
    description:
      "A second-generation cortical lattice that schedules your thoughts " +
      "like freight. Brilliant, tireless — and it files your feelings " +
      "under overhead.",
    slot: "neural",
    neuralCost: 4,
    // Freight-scheduler lattice: the temple port runs amber.
    cyberLayer: { id: "neural-jack", accent: "hazardAmber" },
    effects: [
      { type: "stat-mod", stat: "intelligence", amount: 2 },
      { type: "stat-mod", stat: "tech", amount: 1 },
      { type: "stat-mod", stat: "cool", amount: -1 },
      { type: "unlock-dialogue", tag: "machine-cant" },
    ],
  },
  // --- Weapon mods (fitted at a bench; see src/inventory/mods.ts) ---
  //
  // Every part is a trade: a mod that only gives is a stat stick with
  // a screw thread. The two exceptions earn it another way — the Burst
  // Governor's ability costs the shot it replaces, and the Lattice
  // Rifling's pierce is worth nothing against an unarmored target.
  //
  // Accents are how a modded weapon reads from across the street: the
  // first fitted part with one repaints the weapon layer's energy
  // channel (see modAccent).
  {
    id: "mod-splitbore-choke",
    kind: "mod",
    name: "Splitbore Choke",
    description:
      "A machined muzzle sleeve that lets the gas out sideways instead " +
      "of forward. Everything downrange gets more of the round and less " +
      "of the aim it was fired with.",
    socket: "barrel",
    accent: "hazardAmber",
    effects: [
      { type: "weapon-damage", amount: 2 },
      { type: "accuracy", amount: -1 },
    ],
  },
  {
    id: "mod-lattice-rifling",
    kind: "mod",
    name: "Lattice Rifling",
    description:
      "A liner grown rather than cut, in a crystal lattice that puts a " +
      "spin on the round tight enough to walk it through plate. Against " +
      "a coat it does nothing at all.",
    socket: "barrel",
    accent: "brushedChrome",
    effects: [{ type: "armor-pierce", amount: 2 }],
  },
  {
    id: "mod-smartlink-sight",
    kind: "mod",
    name: "Smartlink Sight",
    description:
      "A ranging head that talks to the hand holding it. It will not " +
      "make the round heavier — it spends a little of the charge doing " +
      "the arithmetic — but it will put it where you looked.",
    socket: "barrel",
    accent: "hologramBlue",
    effects: [
      { type: "accuracy", amount: 3 },
      { type: "weapon-damage", amount: -1 },
    ],
  },
  {
    id: "mod-longspar-extension",
    kind: "mod",
    name: "Longspar Extension",
    description:
      "A bolt-on fore-end that adds a hand's length of guide to the " +
      "throw. Reach costs you the snap: whatever leaves it arrives a " +
      "little tired.",
    socket: "barrel",
    accent: "neonCyan",
    effects: [
      { type: "weapon-range", amount: 2 },
      { type: "weapon-damage", amount: -1 },
    ],
  },
  {
    id: "mod-burst-governor",
    kind: "mod",
    name: "Burst Governor",
    description:
      "A cycle limiter installed backwards. It does not stop the second " +
      "and third rounds; it schedules them. The frame gets a say in this " +
      "and its say is a tremor you learn to shoot through.",
    socket: "core",
    accent: "hazardAmber",
    effects: [
      { type: "grant-ability", abilityId: "ability-burst-fire" },
      { type: "accuracy", amount: -1 },
    ],
  },
  {
    id: "mod-hairline-sear",
    kind: "mod",
    name: "Hairline Sear",
    description:
      "A discharge element wound down to a filament, so what lands lands " +
      "in one place instead of across a hand's width. When it tells, it " +
      "tells early — and it takes a little off everything else.",
    socket: "core",
    accent: "neonCyan",
    effects: [
      { type: "crit-share", amount: -0.09 },
      { type: "weapon-damage", amount: -1 },
    ],
  },
  {
    id: "mod-gyro-sleeve",
    kind: "mod",
    name: "Gyro Sleeve",
    description:
      "A counter-spinning collar around the grip that eats the recoil " +
      "before your wrist hears about it. You move quicker with it on and " +
      "you feel every gram of it by the third street.",
    socket: "grip",
    accent: "hologramBlue",
    effects: [
      { type: "stat-mod", stat: "reflexes", amount: 1 },
      { type: "stat-mod", stat: "body", amount: -1 },
    ],
  },
  {
    id: "mod-ballast-shim",
    kind: "mod",
    name: "Ballast Shim",
    description:
      "Four hundred grams of depleted stock wedged into the heel of the " +
      "grip. The weapon stops arguing with the swing; the swing stops " +
      "arriving anywhere quickly.",
    socket: "grip",
    accent: "brushedChrome",
    effects: [
      { type: "stat-mod", stat: "body", amount: 1 },
      { type: "accuracy", amount: -1 },
    ],
  },
  // --- Consumables ---
  {
    id: "con-trauma-patch",
    kind: "consumable",
    name: "Trauma Patch",
    description:
      "A slap-on dermal pack of coagulants and synth-endorphins. Hurts " +
      "going on, then nothing hurts at all.",
    effect: { type: "heal", amount: 10 },
  },
  {
    id: "con-surge-stim",
    kind: "consumable",
    name: "Surge Stim",
    description:
      "A single-use injector of gray-market reflex accelerant. The crash " +
      "afterward is somebody else's problem.",
    effect: { type: "combat-boost", stat: "reflexes", amount: 2, turns: 3 },
  },
  {
    id: "con-field-kit",
    kind: "consumable",
    name: "Vent-Crew Field Kit",
    description:
      "A cycler crew's wall-box kit: burn gel, splint tape, and a stimulant " +
      "lozenge older than the shift roster. All of it still works.",
    effect: { type: "heal", amount: 12 },
  },
  // --- Misc / story items ---
  {
    id: "msc-cracked-spike",
    kind: "misc",
    name: "Cracked Data Spike",
    description:
      "A matte-black storage spike, casing split by whoever tried it " +
      "first. Whatever's on it, Auric wants it back badly.",
    tags: ["evidence", "auric"],
  },
  {
    id: "msc-glasshouse-pass",
    kind: "misc",
    name: "Reclamation Duty Pass",
    description:
      "An Auric duty roster chip, still warm from Auditor Lin's printer. " +
      "Whoever holds it is, on paper, allowed anywhere the water goes.",
    tags: ["auric", "key"],
  },
  {
    id: "msc-override-key",
    kind: "misc",
    name: "Undertow Override Key",
    description:
      "A brass-and-chip key pried from a drowned foreman's lanyard. It " +
      "opens the pump deck's inner doors, and it cost more than money.",
    tags: ["key", "undercroft"],
  },
  {
    id: "msc-ledger-ghost",
    kind: "misc",
    name: "Ledger Ghost-Copy",
    description:
      "Sable's shadow-image of the Undertow ledger, wrapped in three " +
      "layers of dead-man's encryption and one of spite.",
    tags: ["evidence", "auric"],
  },
  {
    id: "msc-auric-writ",
    kind: "misc",
    name: "Auric Letter of Passage",
    description:
      "A countersigned writ over Director Voss's mark. Security reads it " +
      "and decides, visibly, that you are somebody else's problem.",
    tags: ["auric", "favor"],
  },
  {
    id: "msc-cordon-orders",
    kind: "misc",
    name: "Cordon Mandate Spool",
    description:
      "Halex's off-book mandate orders on a cold-storage spool: the Cordon, " +
      "line by line, with the cycler shutdown signed in the director's own " +
      "key. Evidence enough to convene the Sprawl.",
    tags: ["evidence", "auric"],
  },
  {
    // What was in the courier's case, kept back off the board: the
    // Last Mile's other unique reward, and the one that only exists on
    // the road where the market was told.
    id: "msc-assessment-roll",
    kind: "misc",
    name: "Boards Assessment Roll",
    description:
      "A ghost-copy of Auric's clearance survey for the light well: " +
      "every pitch on the Vertical Market's six levels, ranked by how " +
      "little trouble emptying it would be. The north row is near the " +
      "top, and somebody has already initialled it.",
    tags: ["evidence", "auric"],
  },
  {
    // Under the Waterline's evidence: the Longshore's own book, taken
    // off the drowned bonded store when the ring came apart. Every run
    // in it went up the basin under somebody else's salvage number.
    id: "msc-longshore-ledger",
    kind: "misc",
    name: "Longshore Tally Book",
    description:
      "A swollen grease-paper tally book off a smuggler's warehouse " +
      "shelf, dried out one page at a time. Consignments down the left, " +
      "dates down the middle, and down the right the licence number each " +
      "run was walked up the quays on. One number is on almost every line.",
    tags: ["evidence", "quays"],
  },
  {
    // And the other side of that book: the licence itself, signed over
    // by a diver who was not in the room when it happened.
    id: "msc-basin-licence",
    kind: "misc",
    name: "Basin Salvage Licence",
    description:
      "A laminated dredging licence for the Flooded Quays, endorsed for " +
      "open water and unlimited tonnage. The holder's name has been " +
      "struck through once and countersigned, and the countersignature " +
      "is not hers.",
    tags: ["key", "quays"],
  },
  // --- Cyber enhancements ---
  {
    id: "cyb-optic-suite",
    kind: "enhancement",
    name: "Optic Suite",
    description:
      "Replacement eyes with threat-tracking overlays. People notice the " +
      "shutter-click focus, and it makes them nervous.",
    slot: "eyes",
    neuralCost: 2,
    // Shutter-click focus: cyan-pulsing replacement eyes.
    cyberLayer: { id: "optics", accent: "neonCyan" },
    effects: [
      { type: "stat-mod", stat: "reflexes", amount: 1 },
      { type: "stat-mod", stat: "cool", amount: -1 },
      { type: "unlock-dialogue", tag: "optic-scan" },
    ],
  },
  {
    id: "cyb-myomer-arms",
    kind: "enhancement",
    name: "Myomer Arms",
    description:
      "Industrial muscle-fiber arms rated for cargo work. Crushing grip, " +
      "but the fine motor calibration never feels quite right.",
    slot: "arms",
    neuralCost: 3,
    // Cargo-rated muscle chrome with hazard-amber servo lights.
    cyberLayer: { id: "chrome-arm", accent: "hazardAmber" },
    effects: [
      { type: "stat-mod", stat: "body", amount: 2 },
      { type: "stat-mod", stat: "tech", amount: -1 },
      { type: "grant-ability", abilityId: "ability-crush" },
    ],
  },
  {
    id: "cyb-lattice-coprocessor",
    kind: "enhancement",
    name: "Lattice Coprocessor",
    description:
      "A cortical lattice that runs cold logic alongside your own. You " +
      "think faster and blink less, and small talk starts to feel like lag.",
    slot: "neural",
    neuralCost: 3,
    // Cold-logic lattice: the temple port runs cyan.
    cyberLayer: { id: "neural-jack", accent: "neonCyan" },
    effects: [
      { type: "stat-mod", stat: "intelligence", amount: 2 },
      { type: "stat-mod", stat: "cool", amount: -1 },
      { type: "unlock-dialogue", tag: "machine-cant" },
    ],
  },
  {
    id: "cyb-silt-gills",
    kind: "enhancement",
    name: "Silt Gills",
    description:
      "Filtration slits grafted along the ribs, rated for floodwater. " +
      "You can breathe the drowned levels — and you never stop tasting " +
      "them.",
    slot: "dermal",
    neuralCost: 2,
    // Chrome-rimmed filtration slits down the ribs.
    cyberLayer: { id: "gill-slits" },
    effects: [
      { type: "stat-mod", stat: "body", amount: 1 },
      { type: "stat-mod", stat: "cool", amount: -1 },
      { type: "unlock-dialogue", tag: "flood-diver" },
    ],
  },
  {
    id: "cyb-static-veil",
    kind: "enhancement",
    name: "Static Veil",
    description:
      "A subdermal projection film that smears your gait and face into " +
      "camera static. Recognition systems slide off you — and so, slowly, " +
      "does your own reflection.",
    slot: "dermal",
    neuralCost: 2,
    // Projection film smearing hologram-blue static down the face.
    cyberLayer: { id: "veil-film", accent: "hologramBlue" },
    effects: [
      { type: "stat-mod", stat: "cool", amount: 1 },
      { type: "stat-mod", stat: "tech", amount: -1 },
      { type: "unlock-dialogue", tag: "static-veil" },
    ],
  },
  {
    id: "cyb-dermal-weave",
    kind: "enhancement",
    name: "Dermal Weave",
    description:
      "Subdermal ballistic mesh grafted across the torso. Turns knives, " +
      "at the price of skin that no longer moves like skin.",
    slot: "dermal",
    neuralCost: 2,
    // Ballistic mesh seams tracing the torso plating.
    cyberLayer: { id: "dermal-plate" },
    effects: [
      { type: "stat-mod", stat: "body", amount: 1 },
      { type: "stat-mod", stat: "reflexes", amount: -1 },
    ],
  },
];

const itemsById = new Map(items.map((item) => [item.id, item]));

export function getItem(id: string): Item | undefined {
  return itemsById.get(id);
}

/** Resolves an item id, throwing InventoryError("unknown-item") if absent. */
export function requireItem(id: string): Item {
  const item = itemsById.get(id);
  if (!item) {
    throw new InventoryError("unknown-item", `No item with id "${id}"`);
  }
  return item;
}
