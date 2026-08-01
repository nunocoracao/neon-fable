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
  SOUND_IDS,
  SOUND_PATCHES,
  getPatch,
  patchLayerGain,
  patchPeakGain,
  type SoundId,
  type SynthPatch,
} from "./patches";
export {
  ABILITY_EVENTS,
  ATTACK_EVENTS,
  FAMILY_GAINS,
  IMPACT_EVENTS,
  SOUND_EVENT_IDS,
  abilityEvent,
  attackEvent,
  eventFamily,
  eventsInFamily,
  impactEvent,
  isRangedAttack,
  isSoundEvent,
  patchForEvent,
  type SoundEventId,
  type SoundFamily,
} from "./events";
export {
  CUE_MERGE_MS,
  MAX_PENDING_CUES,
  NO_CUES,
  STALE_CUE_MS,
  collectDueCues,
  createCueScheduler,
  queueCue,
  queueCues,
  type CueQueue,
  type CueScheduler,
  type DueCues,
  type SoundCue,
} from "./cues";

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
