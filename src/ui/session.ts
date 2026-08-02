import { saveGame, type GameState, type SaveStorage } from "../state";
import { capturePortraitThumb } from "./saveThumbs";

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

/**
 * Writes the autosave slot, with the runner's face on it.
 *
 * Deliberately no scene vignette: an autosave fires on the way *into* a
 * map, when the canvas still holds the map being left, and a picture of
 * somewhere the save is not is worse than no picture. Manual saves are
 * taken with the scene on screen and carry both.
 */
export function autosave(session: Session): void {
  saveGame(session.state, "autosave", session.storage, Date.now(), {
    thumbnails: { portrait: capturePortraitThumb(session.state), scene: null },
  });
}

/** Records arrival on a map and autosaves — the map-transition hook. */
export function enterMap(session: Session, mapId: string): void {
  session.state = { ...session.state, location: mapId };
  autosave(session);
}
