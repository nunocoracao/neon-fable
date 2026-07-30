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
  {
    id: "enc-pump-gate",
    name: "Pump-Deck Gate Wardens",
    grid: { width: 8, height: 6 },
    arenaMapId: "undercroft-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-auric-warden", position: { x: 6, y: 2 } },
      { enemyId: "nme-auric-warden", position: { x: 6, y: 4 } },
    ],
    rewards: {
      credits: 35,
      items: [{ itemId: "con-trauma-patch" }],
    },
  },
  {
    id: "enc-pumpworks-court",
    name: "Pumpworks Assault",
    grid: { width: 9, height: 7 },
    arenaMapId: "pumpworks-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-auric-warden", position: { x: 7, y: 2 } },
      { enemyId: "nme-static-drone", position: { x: 7, y: 4 } },
    ],
    rewards: {
      credits: 60,
      items: [{ itemId: "con-trauma-patch" }],
    },
    fleeable: false,
  },
  {
    id: "enc-pumpworks-inner",
    name: "The Custodian's Deck",
    grid: { width: 9, height: 7 },
    arenaMapId: "pumpworks-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [{ enemyId: "nme-pump-custodian", position: { x: 7, y: 3 } }],
    rewards: {
      credits: 60,
      items: [{ itemId: "con-surge-stim" }],
    },
    fleeable: false,
  },
  {
    id: "enc-pumpworks-voss",
    name: "Pumpworks Holdout",
    grid: { width: 9, height: 7 },
    arenaMapId: "pumpworks-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-court-sapper", position: { x: 7, y: 2 } },
      { enemyId: "nme-court-sapper", position: { x: 6, y: 5 } },
      { enemyId: "nme-court-sapper", position: { x: 7, y: 3 } },
    ],
    rewards: {
      credits: 60,
      items: [{ itemId: "con-trauma-patch" }],
    },
    fleeable: false,
  },
  {
    id: "enc-relay-crown",
    name: "Relay Crown Interdiction",
    grid: { width: 7, height: 6 },
    arenaMapId: "relay-crown-arena",
    playerStart: { x: 3, y: 5 },
    enemies: [
      { enemyId: "nme-auric-agent", position: { x: 3, y: 0 } },
      { enemyId: "nme-static-drone", position: { x: 5, y: 1 } },
    ],
    rewards: {
      credits: 50,
      items: [{ itemId: "con-trauma-patch" }],
    },
    fleeable: false,
  },
  {
    id: "enc-exchange-gate",
    name: "Exchange Gate Checkpoint",
    grid: { width: 8, height: 6 },
    arenaMapId: "vault-arena",
    playerStart: { x: 1, y: 2 },
    enemies: [
      { enemyId: "nme-cordon-enforcer", position: { x: 6, y: 1 } },
      { enemyId: "nme-cordon-enforcer", position: { x: 6, y: 4 } },
    ],
    rewards: {
      credits: 45,
      items: [{ itemId: "con-trauma-patch" }],
    },
  },
  {
    id: "enc-collectors",
    name: "Collections Call",
    grid: { width: 8, height: 6 },
    arenaMapId: "undercroft-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-auric-collector", position: { x: 6, y: 2 } },
      { enemyId: "nme-static-drone", position: { x: 6, y: 4 } },
    ],
    rewards: {
      credits: 150,
      items: [{ itemId: "con-trauma-patch" }],
    },
    fleeable: false,
  },
  {
    id: "enc-vent-crawler",
    name: "The Coolant Vault Den",
    grid: { width: 9, height: 7 },
    arenaMapId: "cycler-floor-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [{ enemyId: "nme-vent-crawler", position: { x: 7, y: 3 } }],
    rewards: {
      credits: 40,
      items: [{ itemId: "con-field-kit" }],
    },
  },
  {
    id: "enc-cordon-court",
    name: "The Cordon Core — Sapper Breach",
    grid: { width: 9, height: 7 },
    arenaMapId: "cycler-floor-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [{ enemyId: "nme-halex-proxy", position: { x: 7, y: 3 } }],
    rewards: {
      credits: 100,
      items: [{ itemId: "con-trauma-patch", quantity: 2 }],
    },
    fleeable: false,
  },
  {
    id: "enc-cordon-voss",
    name: "The Cordon Core — Eleven Seconds",
    grid: { width: 9, height: 7 },
    arenaMapId: "cycler-floor-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-halex-proxy", position: { x: 7, y: 3 } },
      { enemyId: "nme-static-drone", position: { x: 7, y: 1 } },
    ],
    rewards: {
      credits: 100,
      items: [{ itemId: "con-field-kit" }],
    },
    fleeable: false,
  },
  {
    id: "enc-cordon-lone",
    name: "The Cordon Core — Uninvited",
    grid: { width: 9, height: 7 },
    arenaMapId: "cycler-floor-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-halex-proxy", position: { x: 7, y: 3 } },
      { enemyId: "nme-static-drone", position: { x: 6, y: 5 } },
    ],
    rewards: {
      credits: 120,
      items: [{ itemId: "con-field-kit" }],
    },
    fleeable: false,
  },
  {
    id: "enc-spire-gate",
    name: "Registry Gate Interdiction",
    grid: { width: 8, height: 6 },
    arenaMapId: "vault-arena",
    playerStart: { x: 1, y: 2 },
    enemies: [
      { enemyId: "nme-cordon-enforcer", position: { x: 6, y: 1 } },
      { enemyId: "nme-auric-warden", position: { x: 6, y: 4 } },
      { enemyId: "nme-static-drone", position: { x: 7, y: 2 } },
    ],
    rewards: {
      credits: 60,
      items: [{ itemId: "con-trauma-patch" }],
    },
  },
  {
    id: "enc-spire-collectors",
    name: "The Trust's Collectors",
    grid: { width: 8, height: 6 },
    arenaMapId: "vault-arena",
    playerStart: { x: 1, y: 2 },
    enemies: [
      { enemyId: "nme-auric-collector", position: { x: 6, y: 1 } },
      { enemyId: "nme-auric-collector", position: { x: 6, y: 4 } },
    ],
    rewards: {
      credits: 180,
      items: [{ itemId: "con-field-kit" }],
    },
    fleeable: false,
  },
  {
    // The Vertical Market's fight, staged and waiting: the district's
    // arena and its shakedown crew are authored here so a later story
    // beat only has to point a choice at this id. Nothing in the
    // narrative starts it yet.
    id: "enc-market-scaffold",
    name: "Scaffold Row Shakedown",
    grid: { width: 9, height: 7 },
    arenaMapId: "market-scaffold-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-rustyard-bruiser", position: { x: 7, y: 2 } },
      { enemyId: "nme-rustyard-bruiser", position: { x: 7, y: 4 } },
      { enemyId: "nme-static-drone", position: { x: 6, y: 5 } },
    ],
    rewards: {
      credits: 55,
      items: [{ itemId: "con-surge-stim" }],
    },
  },
  {
    // The Flooded Quays' fight, staged the same way: the walkway arena
    // and what comes up it are authored ahead of the beat that will use
    // them. Nothing in the narrative starts it yet.
    id: "enc-quays-salvage",
    name: "Lockgate Walkway Toll",
    grid: { width: 9, height: 7 },
    arenaMapId: "quays-walkway-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-rustyard-bruiser", position: { x: 7, y: 3 } },
      { enemyId: "nme-vent-crawler", position: { x: 6, y: 5 } },
    ],
    rewards: {
      credits: 45,
      items: [{ itemId: "con-field-kit" }],
    },
  },
  {
    // The executive floor's own fight: the house detail that works the
    // directors' level, called when a claimant declines to leave it.
    id: "enc-exec-security",
    name: "Executive Floor Detail",
    grid: { width: 9, height: 7 },
    arenaMapId: "exec-floor-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-auric-warden", position: { x: 7, y: 2 } },
      { enemyId: "nme-cordon-enforcer", position: { x: 7, y: 4 } },
      { enemyId: "nme-static-drone", position: { x: 6, y: 5 } },
    ],
    rewards: {
      credits: 90,
      items: [{ itemId: "con-trauma-patch", quantity: 2 }],
    },
  },
  {
    id: "enc-crown-court",
    name: "The Crown Ring — Sappers' Breach",
    grid: { width: 9, height: 7 },
    arenaMapId: "spire-crown-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [{ enemyId: "nme-locus-aspect", position: { x: 7, y: 3 } }],
    rewards: {
      credits: 150,
      items: [{ itemId: "con-field-kit" }],
    },
    fleeable: false,
  },
  {
    id: "enc-crown-auric",
    name: "The Crown Ring — Chair's Override",
    grid: { width: 9, height: 7 },
    arenaMapId: "spire-crown-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-locus-aspect", position: { x: 7, y: 3 } },
      { enemyId: "nme-static-drone", position: { x: 7, y: 1 } },
    ],
    rewards: {
      credits: 150,
      items: [{ itemId: "con-trauma-patch", quantity: 2 }],
    },
    fleeable: false,
  },
  {
    id: "enc-crown-alone",
    name: "The Crown Ring — Unfiled",
    grid: { width: 9, height: 7 },
    arenaMapId: "spire-crown-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-locus-aspect", position: { x: 7, y: 3 } },
      { enemyId: "nme-cordon-enforcer", position: { x: 6, y: 5 } },
    ],
    rewards: {
      credits: 200,
      items: [{ itemId: "con-field-kit" }],
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
