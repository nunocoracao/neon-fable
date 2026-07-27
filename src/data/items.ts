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
    effects: [{ type: "stat-mod", stat: "tech", amount: 1 }],
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
    effects: [
      { type: "stat-mod", stat: "body", amount: 1 },
      { type: "stat-mod", stat: "cool", amount: -1 },
      { type: "unlock-dialogue", tag: "flood-diver" },
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
