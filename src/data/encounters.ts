/**
 * Encounter content: which enemies spawn where on which arena grid, and
 * what winning pays out. Grids are small and match future iso combat
 * arenas (positions are tile coordinates).
 */

export interface EncounterPosition {
  x: number;
  y: number;
}

export interface EncounterSpawn {
  enemyId: string;
  position: EncounterPosition;
}

export interface EncounterRewardItem {
  itemId: string;
  quantity?: number;
}

export interface EncounterRewards {
  credits: number;
  items?: EncounterRewardItem[];
}

export interface Encounter {
  id: string;
  name: string;
  grid: { width: number; height: number };
  /**
   * Iso map (src/data/maps.ts) the battle is fought on. Its dimensions
   * must match `grid` — combat positions are the map's tile coordinates.
   */
  arenaMapId: string;
  playerStart: EncounterPosition;
  enemies: EncounterSpawn[];
  rewards: EncounterRewards;
  /** Whether the flee action is allowed; defaults to true. */
  fleeable?: boolean;
}

export const encounters: Encounter[] = [
  {
    id: "enc-auric-scout",
    name: "Auric Scout Team",
    grid: { width: 8, height: 6 },
    arenaMapId: "undercroft-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-auric-agent", position: { x: 6, y: 2 } },
      { enemyId: "nme-static-drone", position: { x: 6, y: 4 } },
    ],
    rewards: {
      credits: 40,
      items: [{ itemId: "con-trauma-patch" }],
    },
  },
  {
    id: "enc-rustyard-ambush",
    name: "Rustyard Ambush",
    grid: { width: 7, height: 7 },
    arenaMapId: "rustyard-arena",
    playerStart: { x: 3, y: 6 },
    enemies: [
      { enemyId: "nme-rustyard-bruiser", position: { x: 1, y: 1 } },
      { enemyId: "nme-rustyard-bruiser", position: { x: 5, y: 1 } },
    ],
    rewards: {
      credits: 30,
      items: [{ itemId: "con-surge-stim" }],
    },
  },
  {
    id: "enc-vault-guardian",
    name: "Vault Guardian",
    grid: { width: 8, height: 6 },
    arenaMapId: "vault-arena",
    playerStart: { x: 1, y: 2 },
    enemies: [
      { enemyId: "nme-vault-sentinel", position: { x: 6, y: 3 } },
      { enemyId: "nme-auric-agent", position: { x: 7, y: 1 } },
    ],
    rewards: {
      credits: 80,
      items: [{ itemId: "con-trauma-patch", quantity: 2 }],
    },
    fleeable: false,
  },
];

const encountersById = new Map(encounters.map((e) => [e.id, e]));

export function getEncounter(id: string): Encounter | undefined {
  return encountersById.get(id);
}

export function requireEncounter(id: string): Encounter {
  const encounter = encountersById.get(id);
  if (!encounter) {
    throw new Error(`No encounter with id "${id}"`);
  }
  return encounter;
}
