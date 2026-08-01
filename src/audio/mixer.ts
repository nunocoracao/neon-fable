/**
 * Mixer state: a fader position and a mute for each of the four buses
 * (../data/mixBuses.ts), plus whether leaving the page quiets the game.
 * Pure functions over a plain object — every gain the adapter applies is
 * derived here and pinned by tests, and nothing in this file knows what
 * a GainNode is.
 *
 * The state persists inside the settings store (src/settings/settings.ts)
 * rather than in a record of its own, because it is a device preference
 * like every other one on that panel and there was never a reason for it
 * to be saved separately. Installs that predate the four buses still have
 * that separate record, and migrateLegacyMixer below reads it in — once,
 * losslessly, and without touching it afterwards.
 */
import {
  busChain,
  MIX_BUSES,
  MIX_BUS_IDS,
  type MixBusId,
} from "../data/mixBuses";
import { clampFader, faderGain, gainToFader } from "./gain";

export interface MixerState {
  /** Fader positions in [0,1] — see ./gain.ts, these are not amplitudes. */
  readonly volumes: Readonly<Record<MixBusId, number>>;
  readonly mutes: Readonly<Record<MixBusId, boolean>>;
  /** Whether a blurred or hidden page is quieted (see ./duck.ts). */
  readonly duckOnBlur: boolean;
}

function defaultVolumes(): Record<MixBusId, number> {
  const volumes = {} as Record<MixBusId, number>;
  for (const bus of MIX_BUSES) volumes[bus.id] = bus.defaultVolume;
  return volumes;
}

function allUnmuted(): Record<MixBusId, boolean> {
  const mutes = {} as Record<MixBusId, boolean>;
  for (const id of MIX_BUS_IDS) mutes[id] = false;
  return mutes;
}

export const DEFAULT_MIXER: MixerState = {
  volumes: defaultVolumes(),
  mutes: allUnmuted(),
  duckOnBlur: true,
};

/** Clamps a fader position into [0,1]; non-finite values collapse to 0. */
export const clamp01 = clampFader;

export function setBusVolume(
  state: MixerState,
  bus: MixBusId,
  value: number,
): MixerState {
  return {
    ...state,
    volumes: { ...state.volumes, [bus]: clampFader(value) },
  };
}

export function setBusMuted(
  state: MixerState,
  bus: MixBusId,
  muted: boolean,
): MixerState {
  return { ...state, mutes: { ...state.mutes, [bus]: muted } };
}

export function toggleBusMuted(state: MixerState, bus: MixBusId): MixerState {
  return setBusMuted(state, bus, state.mutes[bus] !== true);
}

export function setDuckOnBlur(state: MixerState, on: boolean): MixerState {
  return { ...state, duckOnBlur: on };
}

// --- Gains -------------------------------------------------------------

/**
 * The gain one bus's own node carries: its fader and its own mute, and
 * nothing above it. This is what the adapter writes to a GainNode —
 * master's mute silences the children by being in their signal path, not
 * by being multiplied into each of them.
 */
export function busNodeGain(state: MixerState, bus: MixBusId): number {
  if (state.mutes[bus] === true) return 0;
  return faderGain(state.volumes[bus] ?? 0);
}

/**
 * Every node gain at once, ready for the adapter. `duck` rides on master
 * alone — it is one thing happening to the whole game, and putting it
 * anywhere else would let a bus escape it.
 */
export function busNodeGains(
  state: MixerState,
  duck = 1,
): Record<MixBusId, number> {
  const gains = {} as Record<MixBusId, number>;
  for (const id of MIX_BUS_IDS) {
    gains[id] = busNodeGain(state, id) * (id === "master" ? duck : 1);
  }
  return gains;
}

/**
 * What a sound played on `bus` actually comes out at: the product of
 * every node between it and the output. Zero if anything in that chain
 * is muted, which is how a master mute silences a bus that is itself
 * turned up.
 */
export function busGain(state: MixerState, bus: MixBusId, duck = 1): number {
  const nodes = busNodeGains(state, duck);
  let gain = 1;
  for (const id of busChain(bus)) gain *= nodes[id];
  return gain;
}

/** Whether anything played on this bus would be heard at all. */
export function isAudible(
  state: MixerState,
  bus: MixBusId,
  duck = 1,
): boolean {
  return busGain(state, bus, duck) > 0;
}

// --- Parsing and persistence -------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/** Coerces any value into a valid MixerState, bus by bus. */
export function clampMixer(value: unknown): MixerState {
  const record = asRecord(value);
  if (!record) return DEFAULT_MIXER;
  const volumeRecord = asRecord(record.volumes) ?? {};
  const muteRecord = asRecord(record.mutes) ?? {};
  const volumes = {} as Record<MixBusId, number>;
  const mutes = {} as Record<MixBusId, boolean>;
  for (const bus of MIX_BUSES) {
    const stored = volumeRecord[bus.id];
    volumes[bus.id] =
      typeof stored === "number" && Number.isFinite(stored)
        ? clampFader(stored)
        : bus.defaultVolume;
    mutes[bus.id] = muteRecord[bus.id] === true;
  }
  return {
    volumes,
    mutes,
    // Ducking defaults on: a payload that predates the setting is a
    // player who never asked for a page that plays to an empty room.
    duckOnBlur: record.duckOnBlur !== false,
  };
}

/**
 * Where the mixer lived before it had buses: its own localStorage
 * record, holding linear amplitudes for master/sfx/music and one global
 * mute. Read once by the settings loader when the settings payload has
 * no mixer of its own, and left in place afterwards.
 */
export const LEGACY_AUDIO_KEY = "neon-fable:audio";

/** The amplitudes the old mixer shipped with, for fields a record lacks. */
const LEGACY_DEFAULTS = { master: 0.8, sfx: 0.9, music: 0.6 };

/**
 * An old three-channel record as four buses, at the same loudness.
 *
 * The old numbers were amplitudes and the new ones are fader positions,
 * so each is put through gainToFader: a player who had master at 0.5
 * gets the position that *is* 0.5, and hears exactly what they heard
 * yesterday. The UI bus did not exist and its sounds rode the SFX
 * channel, so it inherits the SFX level — the same reasoning, applied to
 * a bus that is being split out rather than converted.
 */
export function migrateLegacyMixer(value: unknown): MixerState {
  const record = asRecord(value);
  if (!record) return DEFAULT_MIXER;
  const amplitude = (key: keyof typeof LEGACY_DEFAULTS): number => {
    const stored = record[key];
    return typeof stored === "number" && Number.isFinite(stored)
      ? Math.min(1, Math.max(0, stored))
      : LEGACY_DEFAULTS[key];
  };
  return {
    volumes: {
      master: gainToFader(amplitude("master")),
      music: gainToFader(amplitude("music")),
      sfx: gainToFader(amplitude("sfx")),
      ui: gainToFader(amplitude("sfx")),
    },
    // One mute, and it was the whole game: master's.
    mutes: { ...allUnmuted(), master: record.muted === true },
    duckOnBlur: true,
  };
}

/**
 * The mixer's home. The audio bus reads and writes through this rather
 * than owning the state, so production can hand it the settings store
 * and tests can hand it an object.
 */
export interface MixerStore {
  get(): MixerState;
  set(next: MixerState): void;
}

/** A store backed by nothing, for tests and for audio without settings. */
export function memoryMixerStore(
  initial: MixerState = DEFAULT_MIXER,
): MixerStore {
  let current = initial;
  return {
    get: () => current,
    set: (next) => {
      current = next;
    },
  };
}
