/**
 * The save screen, as data.
 *
 * One pure function turns the four slot records the storage layer reads
 * (src/state/save.ts) into the four cards the panel paints, and every
 * decision the panel could get wrong is made here instead: what a card
 * says, which buttons it offers, and how hard it is to throw a run away.
 *
 * Two rules shape the whole thing:
 *
 *  - **A card is never missing.** An empty slot, a slot from another
 *    build, and a slot holding nothing but broken JSON all produce a
 *    card. The screen has no branch that can fail to draw one.
 *  - **A card never depends on a picture.** Thumbnails are optional at
 *    every layer; a card with none says so with a placeholder and loses
 *    nothing else.
 */
import { actTitle, getBackground, getDifficulty, getMap } from "../data";
import type { SaveSlot, SlotRecord, SlotStatus } from "../state";
import { SAVE_LABEL_MAX_LENGTH, sanitizeSaveLabel } from "../state";
import { formatTimestamp, slotDisplayName } from "./format";

/** How a card asks before it throws a save away. */
export type DeleteGuard = "click" | "type-name";

/**
 * Past the first chapter a save is somebody's evening rather than
 * somebody's first ten minutes, so deleting it costs a typed name
 * instead of a second click.
 */
export const TYPED_CONFIRM_FROM_ACT = 2;

export interface SlotCard {
  slot: SaveSlot;
  status: SlotStatus;
  /** "Slot 1", "Autosave" — what the slot is, always shown. */
  slotName: string;
  /** The player's label for this save; "" when never renamed. */
  label: string;
  /** Runner and origin: "Vex — Gutter Courier". "" when unknown. */
  identity: string;
  /** Chapter and district: "Act 2 · The Cordon — Greywater Steps". */
  chapter: string;
  /** What the run has turned over: "4 shards · 6 fights won". */
  progress: string;
  /** The preset, and whether it was moved mid-run. */
  difficultyLabel: string;
  /** Short chips: New Game+, and anything else worth flagging. */
  badges: string[];
  savedAtLabel: string;
  /** Data URLs, or null for the placeholder silhouette / bare frame. */
  portrait: string | null;
  scene: string | null;
  /** Gentle one-liner for a slot that failed validation. */
  notice: string | null;
  /**
   * The precise part, for a player who is reporting it: the field that
   * failed and what it should have been, or the migration step that
   * could not be completed. "" when there is nothing more to say.
   */
  detail: string;
  canSave: boolean;
  canLoad: boolean;
  canRename: boolean;
  canDelete: boolean;
  /**
   * True when this slot is unreadable *and* the generation before it
   * survived. The one button on a broken card that is not "delete".
   */
  canRestoreBackup: boolean;
  deleteGuard: DeleteGuard;
  /** The word a type-name delete wants back; "" when it wants none. */
  confirmWord: string;
}

/** Mode the panel is in: mid-run (saving allowed) or from the title. */
export type SaveMode = "game" | "menu";

export function slotCards(
  records: readonly SlotRecord[],
  mode: SaveMode,
): SlotCard[] {
  return records.map((record) => slotCard(record, mode));
}

export function slotCard(record: SlotRecord, mode: SaveMode): SlotCard {
  const run = record.run;
  const readable = record.status === "ready";
  // The autosave slot is load-only everywhere; the manual three accept
  // saves only from inside a run.
  const canSave = mode === "game" && record.slot !== "autosave";
  const occupied = record.status !== "empty";

  return {
    slot: record.slot,
    status: record.status,
    slotName: slotDisplayName(record.slot),
    label: record.label,
    identity: run ? identityLine(run.characterName, run.backgroundId) : "",
    chapter: run ? chapterLine(run.act, run.location) : "",
    progress: run ? progressLine(run.shardsFound, run.victories) : "",
    difficultyLabel: run
      ? difficultyLine(run.difficulty, run.difficultyChanged)
      : "",
    badges: run ? badgesFor(run.newGamePlus) : [],
    savedAtLabel: record.savedAt > 0 ? formatTimestamp(record.savedAt) : "",
    portrait: record.thumbnails.portrait,
    scene: record.thumbnails.scene,
    notice: noticeFor(record),
    detail: record.error?.detail ?? "",
    canSave,
    canLoad: readable,
    // A save this build cannot read can still be named — the label
    // lives beside the state, not in it — but only for a save that is
    // intact and merely from elsewhere. Nothing can be written into
    // broken JSON, and restamping a save that failed its checksum would
    // turn a corrupt file into one that looks fine.
    canRename:
      occupied && (readable || record.error?.code === "version-mismatch"),
    canDelete: occupied,
    canRestoreBackup: record.status === "unreadable" && record.hasBackup,
    deleteGuard: deleteGuardFor(record),
    confirmWord: confirmWordFor(record),
  };
}

/** Whether a typed confirmation matches the name a card asked for. */
export function deleteConfirmed(card: SlotCard, typed: string): boolean {
  if (card.deleteGuard === "click") return true;
  return typed.trim().toLowerCase() === card.confirmWord.trim().toLowerCase();
}

/**
 * What is wrong with a label the player is typing, or null. Empty is
 * allowed and means "no label" — clearing a name is not an error.
 */
export function renameError(raw: string): string | null {
  if (raw.length > 0 && sanitizeSaveLabel(raw).length === 0) {
    return "Enter a name, or leave it blank to clear the label.";
  }
  if (raw.trim().length > SAVE_LABEL_MAX_LENGTH) {
    return `Labels cap at ${SAVE_LABEL_MAX_LENGTH} characters.`;
  }
  return null;
}

/** The line the panel puts at the top of a card. */
export function cardTitle(card: SlotCard): string {
  return card.label.length > 0 ? card.label : card.slotName;
}

/* ------------------------------------------------------------------ *
 * Lines
 * ------------------------------------------------------------------ */

function identityLine(name: string, backgroundId: string): string {
  const runner = name.trim().length > 0 ? name.trim() : "Unnamed runner";
  const background = getBackground(backgroundId)?.name;
  return background ? `${runner} — ${background}` : runner;
}

function chapterLine(act: number, location: string): string {
  const chapter = `Act ${act} · ${actTitle(act)}`;
  const place = location ? (getMap(location)?.name ?? location) : "";
  return place ? `${chapter} — ${place}` : chapter;
}

function progressLine(shards: number, victories: number): string {
  const parts = [
    `${shards} ${shards === 1 ? "shard" : "shards"}`,
    `${victories} ${victories === 1 ? "fight" : "fights"} won`,
  ];
  return parts.join(" · ");
}

function difficultyLine(difficulty: string, changed: boolean): string {
  const label = getDifficulty(difficulty)?.label ?? difficulty;
  return changed ? `${label} (changed mid-run)` : label;
}

function badgesFor(newGamePlus: boolean): string[] {
  return newGamePlus ? ["NG+"] : [];
}

/**
 * What a broken slot says. Deliberately unalarming and deliberately
 * specific: the player is told which slot is unusable and why, and
 * nothing suggests the rest of the screen is in danger.
 */
function noticeFor(record: SlotRecord): string | null {
  if (!record.error) return null;
  switch (record.error.code) {
    case "version-mismatch":
      return "Saved by a different version of the game — it cannot be loaded here.";
    case "corrupt":
      return record.hasBackup
        ? "This save could not be read. The backup from before it was written is still here."
        : "This save could not be read. Everything else is fine.";
    case "checksum":
      return record.hasBackup
        ? "This save changed after it was written and cannot be trusted. The backup from before it was written is still here."
        : "This save changed after it was written and cannot be trusted.";
    case "migration-failed":
      return "This save could not be updated for this version of the game. It has been left exactly as it was.";
    case "missing":
      return null;
  }
}

function deleteGuardFor(record: SlotRecord): DeleteGuard {
  const act = record.run?.act ?? 1;
  return act >= TYPED_CONFIRM_FROM_ACT && confirmWordFor(record).length > 0
    ? "type-name"
    : "click";
}

function confirmWordFor(record: SlotRecord): string {
  return record.run?.characterName.trim() ?? "";
}
