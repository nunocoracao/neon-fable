/**
 * Icon baking for the combat HUD: action-bar glyphs and condition
 * badges, composed nowhere and baked once. Same compose-bake-cache
 * shape as ./portraits.ts — a grid goes to an offscreen canvas at
 * ART_SCALE, the bake is cached by id, and every call returns a fresh
 * display canvas painted from it, so a glyph can appear on a button and
 * on three chips at once.
 *
 * Condition badges hold frame zero of the arena's own status marker.
 * The mark over a body and the badge on its chip are the same drawing,
 * because they are the same fact; only the one in the arena moves.
 */
import { STATUS_MARKER_ART } from "../iso/art/statusMarkers";
import {
  ACTION_ICON_ART,
  ACTION_ICON_SIZE,
  type ActionIconId,
} from "../iso/art/actionIcons";
import { ART_SCALE, bakeSprite, spriteBytes } from "../iso/art/pixel";
import { createSpriteCache } from "../iso/art/spriteCache";
import type { StatusFamilyId } from "../iso";
import type { Sprite } from "../iso/sprites";

/**
 * Byte budget for baked HUD icons. The whole registry is a handful of
 * 16×16 and 11×11 bakes (~4 KiB each); 256 KiB is room to spare and
 * still a bound.
 */
export const HUD_ICON_CACHE_BUDGET_BYTES = 256 * 1024;

const cache = createSpriteCache<Sprite>(
  HUD_ICON_CACHE_BUDGET_BYTES,
  spriteBytes,
);

/** A display canvas painted from a cached bake, at `size` art pixels. */
function iconCanvas(
  key: string,
  bake: () => Sprite,
  className: string,
  size: number,
): HTMLCanvasElement {
  const baked = cache.get(key, bake);
  const el = document.createElement("canvas");
  el.className = className;
  el.width = size * ART_SCALE;
  el.height = size * ART_SCALE;
  el.getContext("2d")?.drawImage(baked.image, 0, 0);
  return el;
}

/** The action-bar glyph for one action kind. */
export function actionIconCanvas(id: ActionIconId): HTMLCanvasElement {
  return iconCanvas(
    `action:${id}`,
    () => bakeSprite(ACTION_ICON_ART[id], 0, 0),
    "nf-action-glyph",
    ACTION_ICON_SIZE,
  );
}

/** The chip/card badge for one condition family (marker frame zero). */
export function statusIconCanvas(family: StatusFamilyId): HTMLCanvasElement {
  const art = STATUS_MARKER_ART[family];
  const frame = art.frames[0] ?? [];
  return iconCanvas(
    `status:${family}`,
    () => bakeSprite(frame, 0, 0),
    "nf-status-glyph",
    frame.length,
  );
}
