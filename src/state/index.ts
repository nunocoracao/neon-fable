/**
 * Central serializable game state. Every system reads from and writes to
 * this object; save/load serializes it to localStorage as JSON.
 * Fleshed out as systems land in later tasks.
 */
export interface GameState {
  /** Save-format version for future migrations. */
  version: number;
}

export function createNewGameState(): GameState {
  return { version: 1 };
}
