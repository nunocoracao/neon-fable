/**
 * What the visual settings resolve to for the code that paints.
 *
 * The colour mode is stored as one id (see src/data/accessibility.ts)
 * and consumed as two — a telegraph tint palette and an interactable
 * outline palette. Resolving it lives here, next to the record and
 * below the renderers, so a scene asks the settings what palette it is
 * on rather than importing a settings-shaped table out of the UI layer.
 */

import { requireColorMode } from "../data/accessibility";
import type { OutlinePaletteId } from "../iso/affordance";
import type { TelegraphPaletteId } from "../iso/telegraphPalette";
import type { Settings } from "./settings";

/** The tint table the combat grid and the scene's vision cones use. */
export function telegraphPaletteFor(current: Settings): TelegraphPaletteId {
  return requireColorMode(current.colorMode).telegraphPalette;
}

/** The colour a focused interactable is traced in. */
export function outlinePaletteFor(current: Settings): OutlinePaletteId {
  return requireColorMode(current.colorMode).outlinePalette;
}
