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
  composeVisualPortrait,
  defaultAppearance,
  portraitKey,
  visualPortraitKey,
  type Appearance,
  type CharacterVisual,
} from "../character";
import type { PixelGrid } from "../iso/art/pixel";
import type { ExpressionId } from "../data/appearance";
import { companionLook, getCompanion } from "../data/companions";
import { enemyLook, getEnemy, parseEnemySpriteId } from "../data/enemies";
import { DRONE_ART, MECH_ART } from "../iso";
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
  return gridPortraitCanvas(key, () =>
    composePortrait(look, equipment, expression),
  );
}

/**
 * A display canvas for any composed portrait grid, baked and cached
 * under `key`. Every portrait in the game goes through here — the
 * player's, an authored look's, and the authored grids of the things
 * that were never people (the combat drone's camera-eye plate).
 */
export function gridPortraitCanvas(
  key: string,
  compose: () => PixelGrid,
): HTMLCanvasElement {
  const baked = cache.get(`portrait:${key}`, () =>
    bakeSprite(compose(), 0, 0),
  );

  const el = document.createElement("canvas");
  el.className = "nf-portrait";
  el.width = PORTRAIT_FRAME.width * ART_SCALE;
  el.height = PORTRAIT_FRAME.height * ART_SCALE;
  el.getContext("2d")?.drawImage(baked.image, 0, 0);
  return el;
}

/**
 * The portrait for an authored non-player look — a named NPC, one
 * record of an enemy archetype's look family — through the same bake
 * and cache as the player's. Gear on a visual resolves exactly like
 * equipment, so an enemy's coat and optics show in its portrait the way
 * they show on its sprite, crew dye included.
 */
export function visualPortraitCanvas(
  visual: CharacterVisual,
  expression: ExpressionId = "neutral",
): HTMLCanvasElement {
  let key: string;
  try {
    key = visualPortraitKey(visual, expression);
  } catch (error) {
    console.error("Invalid appearance; rendering the default portrait", error);
    return portraitCanvas(defaultAppearance(), emptyPortraitEquipment(), expression);
  }
  return gridPortraitCanvas(key, () => composeVisualPortrait(visual, expression));
}

/** No gear at all: what the fallback portrait wears. */
function emptyPortraitEquipment(): EquipmentState {
  return { weapon: null, outfit: null, enhancements: {} };
}

/**
 * The face for a companion, wearing the look the party member is in.
 * Derived from the same CharacterVisual their sprite composes from, so
 * the chip in the initiative rail is the body on the board. Unknown
 * companion ids fall back to the stock look rather than an empty chip.
 */
export function companionPortraitCanvas(
  companionId: string | null,
  lookId: string | null,
  expression: ExpressionId = "neutral",
): HTMLCanvasElement {
  const companion = companionId ? getCompanion(companionId) : undefined;
  if (!companion) {
    return portraitCanvas(defaultAppearance(), emptyPortraitEquipment(), expression);
  }
  return visualPortraitCanvas(
    companionLook(companion, lookId ?? companion.defaultLookId).visual,
    expression,
  );
}

/**
 * The face in the initiative rail for one enemy on the board: the
 * record of its archetype's look family it is actually wearing, or —
 * for the archetypes that were never people — the authored portrait its
 * sprite set carries. Every enemy has a face here; an unknown id falls
 * back to the stock look rather than an empty chip.
 */
export function enemyPortraitCanvas(
  enemyId: string | null,
  lookIndex = 0,
  expression: ExpressionId = "grim",
): HTMLCanvasElement {
  const parsed = parseEnemySpriteId(enemyId ?? "");
  const enemy = getEnemy(parsed.enemyId);
  if (enemy?.spriteKind === "drone") {
    // No appearance to derive from: a camera plate, authored whole.
    return gridPortraitCanvas(
      `drone:${enemy.droneArt}`,
      () => DRONE_ART[enemy.droneArt].portrait,
    );
  }
  if (enemy?.spriteKind === "mech") {
    // Likewise: a chassis has no face, only a cowl and an optic.
    return gridPortraitCanvas(
      `mech:${enemy.mechArt}`,
      () => MECH_ART[enemy.mechArt].portrait,
    );
  }
  const visual = enemy ? enemyLook(enemy, lookIndex) : undefined;
  return visual
    ? visualPortraitCanvas(visual, expression)
    : portraitCanvas(defaultAppearance(), emptyPortraitEquipment(), expression);
}
