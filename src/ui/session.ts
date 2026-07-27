import { saveGame, type GameState, type SaveStorage } from "../state";

/**
 * A live playthrough: the current GameState plus the storage saves go
 * to. Screens mutate `state` by assigning a new object (all game logic
 * is pure); the session is threaded through screen factories so a load
 * or new game swaps cleanly.
 */
export interface Session {
  state: GameState;
  readonly storage: SaveStorage;
}

export function createSession(
  state: GameState,
  storage: SaveStorage = window.localStorage,
): Session {
  return { state, storage };
}

export function autosave(session: Session): void {
  saveGame(session.state, "autosave", session.storage);
}

/** Records arrival on a map and autosaves — the map-transition hook. */
export function enterMap(session: Session, mapId: string): void {
  session.state = { ...session.state, location: mapId };
  autosave(session);
}
