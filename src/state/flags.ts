/**
 * Narrative flags: choices, world events, and stat checks record their
 * outcomes here, and story nodes / dialogue gate on them.
 */
export type FlagValue = boolean | number | string;

export type FlagMap = Record<string, FlagValue>;

export interface HasFlags {
  flags: FlagMap;
}

export function setFlag(state: HasFlags, key: string, value: FlagValue): void {
  state.flags[key] = value;
}

export function getFlag(state: HasFlags, key: string): FlagValue | undefined {
  return state.flags[key];
}

/** True when the flag exists and is not falsy (false, 0, ""). */
export function checkFlag(state: HasFlags, key: string): boolean {
  return Boolean(state.flags[key]);
}

export function hasFlag(state: HasFlags, key: string): boolean {
  return key in state.flags;
}

export function clearFlag(state: HasFlags, key: string): void {
  delete state.flags[key];
}
