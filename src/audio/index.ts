export { createWebAudioAdapter, type AudioAdapter } from "./adapter";
export {
  createAudioBus,
  installAutoUnlock,
  MUSIC_FADE_SECONDS,
  type AudioBus,
  type AudioBusOptions,
} from "./bus";
export {
  AUDIO_SETTINGS_KEY,
  DEFAULT_MIXER,
  clamp01,
  effectiveGain,
  loadMixerSettings,
  parseMixer,
  saveMixerSettings,
  serializeMixer,
  setMuted,
  setVolume,
  toggleMuted,
  type AudioSettingsStorage,
  type MixerState,
  type VolumeChannel,
} from "./mixer";
export {
  collectDue,
  createSequencer,
  layerGrid,
  voiceSpec,
  type LayerGrid,
  type ScheduledNote,
  type SequencerState,
  type VoiceSpec,
} from "./music";
export {
  MODE_LAYERS,
  MUSIC_MODES,
  arrangementFor,
  arrangementVoice,
  barSeconds,
  getTheme,
  layerKey,
  musicScene,
  nextBarTime,
  phaseParams,
  planCrossfade,
  sceneEquals,
  selectLayers,
  themeForMap,
  type Arrangement,
  type CrossfadePlan,
  type MusicMode,
  type MusicScene,
} from "./score";
export {
  HEAVY_HIT_DAMAGE,
  SOUND_IDS,
  SOUND_PATCHES,
  getPatch,
  hitSoundForDamage,
  type SoundId,
  type SynthPatch,
} from "./patches";

import { createWebAudioAdapter } from "./adapter";
import { createAudioBus, type AudioBus } from "./bus";
import type { AudioSettingsStorage } from "./mixer";

function defaultStorage(): AudioSettingsStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * The shared bus every screen imports. Safe to create anywhere — no
 * AudioContext exists until unlock() runs inside a user gesture, and
 * every call is a no-op while audio is unavailable.
 */
export const audio: AudioBus = createAudioBus({
  adapter: createWebAudioAdapter(),
  storage: defaultStorage(),
});
