/**
 * The AudioBus is the game-facing surface: `play(soundId)` for SFX,
 * `setMusicScene(scene)` for the adaptive score, and the mixer controls.
 * It owns mixer state (persisted), the set of running stems, and the
 * scheduler tick; all actual sound goes through the injected adapter, so
 * tests drive the bus with a fake and the browser gets Web Audio.
 *
 * Screens describe *where the player is and what is happening* — a
 * district theme, a mode, an hour — and never which layers that means.
 * The bus compares the scene it is given against the arrangement it is
 * playing, asks ./score.ts for a crossfade plan on the next bar line,
 * and moves the stems named in it. Everything about which layers and
 * when is pure and lives there; what is here is bookkeeping.
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
import {
  collectDue,
  createSequencer,
  type SequencerState,
  type VoiceSpec,
} from "./music";
import {
  arrangementFor,
  arrangementVoice,
  layerKey,
  planCrossfade,
  sceneEquals,
  type Arrangement,
  type MusicMode,
  type MusicScene,
} from "./score";
import { SOUND_PATCHES, type SoundId } from "./patches";
import type { MusicLayerRole } from "../data/music";

/** Seconds of crossfade between arrangements. */
export const MUSIC_FADE_SECONDS = 0.8;
/** Seconds of notes scheduled ahead per tick. */
const LOOKAHEAD_SECONDS = 0.3;
/** Milliseconds between scheduler ticks. */
const TICK_INTERVAL_MS = 100;
/** Seconds ahead of the clock a fresh arrangement starts. */
const START_LEAD_SECONDS = 0.05;

/** One stem, playing. */
interface LiveVoice {
  role: MusicLayerRole;
  spec: VoiceSpec;
  seq: SequencerState;
  /** Stop emitting after this time and drop the layer; null = open. */
  until: number | null;
}

export interface AudioBusOptions {
  adapter: AudioAdapter;
  storage?: AudioSettingsStorage | null;
  /** Tick period; 0 disables the timer (tests call tick() directly). */
  tickIntervalMs?: number;
}

export interface AudioBus {
  /** Fire-and-forget SFX; a safe no-op when audio is unavailable. */
  play(id: SoundId): void;
  /** Set what the score is underscoring; null fades music out. */
  setMusicScene(scene: MusicScene | null): void;
  /** Change mode alone — the district and hour carry through the fight. */
  setMusicMode(mode: MusicMode): void;
  getMusicScene(): MusicScene | null;
  /** The stems currently running, in mix order. For tests and dev. */
  getMusicLayers(): readonly MusicLayerRole[];
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
  let scene: MusicScene | null = null;
  /** What is actually playing; null while nothing is. */
  let arrangement: Arrangement | null = null;
  /** Bar-grid origin the running arrangement is counting from. */
  let origin = 0;
  let voices = new Map<string, LiveVoice>();
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
    if (scene !== null && timer === null) {
      timer = setInterval(tick, tickIntervalMs);
    } else if (scene === null && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  /** Everything stops and is forgotten; the next tick starts afresh. */
  function clearMusic(fadeSeconds: number): void {
    if (voices.size > 0) adapter.stopMusicLayer(fadeSeconds);
    voices = new Map();
    arrangement = null;
    origin = 0;
  }

  /** Moves the running stems onto `target`, fading on a bar line. */
  function transition(target: Arrangement, now: number): void {
    const plan = planCrossfade({
      from: arrangement,
      to: target,
      origin,
      now,
      fadeSeconds: MUSIC_FADE_SECONDS,
      lead: arrangement === null ? START_LEAD_SECONDS : LOOKAHEAD_SECONDS,
    });

    if (arrangement !== null) {
      for (const role of plan.fadeOut) {
        const key = layerKey(arrangement.themeId, arrangement.dayPhase, role);
        const voice = voices.get(key);
        if (!voice) continue;
        voice.until = plan.at + plan.fadeSeconds;
        adapter.rampLayer(key, 0, plan.at, plan.fadeSeconds);
      }
    }

    for (const role of plan.fadeIn) {
      const spec = arrangementVoice(target, role);
      // A stem being brought back before its own fade-out finished: drop
      // the dying voice first so the two never share a gain node.
      if (voices.has(spec.layer)) {
        voices.delete(spec.layer);
        adapter.dropLayer(spec.layer);
      }
      voices.set(spec.layer, {
        role,
        spec,
        seq: createSequencer(plan.at),
        until: null,
      });
      adapter.rampLayer(spec.layer, 1, plan.at, plan.fadeSeconds);
    }

    arrangement = target;
    origin = plan.origin;
  }

  /**
   * A background tab starves the timer, and the schedule falls behind
   * the clock. Rather than flush a backlog of past-due notes, every
   * voice rejoins at the same fresh bar-grid origin — the mix is
   * unchanged, it has simply stopped being where it was.
   */
  function rejoin(now: number): void {
    origin = now + START_LEAD_SECONDS;
    for (const voice of voices.values()) {
      voice.seq = createSequencer(origin);
    }
  }

  function tick(): void {
    if (scene === null || !adapter.running) return;
    if (effectiveGain(mixer, "music") <= 0) {
      // Muted: drop everything so unmuting restarts cleanly instead of
      // flushing a backlog of past-due notes.
      clearMusic(0.05);
      return;
    }
    const now = adapter.now();

    if (
      voices.size > 0 &&
      [...voices.values()].every(
        (voice) => voice.seq.nextStepTime < now - LOOKAHEAD_SECONDS,
      )
    ) {
      rejoin(now);
    }

    const target = arrangementFor(scene);
    if (
      arrangement === null ||
      arrangement.themeId !== target.themeId ||
      arrangement.dayPhase !== target.dayPhase ||
      arrangement.mode !== target.mode
    ) {
      transition(target, now);
    }

    const horizon = now + LOOKAHEAD_SECONDS;
    for (const [key, voice] of [...voices]) {
      const limit = voice.until === null ? horizon : Math.min(horizon, voice.until);
      const due = collectDue(voice.spec, voice.seq, limit);
      voice.seq = due.state;
      for (const note of due.notes) {
        adapter.scheduleNote(note);
      }
      if (voice.until !== null && voice.until <= now) {
        voices.delete(key);
        adapter.dropLayer(key);
      }
    }
  }

  return {
    play(id: SoundId): void {
      if (effectiveGain(mixer, "sfx") <= 0) return;
      adapter.playPatch(SOUND_PATCHES[id]);
    },

    setMusicScene(next: MusicScene | null): void {
      if (sceneEquals(next, scene)) return;
      scene = next;
      if (next === null) clearMusic(MUSIC_FADE_SECONDS);
      ensureTimer();
      tick();
    },

    setMusicMode(mode: MusicMode): void {
      if (scene === null || scene.mode === mode) return;
      scene = { ...scene, mode };
      tick();
    },

    getMusicScene: () => scene,

    getMusicLayers: () =>
      [...voices.values()]
        .filter((voice) => voice.until === null)
        .map((voice) => voice.role),

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
