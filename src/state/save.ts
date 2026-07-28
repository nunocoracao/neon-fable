import {
  GAME_STATE_VERSION,
  OLDEST_MIGRATABLE_VERSION,
  migrateGameState,
  type GameState,
} from "./gameState";

/**
 * Save system: serializes GameState into named slots behind an injectable
 * storage interface, so logic tests run against an in-memory fake and the
 * browser wires in window.localStorage.
 */
export type SaveSlot = "slot1" | "slot2" | "slot3" | "autosave";

export const SAVE_SLOTS: readonly SaveSlot[] = [
  "slot1",
  "slot2",
  "slot3",
  "autosave",
];

/** Minimal subset of the Web Storage API the save system needs. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryStorage(): SaveStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

export type SaveErrorCode = "missing" | "corrupt" | "version-mismatch";

export class SaveError extends Error {
  constructor(
    readonly code: SaveErrorCode,
    readonly slot: SaveSlot,
    message: string,
  ) {
    super(message);
    this.name = "SaveError";
  }
}

export interface SaveMetadata {
  slot: SaveSlot;
  savedAt: number;
  characterName: string;
  location: string;
}

interface SaveEnvelope {
  version: number;
  savedAt: number;
  state: GameState;
}

const KEY_PREFIX = "neon-fable:save:";

function slotKey(slot: SaveSlot): string {
  return KEY_PREFIX + slot;
}

export function saveGame(
  state: GameState,
  slot: SaveSlot,
  storage: SaveStorage,
  savedAt: number = Date.now(),
): SaveMetadata {
  const envelope: SaveEnvelope = { version: state.version, savedAt, state };
  storage.setItem(slotKey(slot), JSON.stringify(envelope));
  return {
    slot,
    savedAt,
    characterName: state.player.name,
    location: state.location,
  };
}

export function loadGame(slot: SaveSlot, storage: SaveStorage): GameState {
  const raw = storage.getItem(slotKey(slot));
  if (raw === null) {
    throw new SaveError("missing", slot, `No save in slot "${slot}"`);
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw new SaveError("corrupt", slot, `Save in slot "${slot}" is not valid JSON`);
  }
  if (!isEnvelope(envelope)) {
    throw new SaveError("corrupt", slot, `Save in slot "${slot}" is malformed`);
  }

  if (
    envelope.version > GAME_STATE_VERSION ||
    envelope.version < OLDEST_MIGRATABLE_VERSION
  ) {
    throw new SaveError(
      "version-mismatch",
      slot,
      `Save in slot "${slot}" has version ${envelope.version}, expected ${GAME_STATE_VERSION}`,
    );
  }
  if (envelope.version < GAME_STATE_VERSION) {
    return migrateGameState(envelope.state, envelope.version);
  }

  return envelope.state;
}

export function deleteSave(slot: SaveSlot, storage: SaveStorage): void {
  storage.removeItem(slotKey(slot));
}

/** Metadata for every occupied, readable slot; corrupt slots are skipped. */
export function listSaves(storage: SaveStorage): SaveMetadata[] {
  const saves: SaveMetadata[] = [];
  for (const slot of SAVE_SLOTS) {
    const raw = storage.getItem(slotKey(slot));
    if (raw === null) continue;
    try {
      const envelope: unknown = JSON.parse(raw);
      if (!isEnvelope(envelope)) continue;
      saves.push({
        slot,
        savedAt: envelope.savedAt,
        characterName: envelope.state.player.name,
        location: envelope.state.location,
      });
    } catch {
      continue;
    }
  }
  return saves;
}

/** The newest save by savedAt, or null when none exist. */
export function mostRecentSave(saves: SaveMetadata[]): SaveMetadata | null {
  let best: SaveMetadata | null = null;
  for (const save of saves) {
    if (!best || save.savedAt > best.savedAt) best = save;
  }
  return best;
}

function isEnvelope(value: unknown): value is SaveEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const env = value as Record<string, unknown>;
  if (typeof env.version !== "number" || typeof env.savedAt !== "number") {
    return false;
  }
  const state = env.state;
  if (typeof state !== "object" || state === null) return false;
  const s = state as Record<string, unknown>;
  return (
    typeof s.version === "number" &&
    typeof s.location === "string" &&
    typeof s.player === "object" &&
    s.player !== null &&
    typeof (s.player as Record<string, unknown>).name === "string" &&
    typeof s.flags === "object" &&
    s.flags !== null
  );
}
