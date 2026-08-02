import { victoriesWon } from "../character/cred";
import { currentAct } from "../data/acts";
import { clampDifficultyId, type DifficultyId } from "../data/difficulty";
import {
  GAME_STATE_VERSION,
  OLDEST_MIGRATABLE_VERSION,
  migrateGameState,
  type GameState,
} from "./gameState";
import { clampLore } from "./lore";
import { NG_PLUS_FLAG } from "./ngplus";

/**
 * Save system: serializes GameState into named slots behind an injectable
 * storage interface, so logic tests run against an in-memory fake and the
 * browser wires in window.localStorage.
 *
 * ## Two kinds of metadata
 *
 * A slot card wants to say more than "Slot 1 — 21:04", and what it wants
 * to say splits cleanly in two.
 *
 * Most of it is *derived*: who the runner is, which chapter they are in,
 * what the run is being played on, how much of the city they have
 * turned over. None of that is stored, because none of it has to be —
 * it is read back off the state the slot already holds every time the
 * screen asks (summarizeRun). That is what makes it migration-safe for
 * free: a save written before any of this existed describes a runner in
 * a chapter on a preset just as completely as one written today, and
 * reads back with exactly the same code.
 *
 * The rest cannot be derived and so is *stored* beside the state, in an
 * optional `meta` block (SaveExtras): the label a player typed, and the
 * two thumbnails rendered at save time. Optional by design — a slot with
 * no meta block is a v1 save and renders a placeholder, and a slot whose
 * meta block is nonsense is a slot with no meta block. Loading never
 * looks at it.
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

/** Characters a player-entered save label keeps. */
export const SAVE_LABEL_MAX_LENGTH = 40;

/**
 * Ceiling on one stored thumbnail, in characters of data URL. A 48×48
 * portrait bake at ART_SCALE encodes to roughly 3 KiB and a downscaled
 * scene crop to well under 20; 24 KiB leaves both room to breathe while
 * bounding what four slots can cost a storage quota shared with the
 * meta-progress record. Anything over is dropped rather than truncated —
 * half a PNG is not a smaller PNG.
 */
export const SAVE_THUMBNAIL_MAX_BYTES = 24 * 1024;

/**
 * Encodings a stored thumbnail may be in. Listed rather than left open
 * so a hand-edited save cannot put `javascript:` (or an off-origin
 * `http:`) into something the screen is about to hand an <img>, and
 * extensible so a later build can switch encoders without invalidating
 * the thumbnails every older build wrote.
 */
const THUMBNAIL_PATTERN = /^data:image\/(?:png|webp|jpeg|gif);base64,[A-Za-z0-9+/]+=*$/;

/** Small pictures of a save, rendered when it was written. */
export interface SaveThumbnails {
  /** The runner's composed portrait, as a data URL. */
  portrait: string | null;
  /** The tiles around them, as a data URL. */
  scene: string | null;
}

/** What a slot stores that cannot be read back off the state. */
export interface SaveExtras {
  /** Player-entered name for the save; "" when never renamed. */
  label: string;
  thumbnails: SaveThumbnails;
}

/** What a slot's state says about the run in it, all derived. */
export interface RunSummary {
  characterName: string;
  backgroundId: string;
  /** Map id; the screen resolves it to a name. */
  location: string;
  /** Chapter the run is in, 1-based. */
  act: number;
  difficulty: DifficultyId;
  /** True when the preset was moved after the run began. */
  difficultyChanged: boolean;
  newGamePlus: boolean;
  /** Memory shards picked up this run. */
  shardsFound: number;
  /** Fights this run has walked away from. */
  victories: number;
}

/** A readable save, as the menus list them. */
export interface SaveMetadata {
  slot: SaveSlot;
  savedAt: number;
  label: string;
  thumbnails: SaveThumbnails;
  run: RunSummary;
}

/**
 * "empty" — nothing in the slot. "ready" — a save the screen can offer
 * to load. "unreadable" — a slot that failed validation; whatever
 * metadata survived is still on the record, because a screen that can
 * show a player which save broke is worth more than one that hides it.
 */
export type SlotStatus = "empty" | "ready" | "unreadable";

/**
 * Everything one slot can tell a screen, including the slots that can
 * tell it very little. Never throws to build; `run` is null only when
 * the state itself could not be read.
 */
export interface SlotRecord {
  slot: SaveSlot;
  status: SlotStatus;
  /** 0 when the slot is empty or the timestamp did not survive. */
  savedAt: number;
  label: string;
  thumbnails: SaveThumbnails;
  run: RunSummary | null;
  error: { code: SaveErrorCode; message: string } | null;
}

interface SaveEnvelope {
  version: number;
  savedAt: number;
  state: GameState;
  /** Absent on every save written before slot metadata existed. */
  meta?: SaveExtras;
}

const KEY_PREFIX = "neon-fable:save:";

function slotKey(slot: SaveSlot): string {
  return KEY_PREFIX + slot;
}

/* ------------------------------------------------------------------ *
 * Input hygiene
 * ------------------------------------------------------------------ */

/**
 * A player-entered label, made safe to store and to print: control and
 * formatting characters become spaces, runs of whitespace collapse, and
 * what is left is trimmed and capped. Anything that is not a string is
 * no label at all.
 */
export function sanitizeSaveLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SAVE_LABEL_MAX_LENGTH)
    .trim();
}

/**
 * A stored thumbnail, or null: only a base64 image data URL within the
 * size cap survives. Applied on the way in *and* on the way out, so a
 * slot edited by hand cannot hand the screen a URL to fetch.
 */
export function sanitizeThumbnail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length > SAVE_THUMBNAIL_MAX_BYTES) return null;
  return THUMBNAIL_PATTERN.test(value) ? value : null;
}

export function emptyThumbnails(): SaveThumbnails {
  return { portrait: null, scene: null };
}

export function emptySaveExtras(): SaveExtras {
  return { label: "", thumbnails: emptyThumbnails() };
}

/** Coerces anything — including nothing — into a complete SaveExtras. */
export function sanitizeSaveExtras(value: unknown): SaveExtras {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const thumbs =
    typeof record.thumbnails === "object" && record.thumbnails !== null
      ? (record.thumbnails as Record<string, unknown>)
      : {};
  return {
    label: sanitizeSaveLabel(record.label),
    thumbnails: {
      portrait: sanitizeThumbnail(thumbs.portrait),
      scene: sanitizeThumbnail(thumbs.scene),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Derived metadata
 * ------------------------------------------------------------------ */

/**
 * What a state says about its own run. Pure and tolerant: it is called
 * on saves this build has not migrated yet (listing a slot never
 * migrates it), so every field degrades rather than throwing — a
 * pre-difficulty save reads as the authored preset, a pre-lore save as
 * nothing found.
 */
export function summarizeRun(state: GameState): RunSummary {
  const player = (state.player ?? {}) as Partial<GameState["player"]>;
  const flags = typeof state.flags === "object" && state.flags ? state.flags : {};
  const rules = (state.rules ?? {}) as Partial<GameState["rules"]>;
  return {
    characterName: typeof player.name === "string" ? player.name : "",
    backgroundId:
      typeof player.backgroundId === "string" ? player.backgroundId : "",
    location: typeof state.location === "string" ? state.location : "",
    act: currentAct(flags),
    difficulty: clampDifficultyId(rules.difficulty),
    difficultyChanged: rules.difficultyChanged === true,
    newGamePlus: flags[NG_PLUS_FLAG] === true,
    shardsFound: clampLore(state.lore).collected.length,
    victories: victoriesWon(flags),
  };
}

/* ------------------------------------------------------------------ *
 * Reading and writing
 * ------------------------------------------------------------------ */

export function saveGame(
  state: GameState,
  slot: SaveSlot,
  storage: SaveStorage,
  savedAt: number = Date.now(),
  extras?: Partial<SaveExtras>,
): SaveMetadata {
  const meta = sanitizeSaveExtras(extras);
  const envelope: SaveEnvelope = {
    version: state.version,
    savedAt,
    state,
    meta,
  };
  storage.setItem(slotKey(slot), JSON.stringify(envelope));
  return {
    slot,
    savedAt,
    label: meta.label,
    thumbnails: meta.thumbnails,
    run: summarizeRun(state),
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

/**
 * Puts a player-entered name on an existing save, leaving the state it
 * holds byte-identical. Throws the same errors a load would for a slot
 * that is empty or unparseable — there is nothing to name. Returns the
 * label as stored, which is the sanitized one.
 */
export function renameSave(
  slot: SaveSlot,
  storage: SaveStorage,
  label: string,
): string {
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
  if (typeof envelope !== "object" || envelope === null) {
    throw new SaveError("corrupt", slot, `Save in slot "${slot}" is malformed`);
  }
  const record = envelope as Record<string, unknown>;
  const meta = sanitizeSaveExtras(record.meta);
  meta.label = sanitizeSaveLabel(label);
  storage.setItem(slotKey(slot), JSON.stringify({ ...record, meta }));
  return meta.label;
}

/**
 * Every slot, in order, in whatever condition it is in. Never throws:
 * this is what the save screen renders from, and a screen that cannot
 * be drawn because one slot is broken is worse than a broken slot.
 */
export function readSaveSlots(storage: SaveStorage): SlotRecord[] {
  return SAVE_SLOTS.map((slot) => readSaveSlot(slot, storage));
}

export function readSaveSlot(slot: SaveSlot, storage: SaveStorage): SlotRecord {
  const raw = storage.getItem(slotKey(slot));
  if (raw === null) return emptyRecord(slot);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return brokenRecord(slot, emptySaveExtras(), 0, {
      code: "corrupt",
      message: `Save in slot "${slot}" is not valid JSON`,
    });
  }

  // Whatever the state turns out to be, the meta block is read on its
  // own — a save whose state this build cannot use can still show the
  // name its player gave it and the face they were wearing.
  const record =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  const meta = sanitizeSaveExtras(record.meta);
  const savedAt = typeof record.savedAt === "number" ? record.savedAt : 0;

  if (!isEnvelope(parsed)) {
    return brokenRecord(slot, meta, savedAt, {
      code: "corrupt",
      message: `Save in slot "${slot}" is malformed`,
    });
  }

  const run = summarizeRun(parsed.state);
  if (
    parsed.version > GAME_STATE_VERSION ||
    parsed.version < OLDEST_MIGRATABLE_VERSION
  ) {
    return {
      slot,
      status: "unreadable",
      savedAt: parsed.savedAt,
      label: meta.label,
      thumbnails: meta.thumbnails,
      run,
      error: {
        code: "version-mismatch",
        message: `Save in slot "${slot}" has version ${parsed.version}, expected ${GAME_STATE_VERSION}`,
      },
    };
  }

  return {
    slot,
    status: "ready",
    savedAt: parsed.savedAt,
    label: meta.label,
    thumbnails: meta.thumbnails,
    run,
    error: null,
  };
}

/**
 * Metadata for every occupied slot whose state could be read. A slot
 * from another build is still listed — it was always listed, and the
 * friendly version error belongs to the attempt to load it, not to the
 * attempt to name it.
 */
export function listSaves(storage: SaveStorage): SaveMetadata[] {
  const saves: SaveMetadata[] = [];
  for (const record of readSaveSlots(storage)) {
    if (record.run === null) continue;
    saves.push({
      slot: record.slot,
      savedAt: record.savedAt,
      label: record.label,
      thumbnails: record.thumbnails,
      run: record.run,
    });
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

function emptyRecord(slot: SaveSlot): SlotRecord {
  return {
    slot,
    status: "empty",
    savedAt: 0,
    label: "",
    thumbnails: emptyThumbnails(),
    run: null,
    error: null,
  };
}

function brokenRecord(
  slot: SaveSlot,
  meta: SaveExtras,
  savedAt: number,
  error: { code: SaveErrorCode; message: string },
): SlotRecord {
  return {
    slot,
    status: "unreadable",
    savedAt,
    label: meta.label,
    thumbnails: meta.thumbnails,
    run: null,
    error,
  };
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
