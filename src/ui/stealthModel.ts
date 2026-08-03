/**
 * Turning a watch into something on screen: which tint each tile takes,
 * which sprite each guard is drawn as, and the words for the one line
 * of prompt a crossing ever shows.
 *
 * Pure presentation, like ./format.ts and ./combatHud.ts: no DOM, no
 * canvas, no game state. The rules decide who is holding what (see
 * src/stealth/); this decides what that looks like and what it is
 * called.
 */
import type { SceneEntity, SceneTint } from "../iso";
import type { Detection, GuardView, LungeOffer, TakedownOffer } from "../stealth";
import { earshotOnlyTiles, watchedTiles } from "../stealth";
import { t } from "./strings";

/** The key that takes whichever quiet option is under the player's feet. */
export const STEALTH_ACTION_KEY = "f";
/** The key that drops the player into a crouch, and stands them up. */
export const CROUCH_KEY = "x";

/**
 * The ground a watch is holding, in the arena's own roles: a cone is
 * `range` (the dashed amber a reaching action is drawn in), the ring
 * ordinary footsteps carry to is `threat` (the hazard hatching that
 * already means "do not be standing there"), and the tile a guard is on
 * is `origin`.
 *
 * Crouching drops the earshot ring entirely rather than dimming it,
 * because it is not a smaller danger while crouched — it is not a
 * danger at all, and the tint going away is the clearest possible way
 * to say the key did something.
 */
export function watchTints(
  views: readonly GuardView[],
  options: { crouched: boolean },
): SceneTint[] {
  const tints: SceneTint[] = [];
  if (!options.crouched) {
    for (const tile of earshotOnlyTiles(views)) {
      tints.push({ x: tile.x, y: tile.y, tint: "threat" });
    }
  }
  for (const tile of watchedTiles(views)) {
    tints.push({ x: tile.x, y: tile.y, tint: "range" });
  }
  for (const view of views) {
    tints.push({ x: view.tile.x, y: view.tile.y, tint: "origin" });
  }
  return tints;
}

/** The patrol as figures for the scene's depth-sorted entity pass. */
export function guardEntities(views: readonly GuardView[]): SceneEntity[] {
  return views.map((view) => ({
    spriteId: view.spriteId,
    position: { x: view.x, y: view.y },
    facing: view.facing,
    moving: view.moving,
  }));
}

/**
 * The one line of prompt a crossing shows: the takedown if there is a
 * neck within reach, otherwise the dash if there is a gap under your
 * feet, otherwise nothing. Refusals are deliberately silent — a prompt
 * that explains why you cannot do the thing you have not asked to do is
 * noise, and the two that matter (spent, too slow) are said in the
 * moment the player presses the key.
 */
export function stealthPrompt(
  takedown: TakedownOffer,
  lunge: LungeOffer,
): string | null {
  const key = STEALTH_ACTION_KEY.toUpperCase();
  if (takedown.ok) return `${key} — take down ${takedown.guard.name}`;
  if (lunge.ok) return `${key} — lunge past ${lunge.pinch.label}`;
  return null;
}

/** What pressing the key with nothing on offer is worth saying about. */
export function stealthRefusal(
  takedown: TakedownOffer,
  lunge: LungeOffer,
): string | null {
  if (!takedown.ok && takedown.reason === "spent") {
    return t("stealth.refusal.spent");
  }
  if (!takedown.ok && takedown.reason === "aware") {
    return t("stealth.refusal.aware");
  }
  if (!lunge.ok && lunge.reason === "too-slow") {
    return t("stealth.refusal.tooSlow");
  }
  return null;
}

/** The line the shell shows when a takedown lands. */
export function takedownLine(guard: GuardView): string {
  return t("stealth.takedown", { name: sentenceCase(guard.name) });
}

/**
 * The caught-you line: what they shout, and — when it was a footstep
 * rather than a look — that it was the noise that did it, because a
 * player who was crouching and stood up deserves to know which mistake
 * they made.
 */
export function spottedLine(detection: Detection): string {
  const heard = detection.sense === "sound" ? t("stealth.heard") : "";
  return `${heard}${detection.bark}`;
}

/** The HUD's word for how the player is moving. */
export function crouchLabel(crouched: boolean): string {
  return crouched
    ? `Crouched [${CROUCH_KEY.toUpperCase()}]`
    : `Standing [${CROUCH_KEY.toUpperCase()}]`;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
