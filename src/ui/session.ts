import {
  StorageWriteError,
  saveGame,
  type GameState,
  type SaveStorage,
} from "../state";
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

/**
 * The session the game is currently playing, if any.
 *
 * A module-level handle looks like the kind of global the rest of this
 * codebase avoids, and it is here for one reason: the crash boundary
 * (./screen.ts) has to be able to stash the run in progress *without*
 * having been handed it, because the code path that reaches it is an
 * exception escaping from somewhere nobody planned for.
 */
let active: Session | null = null;

export function createSession(
  state: GameState,
  storage: SaveStorage = window.localStorage,
): Session {
  const session: Session = { state, storage };
  active = session;
  return session;
}

export function getActiveSession(): Session | null {
  return active;
}

/** Forgets the current run — leaving the title screen, and tests. */
export function clearActiveSession(): void {
  active = null;
}

/**
 * The last thing storage refused to do, or null. Read by the save
 * screen so a quota failure during an autosave — which happens with no
 * screen open and nowhere to put a message — is still told to the
 * player the next time they are somewhere it makes sense to say it.
 */
let storageProblem: string | null = null;

export function noteStorageProblem(message: string): void {
  storageProblem = message;
}

/** Reads the pending storage problem and clears it. */
export function takeStorageProblem(): string | null {
  const problem = storageProblem;
  storageProblem = null;
  return problem;
}

/**
 * Writes the autosave slot, with the runner's face on it.
 *
 * Deliberately no scene vignette: an autosave fires on the way *into* a
 * map, when the canvas still holds the map being left, and a picture of
 * somewhere the save is not is worse than no picture. Manual saves are
 * taken with the scene on screen and carry both.
 *
 * A full storage does not stop the player walking through a door. The
 * failure is held instead, and shown the next time the save screen is
 * open — the one place where "delete something" is an instruction the
 * player can act on. Returns whether the write happened.
 */
export function autosave(session: Session): boolean {
  try {
    saveGame(session.state, "autosave", session.storage, Date.now(), {
      thumbnails: { portrait: capturePortraitThumb(session.state), scene: null },
    });
    return true;
  } catch (error) {
    if (error instanceof StorageWriteError) {
      console.warn("Autosave could not be written:", error.message);
      noteStorageProblem(`The autosave could not be written. ${error.guidance}`);
      return false;
    }
    throw error;
  }
}

/** Records arrival on a map and autosaves — the map-transition hook. */
export function enterMap(session: Session, mapId: string): void {
  session.state = { ...session.state, location: mapId };
  autosave(session);
}
