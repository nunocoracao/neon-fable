import {
  APPEARANCE_FIELDS,
  validateAppearance,
  type Appearance,
} from "../character/appearance";
import { IDENTITY_CATEGORIES, RESTYLE_PRICE } from "../data/stylist";
import type { GameState } from "./gameState";

/**
 * Restyle logic for the Chrome Chapel: pure functions deciding what a
 * stylist session may change and what it costs. The screen collects a
 * requested look; everything that matters — the cosmetic-only rule,
 * validation, payment gating and deduction — happens here, so cancel
 * is a true no-op by construction (nothing touches GameState until
 * applyRestyle returns ok).
 */

/** Why a restyle was refused; the UI maps these to the stylist's lines. */
export type RestyleRefusalReason =
  | "unchanged"
  | "invalid-look"
  | "insufficient-credits";

export type RestyleResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: RestyleRefusalReason };

/**
 * The look a session would actually apply: cosmetic fields from the
 * request, identity fields (build, skin tone — the person, not the
 * style) always kept from the current look, whatever the request says.
 */
export function restyledLook(
  current: Appearance,
  requested: Appearance,
): Appearance {
  const identity: readonly string[] = IDENTITY_CATEGORIES;
  const look = { ...requested };
  for (const field of APPEARANCE_FIELDS) {
    if (identity.includes(field)) look[field] = current[field];
  }
  return look;
}

/** True when the session would visibly change anything (post-merge). */
export function restyleChanged(
  current: Appearance,
  requested: Appearance,
): boolean {
  const look = restyledLook(current, requested);
  return APPEARANCE_FIELDS.some((field) => look[field] !== current[field]);
}

/**
 * Confirm a restyle: merge the request under the cosmetic-only rule,
 * validate it, gate on the fee, and return the new state with the look
 * applied and the payment deducted. Pure — refusals leave the caller's
 * state untouched, and an unchanged look is never charged for.
 */
export function applyRestyle(
  state: GameState,
  requested: Appearance,
  price: number = RESTYLE_PRICE,
): RestyleResult {
  const current = state.player.appearance;
  const look = restyledLook(current, requested);
  if (validateAppearance(look).length > 0) {
    return { ok: false, reason: "invalid-look" };
  }
  if (!restyleChanged(current, requested)) {
    return { ok: false, reason: "unchanged" };
  }
  if (state.credits < price) {
    return { ok: false, reason: "insufficient-credits" };
  }
  return {
    ok: true,
    state: {
      ...state,
      credits: state.credits - price,
      player: { ...state.player, appearance: look },
    },
  };
}
