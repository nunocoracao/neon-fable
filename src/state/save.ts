import { victoriesWon } from "../character/cred";
import { currentAct } from "../data/acts";
import { clampDifficultyId, type DifficultyId } from "../data/difficulty";
import type { GameState } from "./gameState";
import { checksumMatches, checksumText, isKnownChecksum } from "./integrity";
import { clampLore } from "./lore";
import { migrateStepwise } from "./migrate";
import { NG_PLUS_FLAG } from "./ngplus";
import {
  createMemoryStorage,
  quotaGuidance,
  removeItem as removeStored,
  storedBytes,
  writeItem,
  type Reclaimable,
  type SaveStorage,
} from "./storage";
import { describeIssues, validateSaveEnvelope } from "./validate";
import { GAME_STATE_VERSION, OLDEST_MIGRATABLE_VERSION } from "./version";

export { createMemoryStorage, type SaveStorage };

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
 *
 * ## Three things guarding the bytes
 *
 * A save is a single string in a store the game does not control, and
 * all three failure modes that string has are handled here rather than
 * discovered by a player.
 *
 *  - **A checksum** (./integrity.ts) is stamped on write and checked on
 *    read, so a blob that changed after it was written is caught as
 *    corruption rather than loaded as a run. Old saves carry no stamp
 *    and are accepted unstamped — a save is not corrupt for predating
 *    the check.
 *  - **A backup generation** sits beside every visible slot. The last
 *    known-good blob is copied to `<slot>:backup` before each
 *    overwrite, and only ever from a blob that passed every check, so a
 *    slot that rots cannot take its own backup down with it. One
 *    generation, deliberately: two would double the storage a player
 *    pays for to buy a case nobody has.
 *  - **Every write is guarded** (./storage.ts): a probe proves there is
 *    room before the real key is touched, and a write that fails throws
 *    with a sentence naming what to delete rather than leaving a hole
 *    where the last save was.
 */

/**
 * The four slots a player sees, plus the stash. `recovery` is written
 * only by the crash boundary (stashRecovery) and never listed with the
 * others — it is not a save the player manages, it is the run they were
 * in the middle of when something threw.
 */
export type SaveSlot = "slot1" | "slot2" | "slot3" | "autosave" | "recovery";

/** Where the crash boundary puts the run it was holding. */
export const RECOVERY_SLOT: SaveSlot = "recovery";

export const SAVE_SLOTS: readonly SaveSlot[] = [
  "slot1",
  "slot2",
  "slot3",
  "autosave",
];

/** Every slot storage may hold, including the one nothing lists. */
const ALL_SLOTS: readonly SaveSlot[] = [...SAVE_SLOTS, RECOVERY_SLOT];

/**
 * "missing" — nothing there. "corrupt" — unparseable or the wrong
 * shape. "checksum" — parseable, well-formed, and not what was written.
 * "version-mismatch" — from a build this one cannot read.
 * "migration-failed" — readable, but a step of the climb to the current
 * version could not be completed; the blob is left exactly as it was.
 */
export type SaveErrorCode =
  | "missing"
  | "corrupt"
  | "checksum"
  | "version-mismatch"
  | "migration-failed";

export class SaveError extends Error {
  constructor(
    readonly code: SaveErrorCode,
    readonly slot: SaveSlot,
    message: string,
    /**
     * The precise part: `state.player.name (expected a string, got
     * nothing)`, or the migration step that failed. Empty when there is
     * nothing more precise to say. Diagnostics print it; the friendly
     * one-liner on a slot card does not.
     */
    readonly detail: string = "",
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
  error: { code: SaveErrorCode; message: string; detail: string } | null;
  /**
   * True when `<slot>:backup` holds a save this build could restore.
   * What turns a broken card from a dead end into a recovery flow.
   */
  hasBackup: boolean;
}

interface SaveEnvelope {
  version: number;
  savedAt: number;
  state: GameState;
  /** Absent on every save written before slot metadata existed. */
  meta?: SaveExtras;
  /** Absent on every save written before integrity checks existed. */
  checksum?: string;
}

const KEY_PREFIX = "neon-fable:save:";
const BACKUP_SUFFIX = ":backup";

function slotKey(slot: SaveSlot): string {
  return KEY_PREFIX + slot;
}

function backupKey(slot: SaveSlot): string {
  return KEY_PREFIX + slot + BACKUP_SUFFIX;
}

/** What the player calls a slot, for a message about storage space. */
function slotLabel(slot: SaveSlot): string {
  switch (slot) {
    case "slot1":
      return "Slot 1";
    case "slot2":
      return "Slot 2";
    case "slot3":
      return "Slot 3";
    case "autosave":
      return "Autosave";
    case "recovery":
      return "the recovery stash";
  }
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

/**
 * What the checksum is taken over: the run and when it was written,
 * and deliberately *not* the meta block.
 *
 * The split follows what each part costs to lose. The state is the
 * save; a byte out of place in it is a corrupt run and must be caught.
 * The meta block is a label and two pictures, already sanitized on
 * every read, and a save that could not be loaded because somebody's
 * thumbnail rotted would be a worse game than one that quietly draws
 * the placeholder. It also keeps renaming honest: a rename rewrites the
 * meta block without touching the stamp, so nothing on that path can
 * launder a corrupt state into one that looks freshly signed.
 *
 * Stringified in a fixed key order, which is also the order the fields
 * are written in, so a blob parsed back off storage restamps to the
 * same eight digits without any canonicalization step to get subtly
 * wrong.
 */
function checksumPayload(record: {
  version?: unknown;
  savedAt?: unknown;
  state?: unknown;
}): string {
  return JSON.stringify({
    version: record.version,
    savedAt: record.savedAt,
    state: record.state,
  });
}

function serializeEnvelope(envelope: SaveEnvelope): string {
  return JSON.stringify({
    version: envelope.version,
    savedAt: envelope.savedAt,
    state: envelope.state,
    meta: envelope.meta,
    checksum: checksumText(checksumPayload(envelope)),
  });
}

/**
 * How a stored blob's stamp compares to what this build would write.
 * "absent" is every save older than the checksum and is not a fault;
 * "unknown" is a stamp from an algorithm this build does not have,
 * which is a version problem rather than a corruption one.
 */
function checksumStatus(
  record: Record<string, unknown>,
): "absent" | "unknown" | "ok" | "mismatch" {
  const stamp = record.checksum;
  if (stamp === undefined) return "absent";
  if (!isKnownChecksum(stamp)) return "unknown";
  return checksumMatches(checksumPayload(record), stamp) ? "ok" : "mismatch";
}

interface OpenFailure {
  code: SaveErrorCode;
  message: string;
  detail: string;
}

type OpenResult =
  | { ok: true; envelope: SaveEnvelope; meta: SaveExtras }
  | { ok: false; error: OpenFailure; meta: SaveExtras; savedAt: number };

/**
 * Everything that can be decided about a stored blob without migrating
 * it: is it JSON, is it what was written, is it the right shape. Shared
 * by loading (which throws) and listing (which never does), so a slot
 * card and a failed load can never disagree about what is wrong.
 *
 * The meta block is read whatever the verdict — a save this build
 * cannot use can still show the name its player gave it and the face
 * they were wearing.
 */
function openEnvelope(raw: string, slot: SaveSlot): OpenResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      meta: emptySaveExtras(),
      savedAt: 0,
      error: {
        code: "corrupt",
        message: `Save in slot "${slot}" is not valid JSON`,
        detail: "",
      },
    };
  }

  const record =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  const meta = sanitizeSaveExtras(record.meta);
  const savedAt = typeof record.savedAt === "number" ? record.savedAt : 0;

  if (checksumStatus(record) === "mismatch") {
    return {
      ok: false,
      meta,
      savedAt,
      error: {
        code: "checksum",
        message: `Save in slot "${slot}" failed its integrity check`,
        detail: "the stored checksum does not match the stored save",
      },
    };
  }

  const check = validateSaveEnvelope(parsed);
  if (!check.ok) {
    return {
      ok: false,
      meta,
      savedAt,
      error: {
        code: "corrupt",
        message: `Save in slot "${slot}" is malformed`,
        detail: describeIssues(check.issues),
      },
    };
  }

  return { ok: true, envelope: parsed as SaveEnvelope, meta };
}

/** Whether a version is one this build can open at all. */
function versionSupported(version: number): boolean {
  return (
    version <= GAME_STATE_VERSION && version >= OLDEST_MIGRATABLE_VERSION
  );
}

/**
 * The state inside a validated envelope, brought to the current
 * version. Throws rather than returning a half-migrated run, and a
 * throw leaves the stored blob exactly as it was — nothing on this path
 * writes.
 */
function openState(envelope: SaveEnvelope, slot: SaveSlot): GameState {
  if (!versionSupported(envelope.version)) {
    throw new SaveError(
      "version-mismatch",
      slot,
      `Save in slot "${slot}" has version ${envelope.version}, expected ${GAME_STATE_VERSION}`,
    );
  }
  if (envelope.version === GAME_STATE_VERSION) return envelope.state;

  const migrated = migrateStepwise(envelope.state, envelope.version);
  if (!migrated.ok) {
    throw new SaveError(
      "migration-failed",
      slot,
      `Save in slot "${slot}" could not be updated: ${migrated.message}`,
      migrated.failedStep,
    );
  }
  return migrated.state;
}

/* ------------------------------------------------------------------ *
 * Backups
 * ------------------------------------------------------------------ */

/**
 * Slots that keep a backup generation: the ones a player can see. The
 * recovery stash does not — it is itself the backup, and a backup of a
 * backup is just storage nobody asked for.
 */
function keepsBackup(slot: SaveSlot): boolean {
  return SAVE_SLOTS.includes(slot);
}

/**
 * Copies a slot's current contents aside, if there are any and they are
 * good. The "and they are good" is the whole point: backing up a blob
 * that already failed its checks would overwrite the last known-good
 * copy with the rot the player needs rescuing from.
 *
 * Never throws. A backup that could not be written (no room) is a
 * backup the player does not have; it is not a reason to refuse the
 * save they asked for.
 */
function backUpExisting(slot: SaveSlot, storage: SaveStorage): boolean {
  if (!keepsBackup(slot)) return false;
  let raw: string | null = null;
  try {
    raw = storage.getItem(slotKey(slot));
  } catch {
    return false;
  }
  if (raw === null) return false;
  const opened = openEnvelope(raw, slot);
  if (!opened.ok || !versionSupported(opened.envelope.version)) return false;
  try {
    writeItem(storage, backupKey(slot), raw);
    return true;
  } catch {
    return false;
  }
}

/** Whether `<slot>:backup` holds something this build could restore. */
export function hasBackup(slot: SaveSlot, storage: SaveStorage): boolean {
  const raw = readKey(storage, backupKey(slot));
  if (raw === null) return false;
  const opened = openEnvelope(raw, slot);
  return opened.ok && versionSupported(opened.envelope.version);
}

/**
 * Puts the backup generation back in the slot and returns the run it
 * holds. Validated and migrated *before* anything is written, so a
 * backup that turns out to be unusable leaves the slot as it was rather
 * than replacing one broken save with another.
 *
 * The backup stays where it is. It cost nothing to keep, and a player
 * who restores, plays badly, and wants the same rescue again should get
 * it — until the next save overwrites the generation, which is the
 * point at which the backup is once again the thing before this one.
 */
export function restoreBackup(slot: SaveSlot, storage: SaveStorage): GameState {
  const raw = readKey(storage, backupKey(slot));
  if (raw === null) {
    throw new SaveError("missing", slot, `No backup for slot "${slot}"`);
  }
  const opened = openEnvelope(raw, slot);
  if (!opened.ok) {
    throw new SaveError(
      opened.error.code,
      slot,
      `The backup for slot "${slot}" cannot be read either`,
      opened.error.detail,
    );
  }
  const state = openState(opened.envelope, slot);
  writeItem(storage, slotKey(slot), raw, {
    guidance: () => quotaGuidance(reclaimable(storage, slot)),
  });
  return state;
}

/* ------------------------------------------------------------------ *
 * Room
 * ------------------------------------------------------------------ */

/**
 * What the game is storing that the player could delete, biggest-first
 * once quotaGuidance sorts it. The slot being written is left out — it
 * is about to be overwritten, so deleting it buys nothing — but its
 * backup is in, because that genuinely is free room.
 */
function reclaimable(storage: SaveStorage, writing?: SaveSlot): Reclaimable[] {
  const items: Reclaimable[] = [];
  for (const slot of ALL_SLOTS) {
    if (slot !== writing) {
      items.push({
        key: slotKey(slot),
        label: slotLabel(slot),
        bytes: storedBytes(readKey(storage, slotKey(slot))),
      });
    }
    items.push({
      key: backupKey(slot),
      label: `${slotLabel(slot)}'s backup`,
      bytes: storedBytes(readKey(storage, backupKey(slot))),
    });
  }
  return items;
}

/* ------------------------------------------------------------------ *
 * Saving and loading
 * ------------------------------------------------------------------ */

/**
 * Writes a slot: the last good contents are copied aside, then the new
 * blob is written through the guarded path (./storage.ts).
 *
 * Throws StorageWriteError — not SaveError — when there is no room. The
 * distinction matters to the caller: a SaveError is about this save, a
 * StorageWriteError is about the browser, and only one of them is fixed
 * by deleting something.
 */
export function saveGame(
  state: GameState,
  slot: SaveSlot,
  storage: SaveStorage,
  savedAt: number = Date.now(),
  extras?: Partial<SaveExtras>,
): SaveMetadata {
  const meta = sanitizeSaveExtras(extras);
  const text = serializeEnvelope({
    version: state.version,
    savedAt,
    state,
    meta,
  });
  backUpExisting(slot, storage);
  writeItem(storage, slotKey(slot), text, {
    guidance: () => quotaGuidance(reclaimable(storage, slot)),
  });
  return {
    slot,
    savedAt,
    label: meta.label,
    thumbnails: meta.thumbnails,
    run: summarizeRun(state),
  };
}

export function loadGame(slot: SaveSlot, storage: SaveStorage): GameState {
  const raw = readKey(storage, slotKey(slot));
  if (raw === null) {
    throw new SaveError("missing", slot, `No save in slot "${slot}"`);
  }
  const opened = openEnvelope(raw, slot);
  if (!opened.ok) {
    throw new SaveError(
      opened.error.code,
      slot,
      opened.error.message,
      opened.error.detail,
    );
  }
  return openState(opened.envelope, slot);
}

/* ------------------------------------------------------------------ *
 * The recovery stash
 * ------------------------------------------------------------------ */

/**
 * Puts the run that was in progress somewhere it can be picked up
 * again, for the crash boundary to call on its way to the error screen.
 *
 * Swallows everything. It is called while something has already gone
 * wrong, and an exception thrown out of the handler for an exception is
 * how a recoverable crash becomes a white page. Returns whether the
 * stash was written, which is what the error screen tells the player.
 */
export function stashRecovery(
  state: GameState,
  storage: SaveStorage,
  savedAt: number = Date.now(),
): boolean {
  try {
    saveGame(state, RECOVERY_SLOT, storage, savedAt);
    return true;
  } catch {
    return false;
  }
}

/** The stashed run, if there is a usable one. Never throws. */
export function readRecovery(storage: SaveStorage): SlotRecord | null {
  const record = readSaveSlot(RECOVERY_SLOT, storage);
  return record.status === "empty" ? null : record;
}

/**
 * Takes the stashed run out of the stash. Clearing it on the way out is
 * deliberate: a stash the player has already been given back should not
 * keep offering itself from the menu forever, and the next crash writes
 * a fresher one anyway.
 */
export function takeRecovery(storage: SaveStorage): GameState {
  const state = loadGame(RECOVERY_SLOT, storage);
  clearRecovery(storage);
  return state;
}

export function clearRecovery(storage: SaveStorage): void {
  removeStored(storage, slotKey(RECOVERY_SLOT));
  removeStored(storage, backupKey(RECOVERY_SLOT));
}

/**
 * Throws a slot away, backup and all. Deleting the backup with it is
 * the point rather than an oversight: delete is what a player reaches
 * for when storage is full, and half a deletion frees half the room. A
 * player who wants the backup restores it first — that is what the
 * button on the broken card is for.
 */
export function deleteSave(slot: SaveSlot, storage: SaveStorage): void {
  removeStored(storage, slotKey(slot));
  removeStored(storage, backupKey(slot));
}

/**
 * Puts a player-entered name on an existing save, leaving the state it
 * holds byte-identical and restamping the checksum over the new meta
 * block. Throws the same errors a load would for a slot that is empty,
 * unparseable, or failing its integrity check — there is nothing to
 * name, and restamping a blob that failed its checksum would launder a
 * corrupt save into one that looks fine. Returns the label as stored,
 * which is the sanitized one.
 */
export function renameSave(
  slot: SaveSlot,
  storage: SaveStorage,
  label: string,
): string {
  const raw = readKey(storage, slotKey(slot));
  if (raw === null) {
    throw new SaveError("missing", slot, `No save in slot "${slot}"`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SaveError("corrupt", slot, `Save in slot "${slot}" is not valid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new SaveError("corrupt", slot, `Save in slot "${slot}" is malformed`);
  }
  const record = parsed as Record<string, unknown>;
  if (checksumStatus(record) === "mismatch") {
    throw new SaveError(
      "checksum",
      slot,
      `Save in slot "${slot}" failed its integrity check`,
      "the stored checksum does not match the stored save",
    );
  }
  const meta = sanitizeSaveExtras(record.meta);
  meta.label = sanitizeSaveLabel(label);
  // The state and its stamp are carried across untouched — a rename
  // must not be able to change, or re-sign, the run it is naming.
  // Renaming is a write like any other, so it takes the same guarded
  // path: a rename that runs out of room must not eat the save.
  writeItem(storage, slotKey(slot), JSON.stringify({ ...record, meta }), {
    guidance: () => quotaGuidance(reclaimable(storage, slot)),
  });
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
  const raw = readKey(storage, slotKey(slot));
  if (raw === null) return emptyRecord(slot);

  const backed = hasBackup(slot, storage);
  const opened = openEnvelope(raw, slot);
  if (!opened.ok) {
    return brokenRecord(slot, opened.meta, opened.savedAt, opened.error, backed);
  }

  const { envelope, meta } = opened;
  const run = summarizeRun(envelope.state);
  if (!versionSupported(envelope.version)) {
    return {
      slot,
      status: "unreadable",
      savedAt: envelope.savedAt,
      label: meta.label,
      thumbnails: meta.thumbnails,
      run,
      error: {
        code: "version-mismatch",
        message: `Save in slot "${slot}" has version ${envelope.version}, expected ${GAME_STATE_VERSION}`,
        detail: "",
      },
      hasBackup: backed,
    };
  }

  return {
    slot,
    status: "ready",
    savedAt: envelope.savedAt,
    label: meta.label,
    thumbnails: meta.thumbnails,
    run,
    error: null,
    hasBackup: backed,
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
    hasBackup: false,
  };
}

function brokenRecord(
  slot: SaveSlot,
  meta: SaveExtras,
  savedAt: number,
  error: { code: SaveErrorCode; message: string; detail: string },
  backed: boolean,
): SlotRecord {
  return {
    slot,
    status: "unreadable",
    savedAt,
    label: meta.label,
    thumbnails: meta.thumbnails,
    run: null,
    error,
    hasBackup: backed,
  };
}

/** Reads one key, treating a storage that throws as an empty one. */
function readKey(storage: SaveStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}
