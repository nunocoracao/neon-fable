export { createWebAudioAdapter, type AudioAdapter } from "./adapter";
export {
  createAudioBus,
  installAutoUnlock,
  installFocusDucking,
  MUSIC_FADE_SECONDS,
  type AudioBus,
  type AudioBusOptions,
  type FocusDuckTargets,
} from "./bus";
export {
  DEFAULT_MIXER,
  LEGACY_AUDIO_KEY,
  busGain,
  busNodeGain,
  busNodeGains,
  clamp01,
  clampMixer,
  isAudible,
  memoryMixerStore,
  migrateLegacyMixer,
  setBusMuted,
  setBusVolume,
  setDuckOnBlur,
  toggleBusMuted,
  type MixerState,
  type MixerStore,
} from "./mixer";
export {
  FADER_MID,
  FADER_MID_DB,
  FADER_MIN_DB,
  clampFader,
  faderDb,
  faderGain,
  faderPercent,
  formatFader,
  gainToFader,
} from "./gain";
export {
  ATTENDED,
  DUCK_BLURRED_GAIN,
  DUCK_HIDDEN_GAIN,
  applyFocusEvent,
  duckFactor,
  isDucked,
  type FocusEvent,
  type FocusState,
} from "./duck";
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
  FAMILY_BUSES,
  FAMILY_GAINS,
  IMPACT_EVENTS,
  SOUND_EVENT_IDS,
  abilityEvent,
  attackEvent,
  busForEvent,
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
import type { MixerStore } from "./mixer";
import { settings } from "../settings";

/**
 * The mixer lives in the settings store with every other device
 * preference; the audio bus reads and writes it through here. Every
 * write goes through settings.update, so a fader move persists and
 * notifies on exactly the path a text-speed change does.
 */
const mixerStore: MixerStore = {
  get: () => settings.get().mixer,
  set: (next) => void settings.update({ mixer: next }),
};

/**
 * The shared bus every screen imports. Safe to create anywhere — no
 * AudioContext exists until unlock() runs inside a user gesture, and
 * every call is a no-op while audio is unavailable.
 */
export const audio: AudioBus = createAudioBus({
  adapter: createWebAudioAdapter(),
  mixer: mixerStore,
});
