/**
 * Portrait baking for the DOM screens: composes a portrait grid
 * (src/character/portrait), bakes it to an offscreen canvas at
 * ART_SCALE, and caches the bake keyed by portraitKey — the same
 * compose-bake-cache shape the sprite provider uses. Each call returns
 * a fresh display canvas painted from the cached bake, so several
 * screens can show the same portrait at once. A corrupt appearance
 * degrades to the stock look instead of crashing the screen (missing
 * content degrades, never crashes).
 */
import {
  composePortrait,
  defaultAppearance,
  portraitKey,
  type Appearance,
} from "../character";
import type { ExpressionId } from "../data/appearance";
import type { EquipmentState } from "../inventory/equipment";
import { ART_SCALE, bakeSprite, spriteBytes } from "../iso/art/pixel";
import { PORTRAIT_FRAME } from "../iso/art/layers/portrait";
import { createSpriteCache } from "../iso/art/spriteCache";
import type { Sprite } from "../iso/sprites";

/**
 * Byte budget for baked portrait canvases. A 48×48-at-2x bake holds
 * ~36 KiB; 4 MiB keeps every look a session realistically cycles
 * through while bounding appearance churn.
 */
export const PORTRAIT_CACHE_BUDGET_BYTES = 4 * 1024 * 1024;

const cache = createSpriteCache<Sprite>(
  PORTRAIT_CACHE_BUDGET_BYTES,
  spriteBytes,
);

/**
 * A display canvas showing the portrait for an appearance, equipment,
 * and expression, at PORTRAIT_FRAME size × ART_SCALE.
 */
export function portraitCanvas(
  appearance: Appearance,
  equipment: EquipmentState,
  expression: ExpressionId = "neutral",
): HTMLCanvasElement {
  let look = appearance;
  let key: string;
  try {
    key = portraitKey(look, equipment, expression);
  } catch (error) {
    console.error("Invalid appearance; rendering the default portrait", error);
    look = defaultAppearance();
    key = portraitKey(look, equipment, expression);
  }
  const baked = cache.get(`portrait:${key}`, () =>
    bakeSprite(composePortrait(look, equipment, expression), 0, 0),
  );

  const el = document.createElement("canvas");
  el.className = "nf-portrait";
  el.width = PORTRAIT_FRAME.width * ART_SCALE;
  el.height = PORTRAIT_FRAME.height * ART_SCALE;
  el.getContext("2d")?.drawImage(baked.image, 0, 0);
  return el;
}
