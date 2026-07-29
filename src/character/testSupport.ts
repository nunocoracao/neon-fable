import { DEFAULT_BACKGROUND_ID, getBackground } from "../data/backgrounds";
import { defaultAppearance, type Appearance } from "./appearance";
import { createCharacter, defaultAllocation } from "./create";
import type { CharacterState } from "./create";
import type { Stats } from "./stats";

/**
 * Centralized character fixtures for tests and dev tooling — the one
 * place a character may be conjured from thin air. Everything funnels
 * through createCharacter, so every fixture carries a validated,
 * catalog-backed appearance exactly like a character the creation
 * wizard would produce.
 */

/** The always-valid stock look, with per-field overrides for variety. */
export function fixtureAppearance(
  overrides: Partial<Appearance> = {},
): Appearance {
  return { ...defaultAppearance(), ...overrides };
}

export interface FixtureCharacterOptions {
  name?: string;
  backgroundId?: string;
  /** Point-buy allocation, before background bonuses. */
  allocation?: Stats;
  /** Point pool the allocation must spend (New Game+ passes more). */
  pointPool?: number;
  appearance?: Appearance;
}

/** A fully created character; defaults match a stock gutter-courier. */
export function fixtureCharacter(
  options: FixtureCharacterOptions = {},
): CharacterState {
  const backgroundId = options.backgroundId ?? DEFAULT_BACKGROUND_ID;
  const background = getBackground(backgroundId);
  if (!background) {
    throw new Error(`fixtureCharacter: unknown background "${backgroundId}"`);
  }
  return createCharacter({
    name: options.name ?? "Vex",
    background,
    allocation: options.allocation ?? defaultAllocation(),
    pointPool: options.pointPool,
    appearance: options.appearance ?? fixtureAppearance(),
  });
}
