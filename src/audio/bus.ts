/**
 * The AudioBus is the game-facing surface: `play(soundId)` for SFX,
 * `setMusicContext(id)` for ambient loops, and the mixer controls.
 * It owns mixer state (persisted), sequencer state (pure), and a music
 * scheduler tick; all actual sound goes through the injected adapter,
 * so tests drive the bus with a fake and the browser gets Web Audio.
 */
import type { AudioAdapter } from "./adapter";
import {
  effectiveGain,
  loadMixerSettings,
  saveMixerSettings,
  setMuted as mixerSetMuted,
  setVolume as mixerSetVolume,
  toggleMuted as mixerToggleMuted,
  type AudioSettingsStorage,
  type MixerState,
  type VolumeChannel,
} from "./mixer";
import { collectDue, createSequencer, type MusicContextId, type SequencerState } from "./music";
import { SOUND_PATCHES, type SoundId } from "./patches";

/** Seconds of crossfade when the music context changes. */
export const MUSIC_FADE_SECONDS = 0.8;
/** Seconds of notes scheduled ahead per tick. */
const LOOKAHEAD_SECONDS = 0.3;
/** Milliseconds between scheduler ticks. */
const TICK_INTERVAL_MS = 100;

export interface AudioBusOptions {
  adapter: AudioAdapter;
  storage?: AudioSettingsStorage | null;
  /** Tick period; 0 disables the timer (tests call tick() directly). */
  tickIntervalMs?: number;
}

export interface AudioBus {
  /** Fire-and-forget SFX; a safe no-op when audio is unavailable. */
  play(id: SoundId): void;
  /** Switch the ambient loop; null fades music out. */
  setMusicContext(context: MusicContextId | null): void;
  getMusicContext(): MusicContextId | null;
  /** Call from a user gesture; true once the context is running. */
  unlock(): boolean;
  /** One scheduler step — normally timer-driven, public for tests. */
  tick(): void;
  getMixer(): MixerState;
  setVolume(channel: VolumeChannel, value: number): void;
  setMuted(muted: boolean): void;
  toggleMuted(): boolean;
}

export function createAudioBus(options: AudioBusOptions): AudioBus {
  const { adapter } = options;
  const storage = options.storage ?? null;
  const tickIntervalMs = options.tickIntervalMs ?? TICK_INTERVAL_MS;

  let mixer = loadMixerSettings(storage);
  let musicContext: MusicContextId | null = null;
  let sequencer: SequencerState | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  function applyGains(): void {
    adapter.setChannelGains(
      effectiveGain(mixer, "sfx"),
      effectiveGain(mixer, "music"),
    );
  }
  applyGains();

  function persist(): void {
    saveMixerSettings(mixer, storage);
  }

  function ensureTimer(): void {
    if (tickIntervalMs <= 0) return;
    if (musicContext !== null && timer === null) {
      timer = setInterval(tick, tickIntervalMs);
    } else if (musicContext === null && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function tick(): void {
    if (musicContext === null || !adapter.running) return;
    if (effectiveGain(mixer, "music") <= 0) {
      // Muted: drop the sequencer so unmuting restarts cleanly instead
      // of flushing a backlog of past-due notes.
      sequencer = null;
      return;
    }
    const now = adapter.now();
    if (!sequencer) {
      sequencer = createSequencer(musicContext, now + 0.05);
    } else if (sequencer.nextStepTime < now - LOOKAHEAD_SECONDS) {
      // Timer starvation (background tab): rejoin at the current time.
      sequencer = { ...sequencer, nextStepTime: now + 0.05 };
    }
    const due = collectDue(sequencer, now + LOOKAHEAD_SECONDS);
    sequencer = due.state;
    for (const note of due.notes) {
      adapter.scheduleNote(note);
    }
  }

  return {
    play(id: SoundId): void {
      if (effectiveGain(mixer, "sfx") <= 0) return;
      adapter.playPatch(SOUND_PATCHES[id]);
    },

    setMusicContext(context: MusicContextId | null): void {
      if (context === musicContext) return;
      musicContext = context;
      sequencer = null;
      if (context === null) {
        adapter.stopMusicLayer(MUSIC_FADE_SECONDS);
      } else {
        adapter.swapMusicLayer(MUSIC_FADE_SECONDS);
      }
      ensureTimer();
      tick();
    },

    getMusicContext: () => musicContext,

    unlock(): boolean {
      const running = adapter.unlock();
      applyGains();
      ensureTimer();
      return running;
    },

    tick,

    getMixer: () => mixer,

    setVolume(channel: VolumeChannel, value: number): void {
      mixer = mixerSetVolume(mixer, channel, value);
      persist();
      applyGains();
    },

    setMuted(muted: boolean): void {
      mixer = mixerSetMuted(mixer, muted);
      persist();
      applyGains();
    },

    toggleMuted(): boolean {
      mixer = mixerToggleMuted(mixer);
      persist();
      applyGains();
      return mixer.muted;
    },
  };
}

/**
 * Retries unlock on user gestures until the context runs, then detaches.
 * Capture phase so the context resumes before the click's own sounds.
 */
export function installAutoUnlock(
  bus: AudioBus,
  target: Pick<Window, "addEventListener" | "removeEventListener"> = window,
): void {
  const onGesture = (): void => {
    if (bus.unlock()) {
      target.removeEventListener("pointerdown", onGesture, true);
      target.removeEventListener("keydown", onGesture, true);
    }
  };
  target.addEventListener("pointerdown", onGesture, true);
  target.addEventListener("keydown", onGesture, true);
}
